import { createClient } from '@supabase/supabase-js'
import { costVnd, startOfDayVN, DEFAULT_DAILY_BUDGET_VND } from './pricing'

let supabase = null

export function getSupabase() {
  if (!supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key || url === 'placeholder') return null
    supabase = createClient(url, key)
  }
  return supabase
}

/**
 * Kiểm tra kết nối Supabase. Trả về { ok, reason } để giao diện báo nguyên
 * nhân thật thay vì "TypeError: fetch failed".
 *
 * Lỗi mạng ở đây gần như luôn là một trong ba: dự án free bị tự tạm dừng sau
 * thời gian không dùng, URL sai, hoặc project đã xoá.
 */
export async function checkSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url || url === 'placeholder') return { ok: false, reason: 'NEXT_PUBLIC_SUPABASE_URL chưa cấu hình' }
  const sb = getSupabase()
  if (!sb) return { ok: false, reason: 'SUPABASE_SERVICE_ROLE_KEY chưa cấu hình' }
  try {
    const { error } = await sb.from('query_logs').select('id').limit(1)
    if (error) return { ok: false, reason: `Supabase trả lỗi: ${error.message}`, host: url }
    return { ok: true, host: url }
  } catch (e) {
    return {
      ok: false,
      host: url,
      reason:
        'Không kết nối được tới Supabase. Dự án Supabase gói free tự tạm dừng ' +
        'sau một thời gian không hoạt động — kiểm tra Dashboard và bấm Restore/Resume.',
      raw: e.message,
    }
  }
}

// ── Hạn mức theo NGÀY, tính bằng VND ────────────────────────────────────────
// Chi tiêu được cộng trực tiếp từ query_logs thay vì nuôi một bộ đếm riêng:
// query_logs đã có model + token + thời điểm, nên số liệu luôn khớp thực tế và
// TỰ RESET mỗi ngày do lọc theo mốc 0h — không cần cron dọn dẹp (bộ đếm
// token_used cũ chưa bao giờ được reset, và đó chính là lỗi cần tránh lặp lại).

/**
 * Chi tiêu hôm nay của một người (VND) và hạn mức của họ.
 * Trả về { spent, budget, remaining, blocked, ok }.
 * ok=false khi không đọc được Supabase — khi đó KHÔNG chặn người dùng.
 */
export async function getDailyUsage(email) {
  const sb = getSupabase()
  const fallback = { spent: 0, budget: DEFAULT_DAILY_BUDGET_VND, remaining: DEFAULT_DAILY_BUDGET_VND, blocked: false, ok: false }
  if (!sb) return fallback

  try {
    const { data: profile } = await sb
      .from('user_profiles')
      .select('daily_budget_vnd, quota_reset_at')
      .eq('email', email)
      .maybeSingle()

    const budget = profile?.daily_budget_vnd ?? DEFAULT_DAILY_BUDGET_VND

    // Admin bấm "Reset" -> chỉ tính từ thời điểm đó trở đi trong ngày
    const dayStart = startOfDayVN()
    const resetAt = profile?.quota_reset_at ? new Date(profile.quota_reset_at) : null
    const from = resetAt && resetAt > dayStart ? resetAt : dayStart

    const { data: rows, error } = await sb
      .from('query_logs')
      .select('model_used, input_tokens, output_tokens')
      .eq('user_email', email)
      .gte('created_at', from.toISOString())

    if (error) return { ...fallback, budget }

    const spent = (rows || []).reduce(
      (s, r) => s + costVnd(r.model_used, r.input_tokens || 0, r.output_tokens || 0),
      0
    )
    return {
      spent,
      budget,
      remaining: Math.max(0, budget - spent),
      blocked: budget > 0 && spent >= budget,
      ok: true,
    }
  } catch {
    // Supabase không kết nối được -> cho dùng tiếp, không khoá người dùng
    // chỉ vì hệ thống ghi log đang hỏng.
    return fallback
  }
}

/** Admin bấm Reset: bỏ qua phần đã tiêu hôm nay. */
export async function resetDailyQuota(email) {
  const sb = getSupabase()
  if (!sb) return false
  const { error } = await sb
    .from('user_profiles')
    .upsert({ email, quota_reset_at: new Date().toISOString() }, { onConflict: 'email' })
  if (error) console.error('[supabase] resetDailyQuota:', error.message)
  return !error
}

export async function updateDailyBudget(email, vnd) {
  const sb = getSupabase()
  if (!sb) return false
  const { error } = await sb
    .from('user_profiles')
    .upsert({ email, daily_budget_vnd: vnd }, { onConflict: 'email' })
  if (error) console.error('[supabase] updateDailyBudget:', error.message)
  return !error
}

export async function logQuery(data) {
  const sb = getSupabase()
  if (!sb) return null
  try {
    const { data: row, error } = await sb.from('query_logs').insert(data).select('id').single()
    // Ghi rõ ra log server: trước đây nơi gọi bọc .catch(() => null) nên lỗi
    // mạng bị nuốt hoàn toàn — Supabase chết mà không ai biết, và toàn bộ
    // lịch sử hỏi-đáp lặng lẽ không được lưu.
    if (error) console.error('[supabase] logQuery lỗi:', error.message)
    return row?.id ?? null
  } catch (e) {
    console.error('[supabase] logQuery KHÔNG kết nối được:', e.message)
    return null
  }
}

export async function getUserProfile(email) {
  const sb = getSupabase()
  if (!sb) return null
  const { data } = await sb.from('user_profiles').select('*').eq('email', email).single()
  return data
}

export async function upsertUserProfile(email, name) {
  const sb = getSupabase()
  if (!sb) return
  await sb.from('user_profiles').upsert(
    { email, full_name: name, token_quota: 50000, token_used: 0 },
    { onConflict: 'email', ignoreDuplicates: true }
  )
}

export async function incrementTokenUsage(email, inputTokens, outputTokens) {
  const sb = getSupabase()
  if (!sb) return
  const total = (inputTokens || 0) + (outputTokens || 0)
  if (total === 0) return
  await sb.rpc('increment_token_used', { p_email: email, p_tokens: total })
}

export async function updateFeedback(logId, feedback, note) {
  const sb = getSupabase()
  if (!sb) return
  await sb.from('query_logs').update({ feedback, feedback_note: note ?? null }).eq('id', logId)
}

export async function updateUserQuota(email, quota) {
  const sb = getSupabase()
  if (!sb) return
  await sb.from('user_profiles').upsert(
    { email, token_quota: quota, updated_at: new Date().toISOString() },
    { onConflict: 'email' }
  )
}

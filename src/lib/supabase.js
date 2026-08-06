import { createClient } from '@supabase/supabase-js'

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

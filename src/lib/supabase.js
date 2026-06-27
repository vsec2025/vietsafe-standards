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

// Ghi log mỗi lượt query
export async function logQuery(data) {
  const sb = getSupabase()
  if (!sb) return null
  const { data: row, error } = await sb.from('query_logs').insert(data).select('id').single()
  if (error) console.error('logQuery error:', error.message)
  return row?.id ?? null
}

// Lấy profile user (quota + role)
export async function getUserProfile(email) {
  const sb = getSupabase()
  if (!sb) return null
  const { data } = await sb.from('user_profiles').select('*').eq('email', email).single()
  return data
}

// Upsert profile khi user login lần đầu
export async function upsertUserProfile(email, name) {
  const sb = getSupabase()
  if (!sb) return
  await sb.from('user_profiles').upsert(
    { email, full_name: name, role: 'viewer', token_quota: 50000, token_used: 0 },
    { onConflict: 'email', ignoreDuplicates: true }
  )
}

// Tăng token_used
export async function incrementTokenUsage(email, inputTokens, outputTokens) {
  const sb = getSupabase()
  if (!sb) return
  const total = (inputTokens || 0) + (outputTokens || 0)
  await sb.rpc('increment_token_used', { p_email: email, p_tokens: total })
}

// Cập nhật feedback 👍/👎
export async function updateFeedback(logId, feedback, note) {
  const sb = getSupabase()
  if (!sb) return
  await sb.from('query_logs').update({ feedback, feedback_note: note ?? null }).eq('id', logId)
}

// Danh sách tất cả user (admin)
export async function listUsers() {
  const sb = getSupabase()
  if (!sb) return []
  const { data, error } = await sb.from('user_profiles').select('*').order('created_at', { ascending: false })
  if (error) console.error('listUsers error:', error.message)
  return data ?? []
}

// Cập nhật role
export async function updateUserRole(email, role) {
  const sb = getSupabase()
  if (!sb) return
  await sb.from('user_profiles').update({ role, updated_at: new Date().toISOString() }).eq('email', email)
}

// Cập nhật token quota
export async function updateUserQuota(email, quota) {
  const sb = getSupabase()
  if (!sb) return
  await sb.from('user_profiles').update({ token_quota: quota, updated_at: new Date().toISOString() }).eq('email', email)
}

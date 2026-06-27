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

export async function logQuery(data) {
  const sb = getSupabase()
  if (!sb) return null
  const { data: row, error } = await sb.from('query_logs').insert(data).select('id').single()
  if (error) console.error('logQuery error:', error.message)
  return row?.id ?? null
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

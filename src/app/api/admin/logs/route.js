import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'

/**
 * Lịch sử hỏi–đáp của toàn bộ người dùng (chỉ admin).
 * Đọc từ bảng query_logs — mọi lượt hỏi đã được ghi sẵn từ trước.
 *
 * Query params:
 *   user   — lọc theo email
 *   days   — số ngày gần đây (mặc định 30, tối đa 365)
 *   only   — 'nobasis' | 'thumbsdown'
 *   q      — tìm trong nội dung câu hỏi
 *   limit  — mặc định 100, tối đa 500
 *   offset — phân trang
 */
export async function GET(request) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
  }

  const sb = getSupabase()
  if (!sb) return NextResponse.json({ error: 'Supabase chưa cấu hình' }, { status: 500 })

  const sp = new URL(request.url).searchParams
  const days = Math.min(365, Math.max(1, parseInt(sp.get('days') ?? '30', 10)))
  const limit = Math.min(500, Math.max(1, parseInt(sp.get('limit') ?? '100', 10)))
  const offset = Math.max(0, parseInt(sp.get('offset') ?? '0', 10))
  const user = sp.get('user')
  const only = sp.get('only')
  const q = sp.get('q')
  const since = new Date(Date.now() - days * 86400000).toISOString()

  let query = sb
    .from('query_logs')
    .select(
      'id, created_at, user_email, query_text, answer_text, citations, mode, ' +
        'has_basis, feedback, feedback_note, model_used, input_tokens, output_tokens, latency_ms',
      { count: 'exact' }
    )
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (user) query = query.eq('user_email', user)
  if (only === 'nobasis') query = query.eq('has_basis', false)
  if (only === 'thumbsdown') query = query.eq('feedback', -1)
  if (q) query = query.ilike('query_text', `%${q}%`)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Thống kê tính trên toàn khoảng thời gian, không chỉ trang đang xem
  let statsQuery = sb
    .from('query_logs')
    .select('user_email, has_basis, feedback, input_tokens, output_tokens')
    .gte('created_at', since)
  if (user) statsQuery = statsQuery.eq('user_email', user)
  const { data: all } = await statsQuery

  const rows = all || []
  const byUser = {}
  for (const r of rows) {
    const u = (byUser[r.user_email] ||= { email: r.user_email, count: 0, basis: 0, down: 0, tokens: 0 })
    u.count++
    if (r.has_basis) u.basis++
    if (r.feedback === -1) u.down++
    u.tokens += (r.input_tokens || 0) + (r.output_tokens || 0)
  }

  return NextResponse.json({
    logs: data || [],
    total: count ?? 0,
    stats: {
      total: rows.length,
      has_basis_pct: rows.length ? Math.round((rows.filter((r) => r.has_basis).length / rows.length) * 100) : 0,
      thumbs_down: rows.filter((r) => r.feedback === -1).length,
      tokens: rows.reduce((s, r) => s + (r.input_tokens || 0) + (r.output_tokens || 0), 0),
      users: Object.values(byUser).sort((a, b) => b.count - a.count),
    },
  })
}

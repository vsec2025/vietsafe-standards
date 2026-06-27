import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAllUsers, getUser, setUser } from '@/lib/redis'
import { getSupabase, updateUserQuota } from '@/lib/supabase'
import { hash } from 'bcryptjs'

async function requireAdmin(session) {
  return session?.user?.role === 'admin'
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!await requireAdmin(session)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })

  // Redis: auth users (role, name, email)
  const redisUsers = await getAllUsers()

  // Supabase: token usage per email
  const sb = getSupabase()
  let quotaMap = {}
  if (sb) {
    const { data } = await sb.from('user_profiles').select('email, token_used, token_quota')
    if (data) data.forEach(r => { quotaMap[r.email] = r })
  }

  const users = redisUsers.map(u => ({
    email: u.email,
    full_name: u.name,
    role: u.role,
    token_used: quotaMap[u.email]?.token_used ?? 0,
    token_quota: quotaMap[u.email]?.token_quota ?? 50000,
    created_at: u.createdAt,
  }))

  return NextResponse.json({ users })
}

export async function PATCH(request) {
  const session = await getServerSession(authOptions)
  if (!await requireAdmin(session)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })

  const { email, role, token_quota } = await request.json()
  if (!email) return NextResponse.json({ error: 'Thiếu email' }, { status: 400 })

  if (role !== undefined) {
    if (!['viewer', 'editor', 'admin'].includes(role))
      return NextResponse.json({ error: 'Role không hợp lệ' }, { status: 400 })
    const existing = await getUser(email)
    if (!existing) return NextResponse.json({ error: 'User không tồn tại' }, { status: 404 })
    const user = typeof existing === 'string' ? JSON.parse(existing) : existing
    await setUser(email, { ...user, role })
  }

  if (token_quota !== undefined) {
    const q = parseInt(token_quota, 10)
    if (isNaN(q) || q < 0) return NextResponse.json({ error: 'Quota không hợp lệ' }, { status: 400 })
    await updateUserQuota(email, q)
  }

  return NextResponse.json({ ok: true })
}

export async function POST(request) {
  const session = await getServerSession(authOptions)
  if (!await requireAdmin(session)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })

  const { email, name, password, role = 'viewer' } = await request.json()
  if (!email || !password) return NextResponse.json({ error: 'Thiếu email hoặc mật khẩu' }, { status: 400 })
  if (!['viewer', 'editor', 'admin'].includes(role))
    return NextResponse.json({ error: 'Role không hợp lệ' }, { status: 400 })

  const existing = await getUser(email)
  if (existing) return NextResponse.json({ error: 'Email đã tồn tại' }, { status: 409 })

  const hashed = await hash(password, 12)
  await setUser(email, { email, name: name || email, password: hashed, role, createdAt: new Date().toISOString() })

  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAllUsers, getUser, setUser, deleteUser } from '@/lib/redis'
import { getSupabase, updateUserQuota } from '@/lib/supabase'
import { normalizeEmail } from '@/lib/auth'
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
    has_password: Boolean(u.hasPassword),
    token_used: quotaMap[u.email]?.token_used ?? 0,
    token_quota: quotaMap[u.email]?.token_quota ?? 50000,
    created_at: u.createdAt,
  }))

  return NextResponse.json({ users })
}

export async function PATCH(request) {
  const session = await getServerSession(authOptions)
  if (!await requireAdmin(session)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })

  const body = await request.json()
  const email = normalizeEmail(body.email)
  const { role, token_quota } = body
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

  const body = await request.json()
  const email = normalizeEmail(body.email)
  const { name, password, role = 'viewer' } = body

  if (!email) return NextResponse.json({ error: 'Thiếu email' }, { status: 400 })
  if (!['viewer', 'editor', 'admin'].includes(role))
    return NextResponse.json({ error: 'Role không hợp lệ' }, { status: 400 })

  const existing = await getUser(email)
  if (existing) return NextResponse.json({ error: 'Email đã tồn tại' }, { status: 409 })

  // Mật khẩu là tuỳ chọn: bỏ trống = tài khoản chỉ đăng nhập bằng Google
  const record = { email, name: name || email, role, createdAt: new Date().toISOString() }
  if (password) record.password = await hash(password, 12)

  await setUser(email, record)

  return NextResponse.json({ ok: true })
}

export async function DELETE(request) {
  const session = await getServerSession(authOptions)
  if (!await requireAdmin(session)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })

  const body = await request.json()
  const email = normalizeEmail(body.email)
  if (!email) return NextResponse.json({ error: 'Thiếu email' }, { status: 400 })

  // Không cho admin tự xoá chính mình (tránh khoá mất quyền quản trị)
  if (email === normalizeEmail(session.user.email))
    return NextResponse.json({ error: 'Không thể xoá tài khoản đang đăng nhập' }, { status: 400 })

  const existing = await getUser(email)
  if (!existing) return NextResponse.json({ error: 'User không tồn tại' }, { status: 404 })

  await deleteUser(email)

  return NextResponse.json({ ok: true })
}

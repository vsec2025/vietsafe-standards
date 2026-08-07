import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAllUsers, getUser, setUser, deleteUser } from '@/lib/redis'
import { getDailyUsage, resetDailyQuota, updateDailyBudget } from '@/lib/supabase'
import { DEFAULT_DAILY_BUDGET_VND } from '@/lib/pricing'
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

  // Chi tiêu hôm nay (VND) tính từ query_logs cho từng người
  const usages = await Promise.all(
    redisUsers.map((u) => getDailyUsage(u.email).then((d) => [u.email, d]))
  )
  const usageMap = Object.fromEntries(usages)

  const users = redisUsers.map((u) => {
    const d = usageMap[u.email] || {}
    return {
      email: u.email,
      full_name: u.name,
      role: u.role,
      has_password: Boolean(u.hasPassword),
      created_at: u.createdAt,
      spent_vnd: Math.round(d.spent ?? 0),
      budget_vnd: d.budget ?? DEFAULT_DAILY_BUDGET_VND,
      blocked: Boolean(d.blocked),
    }
  })

  return NextResponse.json({ users, default_budget_vnd: DEFAULT_DAILY_BUDGET_VND })
}

export async function PATCH(request) {
  const session = await getServerSession(authOptions)
  if (!await requireAdmin(session)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })

  const body = await request.json()
  const email = normalizeEmail(body.email)
  const { role } = body
  if (!email) return NextResponse.json({ error: 'Thiếu email' }, { status: 400 })

  if (role !== undefined) {
    if (!['viewer', 'editor', 'admin'].includes(role))
      return NextResponse.json({ error: 'Role không hợp lệ' }, { status: 400 })
    const existing = await getUser(email)
    if (!existing) return NextResponse.json({ error: 'User không tồn tại' }, { status: 404 })
    const user = typeof existing === 'string' ? JSON.parse(existing) : existing
    await setUser(email, { ...user, role })
  }

  // Đặt lại hạn mức hôm nay: bỏ qua phần đã tiêu, không xoá log
  if (body.action === 'reset_quota') {
    const ok = await resetDailyQuota(email)
    if (!ok) return NextResponse.json({ error: 'Không ghi được vào Supabase' }, { status: 503 })
  }

  if (body.budget_vnd !== undefined) {
    const v = parseInt(body.budget_vnd, 10)
    if (isNaN(v) || v < 0) return NextResponse.json({ error: 'Hạn mức không hợp lệ' }, { status: 400 })
    const ok = await updateDailyBudget(email, v)
    if (!ok) return NextResponse.json({ error: 'Không ghi được vào Supabase' }, { status: 503 })
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

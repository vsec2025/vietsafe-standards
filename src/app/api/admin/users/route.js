import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listUsers, updateUserRole, updateUserQuota } from '@/lib/supabase'

async function requireAdmin(session) {
  if (!session?.user) return false
  return ['admin'].includes(session.user.role)
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!await requireAdmin(session)) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
  const users = await listUsers()
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
    await updateUserRole(email, role)
  }

  if (token_quota !== undefined) {
    const q = parseInt(token_quota, 10)
    if (isNaN(q) || q < 0) return NextResponse.json({ error: 'Quota không hợp lệ' }, { status: 400 })
    await updateUserQuota(email, q)
  }

  return NextResponse.json({ ok: true })
}

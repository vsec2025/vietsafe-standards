import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  listConversations,
  getConversation,
  saveConversation,
  renameConversation,
  deleteConversation,
} from '@/lib/redis'

// Mặc định hội thoại thuộc về người đang đăng nhập. Chỉ admin mới được đọc
// của người khác (tham số ?user=), phục vụ quản lý nội bộ.
async function requireUser() {
  const session = await getServerSession(authOptions)
  return session?.user?.email || null
}

async function resolveOwner(request) {
  const session = await getServerSession(authOptions)
  const self = session?.user?.email
  if (!self) return { error: 'Chưa đăng nhập', status: 401 }

  const asUser = new URL(request.url).searchParams.get('user')
  if (!asUser || asUser === self) return { owner: self }

  if (session.user.role !== 'admin') {
    return { error: 'Không có quyền', status: 403 }
  }
  return { owner: asUser.trim().toLowerCase() }
}

/** GET /api/conversations                  -> danh sách của mình
 *  GET /api/conversations?id=xxx           -> tin nhắn của một hội thoại
 *  GET /api/conversations?user=a@b.com     -> danh sách của người khác (admin)
 *  GET /api/conversations?user=..&id=..    -> tin nhắn của người khác (admin) */
export async function GET(request) {
  const { owner, error, status } = await resolveOwner(request)
  if (error) return NextResponse.json({ error }, { status })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) {
    return NextResponse.json({ owner, conversations: await listConversations(owner) })
  }
  const messages = await getConversation(owner, id)
  if (!messages) return NextResponse.json({ error: 'Không tìm thấy hội thoại' }, { status: 404 })
  return NextResponse.json({ owner, id, messages })
}

/** POST -> lưu (tạo mới nếu chưa có id) */
export async function POST(request) {
  const email = await requireUser()
  if (!email) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { id, messages, title } = await request.json()
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: 'messages không hợp lệ' }, { status: 400 })
  }
  const convId = id || `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  const entry = await saveConversation(email, convId, messages, title)
  if (!entry) return NextResponse.json({ error: 'Redis chưa cấu hình' }, { status: 500 })
  return NextResponse.json({ conversation: entry })
}

/** PATCH -> đổi tên */
export async function PATCH(request) {
  const email = await requireUser()
  if (!email) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { id, title } = await request.json()
  if (!id || !title?.trim()) {
    return NextResponse.json({ error: 'Thiếu id hoặc tiêu đề' }, { status: 400 })
  }
  const ok = await renameConversation(email, id, title.trim().slice(0, 120))
  if (!ok) return NextResponse.json({ error: 'Không tìm thấy hội thoại' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

/** DELETE -> xoá */
export async function DELETE(request) {
  const email = await requireUser()
  if (!email) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })
  await deleteConversation(email, id)
  return NextResponse.json({ ok: true })
}

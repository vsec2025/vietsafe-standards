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

// Hội thoại luôn thuộc về người đang đăng nhập — không nhận email từ client,
// nếu không ai cũng đọc được lịch sử chat của người khác.
async function requireUser() {
  const session = await getServerSession(authOptions)
  return session?.user?.email || null
}

/** GET /api/conversations          -> danh sách
 *  GET /api/conversations?id=xxx   -> tin nhắn của một hội thoại */
export async function GET(request) {
  const email = await requireUser()
  if (!email) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) {
    return NextResponse.json({ conversations: await listConversations(email) })
  }
  const messages = await getConversation(email, id)
  if (!messages) return NextResponse.json({ error: 'Không tìm thấy hội thoại' }, { status: 404 })
  return NextResponse.json({ id, messages })
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

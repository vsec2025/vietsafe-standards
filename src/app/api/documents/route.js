import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listDocuments, DOC_STATUSES } from '@/lib/documents'
import { patchDocMeta } from '@/lib/redis'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }
    const documents = await listDocuments()
    return NextResponse.json({ documents })
  } catch (err) {
    console.error('List documents error:', err)
    return NextResponse.json({ error: 'Lỗi tải danh sách' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || !['admin', 'editor'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
    }

    const { action, document } = await request.json()

    // Chỉ còn 'update': văn bản xuất hiện trong danh sách khi có mặt trong
    // corpus (thông qua Upload), nên không còn thao tác 'add' thủ công.
    if (action !== 'update') {
      return NextResponse.json({ error: 'Action không hợp lệ' }, { status: 400 })
    }

    const filename = document?.filename
    if (!filename) {
      return NextResponse.json({ error: 'Thiếu filename' }, { status: 400 })
    }
    if (document.status && !DOC_STATUSES.includes(document.status)) {
      return NextResponse.json({ error: 'Trạng thái không hợp lệ' }, { status: 400 })
    }

    const patch = { updatedAt: new Date().toISOString() }
    if (document.title !== undefined) patch.title = document.title
    if (document.status !== undefined) patch.status = document.status

    await patchDocMeta(filename, patch)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Update document error:', err)
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 })
  }
}

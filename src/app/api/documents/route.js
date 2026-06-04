import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDocuments, setDocuments } from '@/lib/redis'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }
    const docs = await getDocuments()
    return NextResponse.json({ documents: docs })
  } catch (err) {
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
    const docs = await getDocuments() || []

    if (action === 'add') {
      const newDoc = {
        id: `doc_${Date.now()}`,
        title: document.title,
        filename: document.filename,
        status: document.status || 'active',
        uploadedBy: session.user.email,
        uploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      docs.push(newDoc)
      await setDocuments(docs)
      return NextResponse.json({ document: newDoc })
    }

    if (action === 'update' && document?.id) {
      const idx = docs.findIndex(d => d.id === document.id)
      if (idx === -1) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 })
      docs[idx] = { ...docs[idx], ...document, updatedAt: new Date().toISOString() }
      await setDocuments(docs)
      return NextResponse.json({ document: docs[idx] })
    }

    if (action === 'delete' && document?.id) {
      const filtered = docs.filter(d => d.id !== document.id)
      await setDocuments(filtered)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Action không hợp lệ' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 })
  }
}

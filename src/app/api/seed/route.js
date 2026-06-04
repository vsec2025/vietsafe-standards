import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { getRedis } from '@/lib/redis'

export async function POST(request) {
  try {
    const { secret } = await request.json()
    if (secret !== process.env.NEXTAUTH_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const r = getRedis()
    if (!r) {
      return NextResponse.json({ error: 'Redis not configured' }, { status: 500 })
    }

    // Create admin user
    const adminPassword = await hash('CongtyVSEC@2025', 12)
    await r.set('user:namnt@vnsec.com.vn', JSON.stringify({
      email: 'namnt@vnsec.com.vn',
      name: 'Admin VIETSAFE',
      password: adminPassword,
      role: 'admin',
      createdAt: new Date().toISOString()
    }))

    // Create demo editor
    const editorPassword = await hash('Editor@2025', 12)
    await r.set('user:editor@vnsec.com.vn', JSON.stringify({
      email: 'editor@vnsec.com.vn',
      name: 'Editor VIETSAFE',
      password: editorPassword,
      role: 'editor',
      createdAt: new Date().toISOString()
    }))

    // Create demo viewer
    const viewerPassword = await hash('Viewer@2025', 12)
    await r.set('user:viewer@vnsec.com.vn', JSON.stringify({
      email: 'viewer@vnsec.com.vn',
      name: 'Viewer VIETSAFE',
      password: viewerPassword,
      role: 'viewer',
      createdAt: new Date().toISOString()
    }))

    // Seed document list
    await r.set('documents:list', JSON.stringify([
      {
        id: 'doc_luat55',
        title: 'Luật Phòng cháy, chữa cháy và Cứu nạn, cứu hộ (Luật số 55/2024/QH15)',
        filename: 'luat-55-2024.md',
        status: 'active',
        uploadedBy: 'namnt@vnsec.com.vn',
        uploadedAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      },
      {
        id: 'doc_qcvn06',
        title: 'QCVN 06:2022/BXD — Quy chuẩn kỹ thuật quốc gia về An toàn cháy cho nhà và công trình',
        filename: 'qcvn-06-2022.md',
        status: 'active',
        uploadedBy: 'namnt@vnsec.com.vn',
        uploadedAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      },
      {
        id: 'doc_tcvn7336',
        title: 'TCVN 7336:2021 — Phòng cháy chữa cháy - Hệ thống sprinkler tự động - Yêu cầu thiết kế và lắp đặt',
        filename: 'tcvn-7336-2021.md',
        status: 'active',
        uploadedBy: 'namnt@vnsec.com.vn',
        uploadedAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      }
    ]))

    return NextResponse.json({ 
      success: true, 
      message: 'Đã tạo 3 users (admin/editor/viewer) và 3 documents' 
    })
  } catch (err) {
    console.error('Seed error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

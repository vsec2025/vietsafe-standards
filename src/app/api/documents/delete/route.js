import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { patchDocMeta } from '@/lib/redis'

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || !['admin', 'editor'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
    }

    const { filename } = await request.json()
    if (!filename) return NextResponse.json({ error: 'Thiếu filename' }, { status: 400 })

    const token = process.env.GITHUB_TOKEN
    const repo = process.env.GITHUB_REPO || 'vsec2025/vietsafe-standards'
    if (!token) {
      return NextResponse.json({ error: 'Chưa cấu hình GITHUB_TOKEN' }, { status: 500 })
    }

    // Xoá file nguồn trong raw/. Pipeline sẽ đồng bộ data/clean/ theo raw/ và
    // dựng lại chunks — đó mới là thứ thực sự gỡ văn bản khỏi corpus.
    const path = `raw/${filename}`
    const url = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    }

    const getRes = await fetch(url, { headers })
    if (getRes.status === 404) {
      return NextResponse.json(
        { error: `Không tìm thấy "${filename}" trong raw/ trên GitHub.` },
        { status: 404 }
      )
    }
    if (!getRes.ok) {
      console.error('GitHub get error:', await getRes.text())
      return NextResponse.json({ error: 'Không đọc được file trên GitHub' }, { status: 502 })
    }

    const fileData = await getRes.json()
    const delRes = await fetch(url, {
      method: 'DELETE',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `delete: ${filename} by ${session.user.email}`,
        sha: fileData.sha,
      }),
    })

    // Trước đây lỗi xoá bị nuốt trong try/catch và vẫn báo thành công cho người
    // dùng, nên văn bản "đã xoá" âm thầm ở lại trong corpus.
    if (!delRes.ok) {
      console.error('GitHub delete error:', await delRes.text())
      return NextResponse.json({ error: 'GitHub từ chối xoá file' }, { status: 502 })
    }

    // Đánh dấu đã xoá để giao diện ẩn ngay, không phải chờ pipeline + deploy.
    await patchDocMeta(filename, {
      deletedAt: new Date().toISOString(),
      deletedBy: session.user.email,
    })

    return NextResponse.json({
      success: true,
      message: `Đã xoá "${filename}". Pipeline đang dựng lại corpus (1-2 phút).`,
    })
  } catch (err) {
    console.error('Delete document error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Base64 làm phình nội dung ~33% khi gửi lên GitHub, cộng thêm thời gian gọi
// API — cho hàm nhiều thời gian hơn mặc định để file lớn không bị cắt ngang.
export const maxDuration = 60

// Vercel chặn request body quá 4,5 MB ở tầng hạ tầng: hàm không hề được gọi
// và trình duyệt chỉ thấy "Failed to fetch". Chặn sớm với thông báo rõ ràng.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || !['admin', 'editor'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || !file.name.endsWith('.md')) {
      return NextResponse.json({ error: 'Chỉ chấp nhận file .md' }, { status: 400 })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1)
      return NextResponse.json(
        { error: `File ${mb} MB — vượt giới hạn 4 MB của Vercel. Hãy tách văn bản thành nhiều phần rồi upload lần lượt.` },
        { status: 413 }
      )
    }

    const content = await file.text()
    if (!content.trim()) {
      return NextResponse.json({ error: 'File rỗng' }, { status: 400 })
    }

    const token = process.env.GITHUB_TOKEN
    const repo = process.env.GITHUB_REPO || 'vsec2025/vietsafe-standards'
    
    if (!token) {
      return NextResponse.json({ error: 'Chưa cấu hình GITHUB_TOKEN' }, { status: 500 })
    }

    const path = `raw/${file.name}`
    const base64Content = Buffer.from(content).toString('base64')

    // Check if file exists (to get SHA for update)
    let sha = null
    try {
      const checkRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' }
      })
      if (checkRes.ok) {
        const existing = await checkRes.json()
        sha = existing.sha
      }
    } catch (e) { /* file doesn't exist */ }

    // Create or update file on GitHub
    const commitRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `upload: ${file.name} by ${session.user.email}`,
        content: base64Content,
        ...(sha ? { sha } : {})
      })
    })

    if (!commitRes.ok) {
      const err = await commitRes.text()
      console.error('GitHub API error:', err)
      return NextResponse.json({ error: 'Lỗi upload lên GitHub' }, { status: 502 })
    }

    // Văn bản xuất hiện trong danh sách khi pipeline sinh chunk cho nó — danh
    // sách được suy từ corpus, không lưu riêng trong Redis nữa. Ở đây chỉ ghi
    // metadata của người dùng, và gỡ cờ đã-xoá nếu đây là lần upload lại.
    try {
      const { patchDocMeta } = await import('@/lib/redis')
      const now = new Date().toISOString()
      await patchDocMeta(file.name, {
        uploadedBy: session.user.email,
        uploadedAt: now,
        updatedAt: now,
        deletedAt: null,
        deletedBy: null,
      })
    } catch (e) {
      console.error('Redis doc meta update error:', e)
    }

    return NextResponse.json({
      success: true,
      message: `Đã upload "${file.name}". Pipeline sẽ tự động xử lý trong 1-2 phút.`,
      filename: file.name
    })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Lỗi hệ thống: ' + err.message }, { status: 500 })
  }
}

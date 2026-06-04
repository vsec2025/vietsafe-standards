import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

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

    // Add document to Redis list
    try {
      const { getDocuments, setDocuments } = await import('@/lib/redis')
      const docs = await getDocuments() || []
      const existingIdx = docs.findIndex(d => d.filename === file.name)
      const newDoc = {
        id: `doc_${Date.now()}`,
        title: file.name.replace('.md', '').replace(/[-_]/g, ' '),
        filename: file.name,
        status: 'active',
        uploadedBy: session.user.email,
        uploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      if (existingIdx >= 0) {
        docs[existingIdx] = { ...docs[existingIdx], updatedAt: new Date().toISOString() }
      } else {
        docs.push(newDoc)
      }
      await setDocuments(docs)
    } catch (e) {
      console.error('Redis doc list update error:', e)
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

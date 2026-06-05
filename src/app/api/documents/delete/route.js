import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDocuments, setDocuments } from '@/lib/redis'

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || !['admin', 'editor'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
    }

    const { docId, filename } = await request.json()
    if (!docId) return NextResponse.json({ error: 'Thiếu docId' }, { status: 400 })

    // 1. Remove from Redis document list
    const docs = await getDocuments() || []
    const filtered = docs.filter(d => d.id !== docId)
    await setDocuments(filtered)

    // 2. Delete file from GitHub -> triggers pipeline rebuild
    if (filename) {
      const token = process.env.GITHUB_TOKEN
      const repo = process.env.GITHUB_REPO || 'vsec2025/vietsafe-standards'
      if (token) {
        try {
          const path = `raw/${filename}`
          const getRes = await fetch(
            `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`,
            { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' } }
          )
          if (getRes.ok) {
            const fileData = await getRes.json()
            await fetch(
              `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}`,
              {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: `delete: ${filename} by ${session.user.email}`, sha: fileData.sha })
              }
            )
          }
        } catch (e) { console.error('GitHub delete error:', e) }
      }
    }

    return NextResponse.json({ success: true, message: `Đã xóa "${filename}". Pipeline sẽ rebuild chunks.` })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

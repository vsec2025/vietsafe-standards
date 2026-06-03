import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getRedis, keys } from '@/lib/redis'
import { clearIndexCache } from '@/lib/search'
import { DocMeta } from '@/types'

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const role = (session.user as any).role
  if (!['admin', 'editor'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  const formData = await req.formData()
  const file = formData.get('file') as File
  const metaJson = formData.get('meta') as string
  
  if (!file || !file.name.endsWith('.md')) {
    return NextResponse.json({ error: 'Chỉ chấp nhận file .md' }, { status: 400 })
  }
  
  const meta: Omit<DocMeta, 'uploaded_by' | 'uploaded_at'> = JSON.parse(metaJson)
  
  // Gọi GitHub API để upload file
  const content = await file.arrayBuffer()
  const base64 = Buffer.from(content).toString('base64')
  const fileName = file.name
  
  const githubToken = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO || 'vsec2025/vietsafe-standards'
  
  // Kiểm tra file đã tồn tại chưa (để lấy SHA)
  const checkRes = await fetch(
    `https://api.github.com/repos/${repo}/contents/raw/${fileName}`,
    { headers: { Authorization: `token ${githubToken}` } }
  )
  const checkData = checkRes.ok ? await checkRes.json() : null
  
  const uploadBody: any = {
    message: `upload: ${meta.so_hieu} by ${session.user?.email}`,
    content: base64,
  }
  if (checkData?.sha) uploadBody.sha = checkData.sha
  
  const uploadRes = await fetch(
    `https://api.github.com/repos/${repo}/contents/raw/${fileName}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `token ${githubToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(uploadBody),
    }
  )
  
  if (!uploadRes.ok) {
    const err = await uploadRes.json()
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
  
  // Lưu metadata vào Redis
  const redis = getRedis()
  const docMeta: DocMeta = {
    ...meta,
    file_name: fileName,
    total_chunks: 0,
    uploaded_by: (session.user as any).id,
    uploaded_at: new Date().toISOString(),
  }
  
  await Promise.all([
    redis.set(keys.docMeta(meta.so_hieu), JSON.stringify(docMeta)),
    redis.sadd(keys.allDocs(), meta.so_hieu),
  ])
  
  // Nếu file này sửa đổi văn bản khác → cập nhật trạng thái văn bản gốc
  if (meta.sua_doi_cho) {
    const originalKey = keys.docMeta(meta.sua_doi_cho)
    const original = await redis.get<any>(originalKey)
    if (original) {
      original.trang_thai = 'da_sua_doi'
      await redis.set(originalKey, JSON.stringify(original))
    }
  }
  
  // Clear search index cache
  clearIndexCache()
  
  return NextResponse.json({ 
    success: true, 
    message: 'Upload thành công. Pipeline đang xử lý...',
    fileName 
  })
}

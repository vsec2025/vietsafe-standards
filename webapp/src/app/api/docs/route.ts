import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getRedis, keys } from '@/lib/redis'
import { DocMeta } from '@/types'

export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const redis = getRedis()
  const soHieuList = await redis.smembers(keys.allDocs())
  
  if (!soHieuList.length) {
    // Fallback: đọc từ GitHub index.json
    const baseUrl = process.env.GITHUB_RAW_URL || 
      'https://raw.githubusercontent.com/vsec2025/vietsafe-standards/main'
    const res = await fetch(`${baseUrl}/data/index.json`, { next: { revalidate: 60 } })
    const data = res.ok ? await res.json() : { van_ban: [] }
    return NextResponse.json({ docs: data.van_ban || [] })
  }
  
  const docs = await Promise.all(
    soHieuList.map(sh => redis.get<DocMeta>(keys.docMeta(sh as string)))
  )
  
  return NextResponse.json({ docs: docs.filter(Boolean) })
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { searchDocuments, exactSearch } from '@/lib/search'

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { query, limit, exact } = await request.json()
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Vui lòng nhập từ khóa tìm kiếm' }, { status: 400 })
    }
    
    let results
    if (exact) {
      results = await exactSearch(query.trim(), limit || 20)
    } else {
      results = await searchDocuments(query.trim(), limit || 20)
    }
    
    return NextResponse.json({ results, total: results.length })
  } catch (err) {
    console.error('Search error:', err)
    return NextResponse.json({ error: 'Lỗi tìm kiếm' }, { status: 500 })
  }
}

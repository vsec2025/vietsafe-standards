import { NextResponse } from 'next/server'
import { searchDocuments } from '@/lib/search'

export async function POST(request) {
  try {
    const { query, limit } = await request.json()
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Vui lòng nhập từ khóa tìm kiếm' }, { status: 400 })
    }
    const results = await searchDocuments(query.trim(), limit || 10)
    return NextResponse.json({ results, total: results.length })
  } catch (err) {
    console.error('Search error:', err)
    return NextResponse.json({ error: 'Lỗi tìm kiếm' }, { status: 500 })
  }
}

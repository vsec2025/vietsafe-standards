import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { search } from '@/lib/search'
import { DocStatus } from '@/types'

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const { query, topK = 5, includeExpired = false } = await req.json()
  if (!query?.trim()) return NextResponse.json({ results: [] })
  
  const statusFilter: DocStatus[] = includeExpired 
    ? ['con_hieu_luc', 'da_sua_doi', 'het_hieu_luc', 'cho_hieu_luc']
    : ['con_hieu_luc', 'da_sua_doi']
  
  const results = await search(query, topK, statusFilter)
  return NextResponse.json({ results })
}

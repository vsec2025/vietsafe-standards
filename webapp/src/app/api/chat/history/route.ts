import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getRedis, keys, getVNMonth } from '@/lib/redis'

export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month') || getVNMonth()
  const redis = getRedis()
  const messages = await redis.lrange(keys.chat(userId, month), 0, 99)
  const parsed = messages
    .map(m => { try { return JSON.parse(m as string) } catch { return null } })
    .filter(Boolean).reverse()
  return NextResponse.json({ messages: parsed, month })
}

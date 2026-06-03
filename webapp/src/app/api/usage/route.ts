import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getUsage } from '@/lib/usage'

export async function GET(req: NextRequest) {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const usage = await getUsage(userId)
  return NextResponse.json({ usage })
}

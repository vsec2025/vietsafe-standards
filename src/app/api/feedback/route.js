import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { updateFeedback } from '@/lib/supabase'

export async function POST(request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
  }

  const { log_id, feedback, note } = await request.json()
  if (!log_id || ![-1, 1].includes(feedback)) {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  }

  await updateFeedback(log_id, feedback, note)
  return NextResponse.json({ ok: true })
}

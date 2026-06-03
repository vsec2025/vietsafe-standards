import { NextRequest, NextResponse } from 'next/server'
import { getRedis, keys } from '@/lib/redis'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  const { secret } = await req.json()
  if (secret !== 'vietsafe-init-2025') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  const redis = getRedis()
  const existing = await redis.get(keys.userByUsername('namnt@vnsec.com.vn'))
  if (existing) {
    return NextResponse.json({ message: 'Admin already exists' })
  }
  
  const passwordHash = await bcrypt.hash('CongtyVSEC@2025', 12)
  const userId = 'usr_admin_001'
  const userData = {
    id: userId,
    username: 'namnt@vnsec.com.vn',
    role: 'admin',
    displayName: 'Nguyễn Thanh Nam',
    createdAt: new Date().toISOString(),
    passwordHash,
  }
  
  await Promise.all([
    redis.set(keys.user(userId), JSON.stringify(userData)),
    redis.set(keys.userByUsername('namnt@vnsec.com.vn'), userId),
    redis.sadd(keys.allUsers(), userId),
  ])
  
  return NextResponse.json({ success: true, message: 'Admin user created' })
}

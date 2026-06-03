import { Redis } from '@upstash/redis'

let redis: Redis | null = null

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  }
  return redis
}

// Keys
export const keys = {
  user: (id: string) => `user:${id}`,
  userByUsername: (username: string) => `username:${username}`,
  allUsers: () => 'users:all',
  usage: (userId: string, date: string) => `usage:${userId}:${date}`,
  chat: (userId: string, month: string) => `chat:${userId}:${month}`,
  chatSession: (userId: string, sessionId: string) => `session:${userId}:${sessionId}`,
  docMeta: (soHieu: string) => `doc:${soHieu.replace(/\//g, '_')}`,
  allDocs: () => 'docs:all',
}

// Lấy ngày hiện tại VN (UTC+7)
export function getVNDate(): string {
  const now = new Date()
  const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  return vnTime.toISOString().split('T')[0]
}

// Lấy tháng hiện tại VN
export function getVNMonth(): string {
  return getVNDate().substring(0, 7) // YYYY-MM
}

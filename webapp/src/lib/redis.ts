import { kv } from '@vercel/kv'

export function getRedis() {
  return kv
}

export const keys = {
  user: (id: string) => `user:${id}`,
  userByUsername: (username: string) => `username:${username}`,
  allUsers: () => 'users:all',
  usage: (userId: string, date: string) => `usage:${userId}:${date}`,
  chat: (userId: string, month: string) => `chat:${userId}:${month}`,
  docMeta: (soHieu: string) => `doc:${soHieu.replace(/\//g, '_')}`,
  allDocs: () => 'docs:all',
}

export function getVNDate(): string {
  const now = new Date()
  const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  return vnTime.toISOString().split('T')[0]
}

export function getVNMonth(): string {
  return getVNDate().substring(0, 7)
}

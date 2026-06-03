// Upstash Redis via REST API - no SDK needed
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL!
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN!

async function redisCmd(...args: (string | number)[]): Promise<any> {
  const res = await fetch(`${REDIS_URL}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  const data = await res.json()
  return data.result
}

export function getRedis() {
  return {
    async get<T>(key: string): Promise<T | null> {
      const result = await redisCmd('GET', key)
      if (!result) return null
      try { return JSON.parse(result as string) as T }
      catch { return result as T }
    },
    async set(key: string, value: any, opts?: { ex?: number }): Promise<void> {
      const val = typeof value === 'string' ? value : JSON.stringify(value)
      if (opts?.ex) {
        await redisCmd('SET', key, val, 'EX', opts.ex)
      } else {
        await redisCmd('SET', key, val)
      }
    },
    async sadd(key: string, ...members: string[]): Promise<void> {
      await redisCmd('SADD', key, ...members)
    },
    async smembers(key: string): Promise<string[]> {
      const result = await redisCmd('SMEMBERS', key)
      return (result as string[]) || []
    },
    async lpush(key: string, ...values: string[]): Promise<void> {
      await redisCmd('LPUSH', key, ...values)
    },
    async ltrim(key: string, start: number, stop: number): Promise<void> {
      await redisCmd('LTRIM', key, start, stop)
    },
    async lrange(key: string, start: number, stop: number): Promise<string[]> {
      const result = await redisCmd('LRANGE', key, start, stop)
      return (result as string[]) || []
    },
    async del(key: string): Promise<void> {
      await redisCmd('DEL', key)
    },
  }
}

export const keys = {
  user: (id: string) => `user:${id}`,
  userByUsername: (username: string) => `username:${username}`,
  allUsers: () => 'users:all',
  usage: (userId: string, date: string) => `usage:${userId}:${date}`,
  chat: (userId: string, month: string) => `chat:${userId}:${month}`,
  docMeta: (soHieu: string) => `doc:${soHieu.replace(/\/g, '_').replace(/:/g, '_')}`,
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

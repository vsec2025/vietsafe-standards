// Upstash Redis via REST API
// Vercel tự inject: KV_REST_API_URL, KV_REST_API_TOKEN
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ""
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ""

async function redisCmd(...args: (string | number)[]): Promise<any> {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error("Redis not configured")
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Redis error ${res.status}: ${text}`)
  }
  const data = await res.json()
  return data.result
}

export function getRedis() {
  return {
    async get<T>(key: string): Promise<T | null> {
      const result = await redisCmd("GET", key)
      if (result === null || result === undefined) return null
      if (typeof result === "string") {
        try { return JSON.parse(result) as T } catch { return result as unknown as T }
      }
      return result as T
    },
    async set(key: string, value: any, opts?: { ex?: number }): Promise<void> {
      const val = typeof value === "string" ? value : JSON.stringify(value)
      if (opts?.ex) {
        await redisCmd("SET", key, val, "EX", opts.ex)
      } else {
        await redisCmd("SET", key, val)
      }
    },
    async sadd(key: string, ...members: string[]): Promise<void> {
      await redisCmd("SADD", key, ...members)
    },
    async smembers(key: string): Promise<string[]> {
      const result = await redisCmd("SMEMBERS", key)
      return Array.isArray(result) ? result : []
    },
    async lpush(key: string, ...values: string[]): Promise<void> {
      for (const v of values.reverse()) {
        await redisCmd("LPUSH", key, v)
      }
    },
    async ltrim(key: string, start: number, stop: number): Promise<void> {
      await redisCmd("LTRIM", key, start, stop)
    },
    async lrange(key: string, start: number, stop: number): Promise<string[]> {
      const result = await redisCmd("LRANGE", key, start, stop)
      return Array.isArray(result) ? result : []
    },
    async del(key: string): Promise<void> {
      await redisCmd("DEL", key)
    },
  }
}

export const keys = {
  user: (id: string) => `user:${id}`,
  userByUsername: (username: string) => `username:${username}`,
  allUsers: () => "users:all",
  usage: (userId: string, date: string) => `usage:${userId}:${date}`,
  chat: (userId: string, month: string) => `chat:${userId}:${month}`,
  docMeta: (soHieu: string) => `doc:${soHieu.replace(/\//g, "_").replace(/:/g, "_")}`,
  allDocs: () => "docs:all",
}

export function getVNDate(): string {
  const now = new Date()
  const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  return vnTime.toISOString().split("T")[0]
}

export function getVNMonth(): string {
  return getVNDate().substring(0, 7)
}

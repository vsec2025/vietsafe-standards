import { Redis } from '@upstash/redis'

let redis = null

export function getRedis() {
  if (!redis) {
    const url = process.env.KV_REST_API_URL
    const token = process.env.KV_REST_API_TOKEN
    if (!url || !token || url === 'placeholder') {
      return null
    }
    redis = new Redis({ url, token })
  }
  return redis
}

// User operations
export async function getUser(email) {
  const r = getRedis()
  if (!r) return null
  return await r.get(`user:${email}`)
}

export async function setUser(email, userData) {
  const r = getRedis()
  if (!r) return
  await r.set(`user:${email}`, JSON.stringify(userData))
}

export async function deleteUser(email) {
  const r = getRedis()
  if (!r) return
  await r.del(`user:${email}`)
}

export async function getAllUsers() {
  const r = getRedis()
  if (!r) return []
  const keys = await r.keys('user:*')
  if (!keys.length) return []
  const users = []
  for (const key of keys) {
    const data = await r.get(key)
    const user = typeof data === 'string' ? JSON.parse(data) : data
    // hasPassword: có đăng nhập mật khẩu hay chỉ đăng nhập Google
    users.push({ ...user, hasPassword: Boolean(user.password), password: undefined })
  }
  return users
}

// Document metadata
export async function getDocuments() {
  const r = getRedis()
  if (!r) return []
  const docs = await r.get('documents:list')
  if (!docs) return []
  return typeof docs === 'string' ? JSON.parse(docs) : docs
}

export async function setDocuments(docs) {
  const r = getRedis()
  if (!r) return
  await r.set('documents:list', JSON.stringify(docs))
}

// Chat history
export async function getChatHistory(userId, month) {
  const r = getRedis()
  if (!r) return []
  const key = `chat:${userId}:${month}`
  const data = await r.get(key)
  if (!data) return []
  return typeof data === 'string' ? JSON.parse(data) : data
}

export async function saveChatMessage(userId, month, messages) {
  const r = getRedis()
  if (!r) return
  const key = `chat:${userId}:${month}`
  await r.set(key, JSON.stringify(messages))
}

// Search data (chunks + index)
export async function getSearchData() {
  const r = getRedis()
  if (!r) return null
  const data = await r.get('search:data')
  if (!data) return null
  return typeof data === 'string' ? JSON.parse(data) : data
}

export async function setSearchData(data) {
  const r = getRedis()
  if (!r) return
  await r.set('search:data', JSON.stringify(data))
}

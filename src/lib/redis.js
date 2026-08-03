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

// ── Document metadata ───────────────────────────────────────────────────────
// Danh sách văn bản KHÔNG lưu ở Redis nữa — nó được suy trực tiếp từ corpus
// (data/chunks.jsonl), xem src/lib/documents.js. Redis chỉ giữ phần metadata
// mà người dùng chỉnh được và corpus không biết: trạng thái hiệu lực, tiêu đề
// tự đặt, ai upload, và cờ đã xoá.
//
// Khoá theo TÊN FILE THẬT trong raw/ — danh sách cũ dùng id tự sinh với tên
// file bịa (vd. 'luat-55-2024.md' trong khi file thật là 'luat55.md'), khiến
// nút Xoá gọi GitHub xoá một file không tồn tại.
const DOC_META_KEY = 'documents:meta'

export async function getDocMeta() {
  const r = getRedis()
  if (!r) return {}
  const data = await r.get(DOC_META_KEY)
  if (!data) return {}
  return typeof data === 'string' ? JSON.parse(data) : data
}

export async function setDocMeta(meta) {
  const r = getRedis()
  if (!r) return
  await r.set(DOC_META_KEY, JSON.stringify(meta))
}

export async function patchDocMeta(filename, patch) {
  const meta = await getDocMeta()
  meta[filename] = { ...(meta[filename] || {}), ...patch }
  await setDocMeta(meta)
  return meta[filename]
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

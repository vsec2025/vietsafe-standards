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

// ── Hội thoại (sidebar lịch sử chat) ────────────────────────────────────────
// Hai khoá cho mỗi người dùng:
//   conv:<email>        -> mục lục [{id, title, createdAt, updatedAt, count}]
//   conv:<email>:<id>   -> mảng tin nhắn của một hội thoại
// Tách mục lục ra để hiện danh sách bên sidebar mà không phải tải toàn bộ
// nội dung mọi hội thoại.
const convIndexKey = (email) => `conv:${email}`
const convKey = (email, id) => `conv:${email}:${id}`

/** Tiêu đề rút gọn từ câu hỏi đầu tiên. */
export function titleFromFirstMessage(messages) {
  const first = (messages || []).find((m) => m.role === 'user')
  const t = (first?.content || '').replace(/\s+/g, ' ').trim()
  if (!t) return 'Hội thoại mới'
  return t.length > 60 ? t.slice(0, 60).trimEnd() + '…' : t
}

export async function listConversations(email) {
  const r = getRedis()
  if (!r) return []
  const data = await r.get(convIndexKey(email))
  if (!data) return []
  const list = typeof data === 'string' ? JSON.parse(data) : data
  return Array.isArray(list) ? list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')) : []
}

export async function getConversation(email, id) {
  const r = getRedis()
  if (!r) return null
  const data = await r.get(convKey(email, id))
  if (!data) return null
  return typeof data === 'string' ? JSON.parse(data) : data
}

export async function saveConversation(email, id, messages, title) {
  const r = getRedis()
  if (!r) return null
  const now = new Date().toISOString()
  await r.set(convKey(email, id), JSON.stringify(messages))

  const list = await listConversations(email)
  const i = list.findIndex((c) => c.id === id)
  const entry = {
    id,
    title: title || (i >= 0 ? list[i].title : titleFromFirstMessage(messages)),
    createdAt: i >= 0 ? list[i].createdAt : now,
    updatedAt: now,
    count: messages.length,
  }
  if (i >= 0) list[i] = entry
  else list.unshift(entry)

  await r.set(convIndexKey(email), JSON.stringify(list))
  return entry
}

export async function renameConversation(email, id, title) {
  const r = getRedis()
  if (!r) return false
  const list = await listConversations(email)
  const i = list.findIndex((c) => c.id === id)
  if (i === -1) return false
  list[i] = { ...list[i], title, updatedAt: new Date().toISOString() }
  await r.set(convIndexKey(email), JSON.stringify(list))
  return true
}

export async function deleteConversation(email, id) {
  const r = getRedis()
  if (!r) return false
  await r.del(convKey(email, id))
  const list = (await listConversations(email)).filter((c) => c.id !== id)
  await r.set(convIndexKey(email), JSON.stringify(list))
  return true
}

// Chat history (theo tháng — giữ lại cho tương thích, không dùng cho sidebar)
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

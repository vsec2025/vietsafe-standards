#!/usr/bin/env node
// VSEC-AI Corpus Ingestion — đồng bộ data/chunks.jsonl → Upstash Vector
//
// Đồng bộ HAI CHIỀU, không chỉ thêm vào:
//   - chunk mới / đã đổi nội dung  -> embed rồi upsert
//   - chunk không đổi              -> bỏ qua (tiết kiệm chi phí embedding)
//   - vector không còn trong corpus -> XOÁ
//
// Chiều xoá là bắt buộc: bản trước chỉ upsert, nên văn bản đã gỡ khỏi corpus
// vẫn để lại vector trên Upstash và tiếp tục được trả về trong tìm kiếm ngữ
// nghĩa — sai lệch này không nhìn thấy được vì vector nằm trên đám mây.
//
// Yêu cầu: GOOGLE_API_KEY, UPSTASH_VECTOR_REST_URL, UPSTASH_VECTOR_REST_TOKEN
//
// Chạy: node scripts/ingest-corpus.mjs
//       node scripts/ingest-corpus.mjs --reset   (xoá sạch index rồi nạp lại)

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createHash } from 'crypto'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, '..')

// Load .env.local
try {
  readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n').forEach((line) => {
    const eq = line.indexOf('=')
    if (eq > 0 && !line.startsWith('#')) {
      const k = line.slice(0, eq).trim()
      let v = line.slice(eq + 1).trim()
      // vercel env pull bọc giá trị trong dấu nháy kép
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
      if (k && !process.env[k]) process.env[k] = v
    }
  })
} catch {
  /* dùng env từ shell */
}

const GOOGLE_KEY = process.env.GOOGLE_API_KEY
const VEC_URL = process.env.UPSTASH_VECTOR_REST_URL
const VEC_TOKEN = process.env.UPSTASH_VECTOR_REST_TOKEN
const MODEL = 'models/gemini-embedding-001'
// Số chiều lấy theo index (đọc từ /info) — gói free Upstash tối đa 1536.
// Chỉ bản 3072 được model chuẩn hoá sẵn; các số chiều khác phải tự chuẩn hoá
// L2, nếu không cosine lệch và kết quả tìm kiếm kém đi trong im lặng.
let EMBED_DIM = parseInt(process.env.VSEC_EMBED_DIM ?? '1536', 10)

// Hạn mức Google free tier: 100 lượt embed/phút — và batchEmbedContents tính
// MỖI VĂN BẢN là một lượt, không phải mỗi lời gọi. Gửi 50 văn bản/lần thì chỉ
// 2 lần gọi là chạm trần. Đặt dưới 100 một chút cho an toàn.
const RPM = parseInt(process.env.VSEC_EMBED_RPM ?? '90', 10)
const EMBED_BATCH = Math.max(1, Math.min(50, RPM))
const VEC_BATCH = 100
const RESET = process.argv.includes('--reset')

for (const [k, v] of [
  ['GOOGLE_API_KEY', GOOGLE_KEY],
  ['UPSTASH_VECTOR_REST_URL', VEC_URL],
  ['UPSTASH_VECTOR_REST_TOKEN', VEC_TOKEN],
]) {
  if (!v || v === 'placeholder') {
    console.error(`❌  ${k} chưa được set`)
    process.exit(1)
  }
}

// ── Upstash Vector helpers ──────────────────────────────────────────────────
const vecHeaders = {
  Authorization: `Bearer ${VEC_TOKEN}`,
  'Content-Type': 'application/json',
}

async function vec(path, body) {
  const res = await fetch(`${VEC_URL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: vecHeaders,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

/** Liệt kê toàn bộ id + hash đang có trên index (phân trang bằng cursor). */
async function listExisting() {
  const existing = new Map() // id -> hash
  let cursor = '0'
  do {
    const d = await vec('/range', { cursor, limit: 200, includeMetadata: true })
    const r = d.result || {}
    for (const v of r.vectors || []) existing.set(v.id, v.metadata?.hash ?? null)
    cursor = r.nextCursor || ''
  } while (cursor)
  return existing
}

// ── Embedding ───────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Bộ điều tốc theo cửa sổ trượt 60 giây, đếm theo SỐ VĂN BẢN đã gửi.
const sentAt = []
async function throttle(n) {
  for (;;) {
    const now = Date.now()
    while (sentAt.length && now - sentAt[0] > 60_000) sentAt.shift()
    if (sentAt.length + n <= RPM) break
    const wait = 60_000 - (now - sentAt[0]) + 300
    process.stdout.write(`\r   ⏳ Chờ hạn mức Google ${Math.ceil(wait / 1000)}s...                    `)
    await sleep(wait)
  }
  const t = Date.now()
  for (let i = 0; i < n; i++) sentAt.push(t)
}

/** Lỗi hạn mức NGÀY — không thể chờ hết trong phiên chạy, phải dừng hẳn. */
class DailyQuotaError extends Error {}

/** Gọi embed có thử lại: 429 theo phút thì chờ rồi làm lại; theo ngày thì dừng. */
async function embedBatchSafe(texts, attempt = 0) {
  await throttle(texts.length)
  try {
    return await embedBatch(texts)
  } catch (e) {
    const msg = String(e.message || '')
    if (!/429|RESOURCE_EXHAUSTED/.test(msg)) throw e

    // Google trả retryDelay ~58s cho CẢ hạn mức ngày, nên bám theo con số đó
    // sẽ thử lại vô ích hàng giờ. Phân biệt bằng quotaId.
    if (/PerDay/i.test(msg)) {
      const lim = /"quotaValue":\s*"(\d+)"/.exec(msg)?.[1] ?? '1000'
      throw new DailyQuotaError(`Đã dùng hết hạn mức ${lim} lượt embed/ngày của gói free.`)
    }

    if (attempt >= 6) throw e
    const m = /retryDelay[^0-9]*([0-9.]+)s/.exec(msg)
    const wait = Math.ceil((m ? parseFloat(m[1]) : 60) * 1000) + 1500
    process.stdout.write(`\r   ⏳ Vượt hạn mức phút, chờ ${Math.ceil(wait / 1000)}s rồi thử lại...     `)
    await sleep(wait)
    sentAt.length = 0
    return embedBatchSafe(texts, attempt + 1)
  }
}

function normalize(vec) {
  let sum = 0
  for (const v of vec) sum += v * v
  const norm = Math.sqrt(sum)
  return !norm || !isFinite(norm) ? vec : vec.map((v) => v / norm)
}

async function embedBatch(texts) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${MODEL}:batchEmbedContents?key=${GOOGLE_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: MODEL,
          content: { parts: [{ text }] },
          outputDimensionality: EMBED_DIM,
        })),
      }),
    }
  )
  if (!res.ok) throw new Error(`Embed error: ${await res.text()}`)
  const d = await res.json()
  const vecs = d.embeddings.map((e) => e.values)
  return EMBED_DIM === 3072 ? vecs : vecs.map(normalize)
}

const hashOf = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 VSEC-AI — Đồng bộ corpus → Upstash Vector\n')

  const info = await vec('/info').catch((e) => {
    console.error(`❌  Không kết nối được Upstash Vector: ${e.message}`)
    process.exit(1)
  })
  const dimLabel = info.dimension
    ? `${info.dimension} chiều`
    : `chưa xác định (index rỗng) — dùng VSEC_EMBED_DIM=${EMBED_DIM}`
  console.log(`   Index: ${info.vectorCount ?? 0} vectors, ${dimLabel}`)

  // Bám theo số chiều THẬT của index thay vì ép một con số cứng — tránh
  // trường hợp đổi index (vd. xuống 1536 cho gói free) là script gãy.
  if (info.dimension) {
    if (info.dimension !== EMBED_DIM) {
      console.log(`   ℹ️   Dùng ${info.dimension} chiều theo index (VSEC_EMBED_DIM=${EMBED_DIM}).`)
      EMBED_DIM = info.dimension
    }
    if (EMBED_DIM < 128 || EMBED_DIM > 3072) {
      console.error(`\n❌  ${MODEL} chỉ hỗ trợ 128–3072 chiều, index đang ${EMBED_DIM}.`)
      process.exit(1)
    }
  }
  console.log(`   Embedding: ${EMBED_DIM} chiều${EMBED_DIM === 3072 ? '' : ' (tự chuẩn hoá L2)'}`)

  // Cảnh báo lệch cấu hình: webapp truy vấn bằng VSEC_EMBED_DIM, nếu khác số
  // chiều index thì mọi truy vấn vector sẽ lỗi.
  if (process.env.VSEC_EMBED_DIM && parseInt(process.env.VSEC_EMBED_DIM, 10) !== EMBED_DIM) {
    console.warn(`   ⚠️   VSEC_EMBED_DIM=${process.env.VSEC_EMBED_DIM} KHÁC index (${EMBED_DIM}).`)
    console.warn(`        Sửa biến này trên Vercel thành ${EMBED_DIM}, nếu không truy vấn sẽ lỗi.`)
  }

  // Đọc corpus
  const chunks = readFileSync(join(ROOT, 'data', 'chunks.jsonl'), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
  console.log(`   Corpus: ${chunks.length} chunks`)

  if (RESET) {
    console.log('\n⚠️   --reset: xoá sạch index trước khi nạp lại...')
    await vec('/reset', {})
    console.log('   ✅  Đã xoá sạch index')
  }

  // Corpus rỗng => index phải rỗng theo
  if (chunks.length === 0) {
    if (!RESET) {
      console.log('\n⚠️   Corpus rỗng — xoá toàn bộ vector để khớp.')
      await vec('/reset', {})
    }
    console.log('\n✅  Hoàn thành: index rỗng, khớp với corpus.\n')
    return
  }

  const existing = RESET ? new Map() : await listExisting()
  console.log(`   Trên index: ${existing.size} vectors\n`)

  // Phân loại: cần nạp / bỏ qua / cần xoá
  const wanted = new Map()
  for (const [i, c] of chunks.entries()) {
    const text = c.content || c.text || ''
    wanted.set(c.id || `chunk-${i}`, { chunk: c, text, hash: hashOf(text) })
  }

  const toUpsert = []
  let skipped = 0
  for (const [id, w] of wanted) {
    if (existing.has(id) && existing.get(id) === w.hash) skipped++
    else toUpsert.push({ id, ...w })
  }
  const toDelete = [...existing.keys()].filter((id) => !wanted.has(id))

  console.log(`   → nạp mới/cập nhật: ${toUpsert.length}`)
  console.log(`   → giữ nguyên:       ${skipped}`)
  console.log(`   → xoá (không còn trong corpus): ${toDelete.length}\n`)

  // Xoá vector mồ côi TRƯỚC, để index không bao giờ trả về văn bản đã gỡ
  for (let i = 0; i < toDelete.length; i += VEC_BATCH) {
    await vec('/delete', { ids: toDelete.slice(i, i + VEC_BATCH) })
  }
  if (toDelete.length) console.log(`   ✅  Đã xoá ${toDelete.length} vector mồ côi`)

  // Embed + upsert
  if (toUpsert.length > RPM) {
    const mins = Math.ceil(toUpsert.length / RPM)
    console.log(`   ⏱  Hạn mức ${RPM} văn bản/phút → dự kiến ~${mins} phút.`)
    console.log(`      Ngắt giữa chừng cũng không sao: chạy lại sẽ tiếp tục từ chỗ dở.\n`)
  }

  const t0 = Date.now()
  let done = 0
  let stoppedByQuota = null
  for (let i = 0; i < toUpsert.length; i += EMBED_BATCH) {
    const batch = toUpsert.slice(i, i + EMBED_BATCH)
    let vectors
    try {
      vectors = await embedBatchSafe(batch.map((b) => b.text))
    } catch (e) {
      // Hết hạn mức ngày: dừng gọn, GIỮ NGUYÊN phần đã nạp. Lần chạy sau
      // bỏ qua chúng nhờ so hash, nên coi như tiếp tục từ đây.
      if (e instanceof DailyQuotaError) { stoppedByQuota = e.message; break }
      throw e
    }

    const items = batch.map((b, j) => ({
      id: b.id,
      vector: vectors[j],
      metadata: {
        hash: b.hash, // để lần chạy sau bỏ qua chunk không đổi
        content: b.text.slice(0, 1000),
        loai: b.chunk.loai ?? '',
        so_hieu: b.chunk.so_hieu ?? '',
        van_ban: b.chunk.van_ban ?? '',
        don_vi: b.chunk.don_vi ?? '',
        tieu_de: b.chunk.tieu_de ?? '',
        phan: b.chunk.phan ?? '',
        source: b.chunk.source ?? '',
        language: b.chunk.language ?? 'vi',
      },
    }))

    for (let k = 0; k < items.length; k += VEC_BATCH) {
      await vec('/upsert', items.slice(k, k + VEC_BATCH))
    }
    done += batch.length
    const elapsed = (Date.now() - t0) / 1000
    const left = done ? Math.ceil((elapsed / done) * (toUpsert.length - done)) : 0
    process.stdout.write(
      `\r   Đã nạp ${done}/${toUpsert.length}` +
      (left > 0 ? ` — còn ~${Math.ceil(left / 60)} phút          ` : '                    ')
    )
  }
  if (toUpsert.length) console.log()

  const final = await vec('/info')

  if (stoppedByQuota) {
    const remaining = toUpsert.length - done
    console.log(`\n⏸  DỪNG GIỮA CHỪNG — ${stoppedByQuota}`)
    console.log(`   Đã nạp phiên này: ${done}. Còn lại: ${remaining}.`)
    console.log(`   Index hiện có: ${final.vectorCount ?? '?'} / ${chunks.length} chunks.\n`)
    console.log('   Cách đi tiếp — chọn một:')
    console.log('   1) Chạy lại `npm run ingest` sau khi hạn mức ngày reset (0h giờ Thái Bình Dương,')
    console.log('      tức khoảng 14–15h giờ Việt Nam). Script tự bỏ qua phần đã nạp.')
    console.log('   2) Bật thanh toán cho Google API để bỏ trần 1.000/ngày. Toàn bộ corpus này')
    console.log('      chỉ tốn khoảng 0,05 USD tiền embedding — rẻ hơn nhiều so với chờ nhiều ngày.')
    console.log('      https://aistudio.google.com/apikey → chọn project → Set up Billing\n')
    process.exit(2)
  }

  console.log(`\n✅  Hoàn thành. Index: ${final.vectorCount ?? '?'} vectors (corpus: ${chunks.length} chunks)\n`)
}

main().catch((e) => {
  console.error('\n❌', e.message)
  process.exit(1)
})

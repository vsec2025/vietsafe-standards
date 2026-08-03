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
const EXPECTED_DIM = 3072
const EMBED_BATCH = 50
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
async function embedBatch(texts) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${MODEL}:batchEmbedContents?key=${GOOGLE_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: texts.map((text) => ({ model: MODEL, content: { parts: [{ text }] } })),
      }),
    }
  )
  if (!res.ok) throw new Error(`Embed error: ${await res.text()}`)
  const d = await res.json()
  return d.embeddings.map((e) => e.values)
}

const hashOf = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 VSEC-AI — Đồng bộ corpus → Upstash Vector\n')

  const info = await vec('/info').catch((e) => {
    console.error(`❌  Không kết nối được Upstash Vector: ${e.message}`)
    process.exit(1)
  })
  console.log(`   Index: ${info.vectorCount ?? 0} vectors, dim=${info.dimension ?? '?'}`)

  if (info.dimension && info.dimension !== EXPECTED_DIM) {
    console.error(`\n❌  Index dim=${info.dimension} nhưng ${MODEL} sinh ${EXPECTED_DIM} chiều.`)
    console.error(`    Tạo lại index với dimension=${EXPECTED_DIM}, metric=cosine.`)
    process.exit(1)
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
  let done = 0
  for (let i = 0; i < toUpsert.length; i += EMBED_BATCH) {
    const batch = toUpsert.slice(i, i + EMBED_BATCH)
    const vectors = await embedBatch(batch.map((b) => b.text))

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
    process.stdout.write(`\r   Embedding: ${done}/${toUpsert.length}`)
  }
  if (toUpsert.length) console.log()

  const final = await vec('/info')
  console.log(`\n✅  Hoàn thành. Index: ${final.vectorCount ?? '?'} vectors (corpus: ${chunks.length} chunks)\n`)
}

main().catch((e) => {
  console.error('\n❌', e.message)
  process.exit(1)
})

#!/usr/bin/env node
// VSEC-AI Corpus Ingestion — đọc data/chunks.jsonl → embed → upsert Upstash Vector
// Yêu cầu: GOOGLE_API_KEY, UPSTASH_VECTOR_REST_URL, UPSTASH_VECTOR_REST_TOKEN
//
// Chạy: node scripts/ingest-corpus.mjs

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, '..')

// Load .env.local
try {
  readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n').forEach(line => {
    const eq = line.indexOf('=')
    if (eq > 0 && !line.startsWith('#')) {
      const k = line.slice(0, eq).trim()
      const v = line.slice(eq + 1).trim()
      if (k) process.env[k] = v
    }
  })
} catch { /* dùng env từ shell */ }

const GOOGLE_KEY = process.env.GOOGLE_API_KEY
const VEC_URL    = process.env.UPSTASH_VECTOR_REST_URL
const VEC_TOKEN  = process.env.UPSTASH_VECTOR_REST_TOKEN
const MODEL      = 'models/gemini-embedding-001'
const EMBED_BATCH = 50
const VEC_BATCH   = 100

// ── Validate ────────────────────────────────────────────────────────────────
for (const [k, v] of [['GOOGLE_API_KEY', GOOGLE_KEY], ['UPSTASH_VECTOR_REST_URL', VEC_URL], ['UPSTASH_VECTOR_REST_TOKEN', VEC_TOKEN]]) {
  if (!v || v === 'placeholder') { console.error(`❌  ${k} chưa được set`); process.exit(1) }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
async function embedBatch(texts) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${MODEL}:batchEmbedContents?key=${GOOGLE_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: texts.map(text => ({ model: MODEL, content: { parts: [{ text }] } })),
      }),
    }
  )
  if (!res.ok) throw new Error(`Embed error: ${await res.text()}`)
  const d = await res.json()
  return d.embeddings.map(e => e.values)
}

async function upsertVectors(items) {
  const res = await fetch(`${VEC_URL}/upsert`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${VEC_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(items),
  })
  if (!res.ok) throw new Error(`Upsert error: ${await res.text()}`)
}

async function getVectorInfo() {
  const res = await fetch(`${VEC_URL}/info`, {
    headers: { Authorization: `Bearer ${VEC_TOKEN}` },
  })
  return res.ok ? await res.json() : null
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 VSEC-AI Corpus Ingestion\n')

  // Kiểm tra Upstash Vector index
  const info = await getVectorInfo()
  if (!info) { console.error('❌  Không kết nối được Upstash Vector. Kiểm tra URL/token.'); process.exit(1) }
  console.log(`✅  Upstash Vector: ${info.vectorCount ?? 0} vectors, dim=${info.dimension ?? '?'}`)

  if (info.dimension && info.dimension !== 3072) {
    console.error(`❌  Index dimension=${info.dimension} nhưng gemini-embedding-001 cho 3072 dims.`)
    console.error('    Xoá index cũ và tạo lại với dimension=3072, metric=cosine.')
    process.exit(1)
  }

  // Đọc chunks.jsonl
  const chunksPath = join(ROOT, 'data', 'chunks.jsonl')
  const chunks = readFileSync(chunksPath, 'utf8')
    .split('\n').filter(l => l.trim())
    .map(l => JSON.parse(l))

  console.log(`📄  Chunks: ${chunks.length}`)

  // Embed và upsert theo batch
  let done = 0
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH)
    const texts = batch.map(c => c.content || c.text || '')

    const vectors = await embedBatch(texts)

    const items = batch.map((c, j) => ({
      id: c.id || `chunk-${i + j}`,
      vector: vectors[j],
      metadata: {
        content: (c.content || c.text || '').slice(0, 1000),
        loai: c.loai ?? '',
        so_hieu: c.so_hieu ?? '',
        van_ban: c.van_ban ?? '',
        don_vi: c.don_vi ?? '',
        tieu_de: c.tieu_de ?? '',
        phan: c.phan ?? '',
        language: c.language ?? 'vi',
      },
    }))

    // Upsert theo batch nhỏ hơn nếu cần
    for (let k = 0; k < items.length; k += VEC_BATCH) {
      await upsertVectors(items.slice(k, k + VEC_BATCH))
    }

    done += batch.length
    process.stdout.write(`\r   Progress: ${done}/${chunks.length} chunks`)
  }

  console.log('\n')
  const finalInfo = await getVectorInfo()
  console.log(`✅  Hoàn thành! Upstash Vector: ${finalInfo?.vectorCount ?? '?'} vectors\n`)
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1) })

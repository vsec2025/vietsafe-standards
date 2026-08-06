// Google gemini-embedding-001 — song ngữ vi/en.
//
// Số chiều lấy từ VSEC_EMBED_DIM và PHẢI bằng dimension của Upstash Vector
// index. Gói free Upstash tối đa 1536 chiều nên đó là mặc định.
//
// Model dùng Matryoshka: 1536 chiều đầu tiên tự nó đã đủ nghĩa, điểm MTEB
// ngang với 3072 (68,17). Nhưng CHỈ bản 3072 được chuẩn hoá sẵn — mọi số
// chiều khác phải tự chuẩn hoá L2, nếu không phép đo cosine lệch và kết quả
// tìm kiếm kém đi mà không báo lỗi gì.
const MODEL = 'models/gemini-embedding-001'

export const EMBED_DIM = parseInt(process.env.VSEC_EMBED_DIM ?? '1536', 10)

/** Chuẩn hoá L2 về vector đơn vị. Bỏ qua khi model đã trả về sẵn (3072). */
export function normalize(vec) {
  if (!Array.isArray(vec) || vec.length === 0) return vec
  let sum = 0
  for (const v of vec) sum += v * v
  const norm = Math.sqrt(sum)
  if (!norm || !isFinite(norm)) return vec
  return vec.map((v) => v / norm)
}

const needsNormalize = () => EMBED_DIM !== 3072

function body(texts) {
  const mk = (text) => ({
    model: MODEL,
    content: { parts: [{ text }] },
    outputDimensionality: EMBED_DIM,
  })
  return Array.isArray(texts) ? { requests: texts.map(mk) } : mk(texts)
}

export async function embedText(text) {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey || apiKey === 'placeholder') return null

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${MODEL}:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body(text)),
    }
  )
  if (!res.ok) {
    console.error('Embedding error:', await res.text())
    return null
  }
  const data = await res.json()
  const vec = data.embedding?.values ?? null
  return vec && needsNormalize() ? normalize(vec) : vec
}

export async function embedBatch(texts) {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey || apiKey === 'placeholder') return null

  const BATCH = 100
  const results = []
  for (let i = 0; i < texts.length; i += BATCH) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${MODEL}:batchEmbedContents?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body(texts.slice(i, i + BATCH))),
      }
    )
    if (!res.ok) throw new Error(`Batch embed error: ${await res.text()}`)
    const data = await res.json()
    const vecs = data.embeddings.map((e) => e.values)
    results.push(...(needsNormalize() ? vecs.map(normalize) : vecs))
  }
  return results
}

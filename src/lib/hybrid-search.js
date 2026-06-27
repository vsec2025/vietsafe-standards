// Hybrid search: BM25 (in-memory) + Vector (Upstash)
// VSEC_HYBRID_ALPHA: 0 = chỉ BM25, 1 = chỉ vector, 0.5 = cân bằng
import { searchDocuments } from './search'
import { embedText } from './embedding'
import { vectorQuery } from './vector-search'

const ALPHA = parseFloat(process.env.VSEC_HYBRID_ALPHA ?? '0.5')

// mode: 'vn_only' | 'intl_compare' | 'project'
export async function hybridSearch(query, { topK = 6, mode = 'vn_only' } = {}) {
  // Xác định ngôn ngữ cần filter cho vector
  const langFilter = mode === 'vn_only' ? "language = 'vi'" : undefined

  // Chạy song song BM25 và vector
  const [bm25Results, vecResults] = await Promise.all([
    searchDocuments(query, topK * 3),
    (async () => {
      const vec = await embedText(query)
      if (!vec) return []
      return vectorQuery(vec, { topK: topK * 3, filter: langFilter })
    })(),
  ])

  // Nếu vector không khả dụng, trả về BM25
  if (!vecResults.length) return bm25Results.slice(0, topK)

  // Normalize BM25 scores
  const maxBm25 = bm25Results[0]?.score || 1
  const bm25Map = new Map(bm25Results.map((r) => [r.id, r.score / maxBm25]))

  // Normalize vector scores (cosine similarity đã trong [0,1])
  const vecMap = new Map(vecResults.map((r) => [r.id, { score: r.score, meta: r.metadata }]))

  // Merge
  const allIds = new Set([...bm25Map.keys(), ...vecMap.keys()])
  const merged = []

  for (const id of allIds) {
    const bm25 = bm25Map.get(id) ?? 0
    const vec = vecMap.get(id)?.score ?? 0
    const combined = (1 - ALPHA) * bm25 + ALPHA * vec

    // Tìm chunk gốc từ BM25 hoặc dùng metadata từ vector
    const bm25Chunk = bm25Results.find((r) => r.id === id)
    const vecMeta = vecMap.get(id)?.meta

    merged.push({
      id,
      score: combined,
      bm25_score: bm25,
      vector_score: vec,
      // Ưu tiên dữ liệu từ BM25 chunk (có đầy đủ fields gốc), fallback vector metadata
      ...(bm25Chunk ?? {}),
      content: bm25Chunk?.content ?? bm25Chunk?.text ?? vecMeta?.content ?? '',
      loai: bm25Chunk?.loai ?? vecMeta?.loai,
      don_vi: bm25Chunk?.don_vi ?? vecMeta?.don_vi,
      tieu_de: bm25Chunk?.tieu_de ?? vecMeta?.tieu_de,
      language: bm25Chunk?.language ?? vecMeta?.language ?? 'vi',
    })
  }

  merged.sort((a, b) => b.score - a.score)
  return merged.slice(0, topK)
}

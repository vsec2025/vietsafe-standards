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
      // Trải chunk gốc TRƯỚC: nó mang theo `score` BM25 thô (chưa chuẩn hoá) và
      // sẽ ghi đè `combined` nếu đặt sau, khiến mọi kết quả BM25 xếp trên mọi
      // kết quả vector và phần vector coi như vô hiệu.
      ...(bm25Chunk ?? {}),
      id,
      score: combined,
      bm25_score: bm25,
      vector_score: vec,
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

// Hằng số giảm chấn của Reciprocal Rank Fusion. 60 là giá trị chuẩn trong tài
// liệu gốc: đủ lớn để một hạng nhất đơn lẻ không áp đảo, nên chunk được nhiều
// truy vấn con cùng tìm thấy sẽ vượt lên chunk chỉ đứng đầu ở đúng một truy vấn.
const RRF_K = 60

/**
 * Chạy nhiều truy vấn rồi hợp nhất bằng Reciprocal Rank Fusion.
 *
 * Dùng thứ HẠNG chứ không dùng điểm: điểm của hai truy vấn khác nhau không so
 * sánh được với nhau (thang BM25 phụ thuộc độ hiếm của từ trong chính truy vấn
 * đó), nên cộng điểm thẳng sẽ thiên vị truy vấn nào tình cờ có điểm cao.
 */
export async function multiHybridSearch(queries, { topK = 20, mode = 'vn_only' } = {}) {
  const list = [...new Set((queries || []).map((q) => (q || '').trim()).filter(Boolean))]
  if (!list.length) return []
  if (list.length === 1) return hybridSearch(list[0], { topK, mode })

  // Mỗi truy vấn con lấy dư để phần giao nhau có chỗ thể hiện; nếu chỉ lấy
  // đúng topK thì chunk xếp hạng trung bình ở mọi truy vấn sẽ bị cắt trước khi
  // kịp cộng dồn.
  const perQuery = Math.max(topK, 10)
  const settled = await Promise.allSettled(
    list.map((q) => hybridSearch(q, { topK: perQuery, mode }))
  )

  const fused = new Map() // id -> { chunk, rrf, hits }
  settled.forEach((res, qi) => {
    if (res.status !== 'fulfilled') {
      console.error(`[multi-search] truy vấn ${qi} lỗi:`, res.reason?.message)
      return
    }
    res.value.forEach((chunk, rank) => {
      const prev = fused.get(chunk.id)
      const inc = 1 / (RRF_K + rank + 1)
      if (prev) {
        prev.rrf += inc
        prev.hits += 1
      } else {
        fused.set(chunk.id, { chunk, rrf: inc, hits: 1 })
      }
    })
  })

  return [...fused.values()]
    .sort((a, b) => b.rrf - a.rrf)
    .slice(0, topK)
    .map(({ chunk, rrf, hits }) => ({ ...chunk, rrf_score: rrf, matched_queries: hits }))
}

import { Chunk, SearchResult, DocStatus } from '@/types'

interface SearchIndex {
  chunks: Chunk[]
  inverted: Record<string, [number, number][]>
  total_chunks: number
}

let cachedIndex: SearchIndex | null = null

function tokenize(text: string): string[] {
  const stopwords = new Set(['và','của','trong','để','các','có','được','là','tại','theo',
    'về','đến','với','không','hoặc','khi','cho','từ','này','đó','một','những','như',
    'trên','dưới','sau','trước','giữa','nếu','thì','mà','bởi','vì','nên','cũng',
    'đã','sẽ','đang','bị','phải','cần','do','tuy','vậy','tức'])
  return text.toLowerCase()
    .replace(/[^\w\sàáâãèéêìíòóôõùúýăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !stopwords.has(t))
}

export async function getSearchIndex(): Promise<SearchIndex> {
  if (cachedIndex) return cachedIndex
  
  const baseUrl = process.env.GITHUB_RAW_URL || 
    'https://raw.githubusercontent.com/vsec2025/vietsafe-standards/main'
  
  const [indexRes, chunksRes] = await Promise.all([
    fetch(`${baseUrl}/data/search_index.json`, { next: { revalidate: 300 } }),
    fetch(`${baseUrl}/data/chunks.jsonl`, { next: { revalidate: 300 } })
  ])
  
  const indexData = await indexRes.json()
  const chunksText = await chunksRes.text()
  const chunks: Chunk[] = chunksText.trim().split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l))
  
  cachedIndex = {
    chunks,
    inverted: indexData.inverted || {},
    total_chunks: chunks.length
  }
  
  return cachedIndex
}

export function clearIndexCache() {
  cachedIndex = null
}

export async function search(
  query: string, 
  topK: number = 5,
  docStatusFilter: DocStatus[] = ['con_hieu_luc']
): Promise<SearchResult[]> {
  const index = await getSearchIndex()
  const queryTokens = tokenize(query)
  
  if (queryTokens.length === 0) return []
  
  // Tính BM25 score
  const scores: Map<number, number> = new Map()
  
  for (const token of queryTokens) {
    const postings = index.inverted[token] || []
    for (const [chunkIdx, score] of postings) {
      scores.set(chunkIdx, (scores.get(chunkIdx) || 0) + score)
    }
  }
  
  // Sắp xếp và lấy top K
  const ranked = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK * 3) // lấy nhiều hơn để filter hiệu lực
  
  const results: SearchResult[] = []
  
  for (const [idx, score] of ranked) {
    const chunk = index.chunks[idx]
    if (!chunk) continue
    
    // Kiểm tra trạng thái hiệu lực từ chunk metadata
    const docStatus = (chunk.trang_thai || 'con_hieu_luc') as DocStatus
    
    if (docStatusFilter.includes(docStatus)) {
      results.push({ chunk, score, doc_status: docStatus })
    }
    
    if (results.length >= topK) break
  }
  
  return results
}

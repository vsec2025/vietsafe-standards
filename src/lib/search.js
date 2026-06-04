// Simple BM25 search for Vietnamese text
// Works with chunks.jsonl data loaded into memory

const K1 = 1.5
const B = 0.75

// Vietnamese-aware tokenizer
function tokenize(text) {
  if (!text) return []
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1)
}

// Build inverted index from chunks
function buildIndex(chunks) {
  const df = {} // document frequency
  const tf = {} // term frequency per doc
  const docLengths = []
  let totalLength = 0

  chunks.forEach((chunk, i) => {
    const tokens = tokenize(chunk.text || chunk.content || '')
    docLengths[i] = tokens.length
    totalLength += tokens.length
    tf[i] = {}
    const seen = new Set()

    tokens.forEach(token => {
      tf[i][token] = (tf[i][token] || 0) + 1
      if (!seen.has(token)) {
        df[token] = (df[token] || 0) + 1
        seen.add(token)
      }
    })
  })

  return {
    df,
    tf,
    docLengths,
    avgDl: totalLength / (chunks.length || 1),
    N: chunks.length
  }
}

// BM25 scoring
function bm25Score(query, docIdx, index) {
  const queryTokens = tokenize(query)
  let score = 0
  const dl = index.docLengths[docIdx]

  queryTokens.forEach(token => {
    const docFreq = index.df[token] || 0
    if (docFreq === 0) return

    const termFreq = (index.tf[docIdx] && index.tf[docIdx][token]) || 0
    if (termFreq === 0) return

    const idf = Math.log((index.N - docFreq + 0.5) / (docFreq + 0.5) + 1)
    const tfNorm = (termFreq * (K1 + 1)) / (termFreq + K1 * (1 - B + B * dl / index.avgDl))
    score += idf * tfNorm
  })

  return score
}

// Main search function
export function search(query, chunks, index, limit = 10) {
  if (!query || !chunks || !chunks.length) return []

  const scores = chunks.map((_, i) => ({
    index: i,
    score: bm25Score(query, i, index)
  }))

  return scores
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => ({
      ...chunks[s.index],
      score: s.score,
      _index: s.index
    }))
}

// Cache for loaded data
let cachedChunks = null
let cachedIndex = null

export async function loadSearchData() {
  if (cachedChunks && cachedIndex) {
    return { chunks: cachedChunks, index: cachedIndex }
  }

  try {
    const fs = require('fs')
    const path = require('path')
    
    // Load chunks
    const chunksPath = path.join(process.cwd(), 'public', 'data', 'chunks.jsonl')
    const chunksRaw = fs.readFileSync(chunksPath, 'utf-8')
    cachedChunks = chunksRaw
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line))

    // Build BM25 index from chunks
    cachedIndex = buildIndex(cachedChunks)
    
    return { chunks: cachedChunks, index: cachedIndex }
  } catch (err) {
    console.error('Error loading search data:', err)
    return { chunks: [], index: null }
  }
}

export function searchDocuments(query, limit = 10) {
  return loadSearchData().then(async ({ chunks, index }) => {
    if (!index) return []
    const results = search(query, chunks, index, limit)
    return await markSupersededResults(results)
  })
}

// Exact phrase search - finds chunks containing the exact phrase
export function exactSearch(phrase, limit = 20) {
  return loadSearchData().then(async ({ chunks }) => {
    if (!chunks || !chunks.length) return []
    const lower = phrase.toLowerCase()
    const results = []
    
    chunks.forEach((chunk, i) => {
      const content = (chunk.content || chunk.text || '').toLowerCase()
      const idx = content.indexOf(lower)
      if (idx !== -1) {
        const freq = (content.match(new RegExp(lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
        results.push({
          ...chunk,
          score: freq * 10 + (1 - idx / content.length) * 5,
          _index: i
        })
      }
    })
    
    const sorted = results.sort((a, b) => b.score - a.score).slice(0, limit)
    return await markSupersededResults(sorted)
  })
}

// Check Redis for superseded chunk status and mark results
async function markSupersededResults(results) {
  try {
    const { getRedis } = require('./redis')
    const r = getRedis()
    if (!r) return results
    
    const statusData = await r.get('chunks:status')
    if (!statusData) return results
    
    const chunkStatus = typeof statusData === 'string' ? JSON.parse(statusData) : statusData
    
    return results.map(r => {
      const st = chunkStatus[r.id]
      if (st) {
        return { ...r, _superseded: true, _supersededInfo: st }
      }
      return r
    })
  } catch (e) {
    return results
  }
}

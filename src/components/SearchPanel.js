'use client'
import { useState, useRef } from 'react'

export default function SearchPanel() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef(null)

  async function handleSearch(e) {
    e?.preventDefault()
    if (!query.trim()) return
    
    setLoading(true)
    setSearched(true)
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), limit: 15 })
      })
      const data = await res.json()
      setResults(data.results || [])
    } catch (err) {
      console.error('Search error:', err)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function highlightText(text, q) {
    if (!q) return text
    const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 1)
    if (!words.length) return text
    const regex = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
    return text.replace(regex, '<mark class="bg-yellow-200 text-vs-dark px-0.5 rounded">$1</mark>')
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Search header */}
      <div className="p-4 border-b border-gray-200 bg-vs-gray-light">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vs-gray-mid" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Tìm kiếm điều khoản, tiêu chuẩn..."
              className="vs-input pl-9"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="vs-btn-primary flex-shrink-0 disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Tìm'
            )}
          </button>
        </form>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!searched ? (
          <div className="p-8 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeWidth="2"/>
            </svg>
            <p className="text-sm text-vs-gray-mid font-montserrat">
              Nhập từ khóa để tìm kiếm trong các văn bản PCCC
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {['sprinkler', 'chống cháy', 'thoát nạn', 'báo cháy', 'bơm chữa cháy'].map(kw => (
                <button
                  key={kw}
                  onClick={() => { setQuery(kw); setTimeout(() => handleSearch(), 50) }}
                  className="text-xs px-3 py-1 bg-gray-100 text-vs-gray rounded-full hover:bg-gray-200 transition"
                >
                  {kw}
                </button>
              ))}
            </div>
          </div>
        ) : loading ? (
          <div className="p-8 text-center">
            <span className="inline-block w-8 h-8 border-3 border-vs-red border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-vs-gray-mid mt-3">Đang tìm kiếm...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-vs-gray-mid">Không tìm thấy kết quả cho &ldquo;{query}&rdquo;</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="px-4 py-2 bg-gray-50 text-xs text-vs-gray-mid font-medium">
              Tìm thấy {results.length} kết quả
            </div>
            {results.map((r, i) => (
              <div key={i} className="p-4 hover:bg-gray-50 transition">
                {/* Source badge */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] px-2 py-0.5 bg-vs-red text-white rounded font-medium">
                    {r.doc_id || r.source || 'N/A'}
                  </span>
                  {r.chunk_id && (
                    <span className="text-[10px] text-vs-gray-mid">
                      {r.chunk_id}
                    </span>
                  )}
                  <span className="text-[10px] text-vs-gray-mid ml-auto">
                    Điểm: {r.score?.toFixed(2)}
                  </span>
                </div>
                {/* Content */}
                <p
                  className="text-xs text-vs-gray leading-relaxed line-clamp-4"
                  dangerouslySetInnerHTML={{
                    __html: highlightText(
                      (r.text || r.content || '').slice(0, 400),
                      query
                    )
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

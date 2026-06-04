'use client'
import { useState, useRef } from 'react'

export default function SearchPanel() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [searchMode, setSearchMode] = useState(null) // 'exact' or 'fuzzy'
  const inputRef = useRef(null)

  async function handleSearch(e) {
    e?.preventDefault()
    if (!query.trim()) return
    
    setLoading(true)
    setSearched(true)

    // Detect search mode: "" = exact phrase, else fuzzy BM25
    const q = query.trim()
    const isExact = /^".*"$/.test(q)
    setSearchMode(isExact ? 'exact' : 'fuzzy')

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: isExact ? q.slice(1, -1) : q, 
          limit: 20,
          exact: isExact
        })
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

  function getDocLabel(r) {
    const parts = []
    if (r.loai === 'LUAT' && r.van_ban) parts.push(r.van_ban)
    else if (r.loai === 'QCVN') parts.push('QCVN 06:2022/BXD')
    else if (r.loai === 'TCVN') parts.push('TCVN 7336:2021')
    else if (r.van_ban) parts.push(r.van_ban)
    else parts.push(r.loai || 'N/A')
    return parts.join('')
  }

  function getDocSection(r) {
    const parts = []
    if (r.phan) parts.push(r.phan)
    if (r.don_vi) parts.push(r.don_vi)
    if (r.tieu_de) parts.push(r.tieu_de)
    return parts.join(' — ')
  }

  function highlightText(text, q) {
    if (!q) return text
    // Remove quotes for highlighting
    const cleanQ = q.replace(/^"|"$/g, '')
    const words = cleanQ.toLowerCase().split(/\s+/).filter(w => w.length > 1)
    if (!words.length) return text
    const regex = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
    return text.replace(regex, '<mark class="bg-yellow-200 text-vs-dark px-0.5 rounded">$1</mark>')
  }

  const loaiColors = {
    'LUAT': 'bg-vs-red text-white',
    'QCVN': 'bg-amber-600 text-white',
    'TCVN': 'bg-blue-600 text-white'
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Search header */}
      <div className="p-3 border-b border-gray-200">
        <h2 className="text-sm font-bold text-vs-dark font-montserrat mb-2">TÌM KIẾM VĂN BẢN</h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="flex-1 relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-vs-gray-mid" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder='Tìm kiếm... (dùng "cụm từ" để tìm chính xác)'
              className="vs-input pl-8 text-xs"
            />
          </div>
          <button type="submit" disabled={loading || !query.trim()} className="vs-btn-primary flex-shrink-0 disabled:opacity-50 text-xs px-3">
            Tìm
          </button>
        </form>
        <p className="text-[10px] text-vs-gray-mid mt-1.5">
          💡 Dùng <code className="bg-gray-100 px-1 rounded">"dấu ngoặc kép"</code> để tìm chính xác cụm từ
        </p>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!searched ? (
          <div className="p-6 text-center">
            <svg className="w-12 h-12 mx-auto text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeWidth="2"/>
            </svg>
            <p className="text-xs text-vs-gray-mid mb-3">Tìm kiếm trong các văn bản PCCC</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {['sprinkler', 'thoát nạn', 'báo cháy', 'bơm chữa cháy', '"khoảng cách tối đa"'].map(kw => (
                <button
                  key={kw}
                  onClick={() => { setQuery(kw); }}
                  className="text-[11px] px-2.5 py-1 bg-gray-100 text-vs-gray rounded-full hover:bg-red-50 hover:text-vs-red transition"
                >
                  {kw}
                </button>
              ))}
            </div>
          </div>
        ) : loading ? (
          <div className="p-6 text-center">
            <span className="inline-block w-6 h-6 border-2 border-vs-red border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-vs-gray-mid mt-2">Đang tìm kiếm...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-xs text-vs-gray-mid">Không tìm thấy kết quả cho &ldquo;{query}&rdquo;</p>
            {searchMode === 'exact' && (
              <p className="text-[10px] text-vs-gray-mid mt-1">Thử bỏ dấu ngoặc kép để tìm kiếm tương đối</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="px-3 py-1.5 bg-gray-50 flex items-center justify-between">
              <span className="text-[11px] text-vs-gray-mid font-medium">
                {results.length} kết quả {searchMode === 'exact' ? '(chính xác)' : '(tương đối)'}
              </span>
            </div>
            {results.map((r, i) => (
              <div key={i} className="px-3 py-3 hover:bg-gray-50 transition">
                {/* Doc badge + section */}
                <div className="flex items-start gap-2 mb-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${loaiColors[r.loai] || 'bg-gray-500 text-white'}`}>
                    {getDocLabel(r)}
                  </span>
                  <span className="text-[10px] text-vs-red font-medium truncate">
                    {getDocSection(r)}
                  </span>
                  {r.score && (
                    <span className="text-[10px] text-vs-gray-mid ml-auto flex-shrink-0">
                      {r.score.toFixed(1)}
                    </span>
                  )}
                </div>
                {/* Content preview */}
                {r._superseded && (
                  <div className="mb-1 px-2 py-1 bg-yellow-50 border border-yellow-300 rounded text-[10px] text-yellow-700">
                    ⚠️ <b>Đã {r._supersededInfo?.status === 'superseded' ? 'bị thay thế' : 'sửa đổi'}</b> bởi: {r._supersededInfo?.superseded_by}
                  </div>
                )}
                <p
                  className="text-[11px] text-vs-gray leading-relaxed line-clamp-3"
                  dangerouslySetInnerHTML={{
                    __html: highlightText(
                      (r.content || r.text || '').replace(/#+\s*/g, '').slice(0, 350),
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

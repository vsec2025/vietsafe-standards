'use client'
import { useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const mdComponents = {
  table: ({children}) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-[11px] border-collapse border border-gray-300">{children}</table>
    </div>
  ),
  thead: ({children}) => <thead className="bg-vs-red text-white">{children}</thead>,
  th: ({children}) => <th className="border border-gray-300 px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({children}) => <td className="border border-gray-300 px-2 py-1">{children}</td>,
  tr: ({children}) => <tr className="even:bg-gray-50">{children}</tr>,
  h1: ({children}) => <h1 className="text-sm font-bold text-vs-dark mt-2 mb-1">{children}</h1>,
  h2: ({children}) => <h2 className="text-[13px] font-bold text-vs-dark mt-2 mb-1">{children}</h2>,
  h3: ({children}) => <h3 className="text-xs font-semibold text-vs-gray mt-1.5 mb-0.5">{children}</h3>,
  h4: ({children}) => <h4 className="text-xs font-semibold text-vs-gray-mid mt-1 mb-0.5">{children}</h4>,
  p: ({children}) => <p className="text-[11px] leading-relaxed mb-1">{children}</p>,
  ul: ({children}) => <ul className="list-disc list-inside text-[11px] space-y-0.5 ml-2 mb-1">{children}</ul>,
  ol: ({children}) => <ol className="list-decimal list-inside text-[11px] space-y-0.5 ml-2 mb-1">{children}</ol>,
  li: ({children}) => <li className="text-[11px] leading-relaxed">{children}</li>,
  strong: ({children}) => <strong className="font-semibold text-vs-dark">{children}</strong>,
  blockquote: ({children}) => <blockquote className="border-l-2 border-vs-red pl-2 my-1 text-[11px] italic text-vs-gray-mid">{children}</blockquote>,
}

export default function SearchPanel() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [searchMode, setSearchMode] = useState(null)
  const [expanded, setExpanded] = useState({}) // {index: true/false}
  const inputRef = useRef(null)

  // Highlight keywords in text
  function getHighlightWords() {
    const q = query.replace(/^"|"$/g, '').trim()
    return q.toLowerCase().split(/\s+/).filter(w => w.length > 1)
  }

  function highlightHtml(text) {
    const words = getHighlightWords()
    if (!words.length) return text
    const regex = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
    return text.replace(regex, '<mark class="bg-yellow-200 text-vs-dark rounded px-0.5">$1</mark>')
  }

  // Custom ReactMarkdown components with highlighting
  function withHighlight(Component, className) {
    return ({ children, ...props }) => {
      if (typeof children === 'string') {
        return <Component {...props} className={className} dangerouslySetInnerHTML={{ __html: highlightHtml(children) }} />
      }
      // Recursively handle arrays of children
      const highlighted = Array.isArray(children) ? children.map((child, i) => {
        if (typeof child === 'string') {
          return <span key={i} dangerouslySetInnerHTML={{ __html: highlightHtml(child) }} />
        }
        return child
      }) : children
      return <Component {...props} className={className}>{highlighted}</Component>
    }
  }

  const highlightMdComponents = {
    ...mdComponents,
    p: withHighlight('p', 'text-[11px] leading-relaxed mb-1'),
    li: withHighlight('li', 'text-[11px] leading-relaxed'),
    td: withHighlight('td', 'border border-gray-300 px-2 py-1'),
    th: withHighlight('th', 'border border-gray-300 px-2 py-1 text-left font-semibold'),
  }

  async function handleSearch(e) {
    e?.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setSearched(true)
    setExpanded({})

    const q = query.trim()
    const isExact = /^".*"$/.test(q)
    setSearchMode(isExact ? 'exact' : 'fuzzy')

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: isExact ? q.slice(1, -1) : q, limit: 20, exact: isExact })
      })
      const data = await res.json()
      setResults(data.results || [])
    } catch (err) {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function toggleExpand(i) {
    setExpanded(prev => ({ ...prev, [i]: !prev[i] }))
  }

  function getDocLabel(r) {
    if (r.loai === 'LUAT' && r.van_ban) return r.van_ban
    if (r.loai === 'QCVN') return 'QCVN 06:2022/BXD'
    if (r.loai === 'TCVN') return 'TCVN 7336:2021'
    return r.van_ban || r.loai || 'N/A'
  }

  function getDocSection(r) {
    return [r.phan, r.don_vi, r.tieu_de].filter(Boolean).join(' — ')
  }

  function getPreview(text) {
    return (text || '').replace(/#+\s*/g, '').replace(/\|.*\|/g, '[bảng]').replace(/---+/g, '').slice(0, 150)
  }

  const loaiColors = {
    'LUAT': 'bg-vs-red text-white',
    'QCVN': 'bg-amber-600 text-white',
    'TCVN': 'bg-blue-600 text-white'
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
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
              placeholder='"cụm từ chính xác" hoặc từ khóa'
              className="vs-input pl-8 text-xs"
            />
          </div>
          <button type="submit" disabled={loading || !query.trim()} className="vs-btn-primary flex-shrink-0 disabled:opacity-50 text-xs px-3">Tìm</button>
        </form>
        <p className="text-[10px] text-vs-gray-mid mt-1">💡 Dùng <code className="bg-gray-100 px-1 rounded">&quot;dấu ngoặc kép&quot;</code> để tìm chính xác</p>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!searched ? (
          <div className="p-5 text-center">
            <svg className="w-10 h-10 mx-auto text-gray-200 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" strokeWidth="2"/>
            </svg>
            <p className="text-xs text-vs-gray-mid mb-3">Tìm kiếm trong các văn bản PCCC</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {['sprinkler', 'thoát nạn', 'báo cháy', 'bơm chữa cháy', '"khoảng cách tối đa"'].map(kw => (
                <button key={kw} onClick={() => setQuery(kw)}
                  className="text-[11px] px-2.5 py-1 bg-gray-100 text-vs-gray rounded-full hover:bg-red-50 hover:text-vs-red transition">
                  {kw}
                </button>
              ))}
            </div>
          </div>
        ) : loading ? (
          <div className="p-5 text-center">
            <span className="inline-block w-5 h-5 border-2 border-vs-red border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-vs-gray-mid mt-2">Đang tìm kiếm...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="p-5 text-center">
            <p className="text-xs text-vs-gray-mid">Không tìm thấy kết quả cho &ldquo;{query}&rdquo;</p>
            {searchMode === 'exact' && <p className="text-[10px] text-vs-gray-mid mt-1">Thử bỏ &quot; &quot; để tìm tương đối</p>}
          </div>
        ) : (
          <div>
            <div className="px-3 py-1.5 bg-gray-50 text-[11px] text-vs-gray-mid font-medium sticky top-0 z-10">
              {results.length} kết quả ({searchMode === 'exact' ? 'chính xác' : 'tương đối'}) — nhấn để xem đầy đủ
            </div>

            {results.map((r, i) => {
              const isOpen = expanded[i]
              const content = r.content || r.text || ''
              return (
                <div key={i} className="border-b border-gray-100">
                  {/* Clickable header */}
                  <button
                    onClick={() => toggleExpand(i)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 transition ${isOpen ? 'bg-red-50/50' : ''}`}
                  >
                    <div className="flex items-start gap-2 mb-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${loaiColors[r.loai] || 'bg-gray-500 text-white'}`}>
                        {getDocLabel(r)}
                      </span>
                      <span className="text-[10px] text-vs-red font-medium truncate flex-1">
                        {getDocSection(r)}
                      </span>
                      <span className="text-[10px] text-vs-gray-mid flex-shrink-0">
                        {isOpen ? '▲' : '▼'}
                      </span>
                    </div>

                    {/* Superseded warning */}
                    {r._superseded && (
                      <div className="mb-1 px-2 py-0.5 bg-yellow-50 border border-yellow-300 rounded text-[10px] text-yellow-700">
                        ⚠️ <b>Đã {r._supersededInfo?.status === 'superseded' ? 'bị thay thế' : 'sửa đổi'}</b>: {r._supersededInfo?.superseded_by}
                      </div>
                    )}

                    {/* Preview (when collapsed) */}
                    {!isOpen && (
                      <p className="text-[11px] text-vs-gray leading-relaxed line-clamp-2"
                        dangerouslySetInnerHTML={{ __html: highlightHtml(getPreview(content)) }} />
                    )}
                  </button>

                  {/* Expanded full content with markdown */}
                  {isOpen && (
                    <div className="px-3 pb-3 border-l-2 border-vs-red ml-3">
                      <div className="bg-white rounded p-3 text-vs-gray">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={highlightMdComponents}>
                          {content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

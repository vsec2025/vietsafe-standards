'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Trang đọc văn bản với mục lục và neo tới từng điều khoản.
 *
 * Điều khoản dựng từ chính các chunk dùng cho tìm kiếm, nên neo ở đây luôn
 * trùng với trích dẫn chat trả về — bấm chip nguồn là tới đúng chỗ.
 */
export default function DocReader({ doc }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState('')
  const refs = useRef({})

  // Nhóm điều khoản theo Phần / Chương để dựng mục lục
  const groups = useMemo(() => {
    const g = []
    for (const c of doc.clauses) {
      const key = [c.phan, c.chuong].filter(Boolean).join(' › ') || 'Nội dung'
      if (!g.length || g[g.length - 1].key !== key) g.push({ key, items: [] })
      g[g.length - 1].items.push(c)
    }
    return g
  }, [doc.clauses])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return null
    return doc.clauses.filter(
      (c) =>
        c.don_vi.toLowerCase().includes(s) ||
        c.tieu_de.toLowerCase().includes(s) ||
        c.content.toLowerCase().includes(s)
    )
  }, [q, doc.clauses])

  // Cuộn tới điều khoản trong URL (#3.4.1) và tô sáng
  useEffect(() => {
    const go = () => {
      const target = decodeURIComponent(window.location.hash.replace(/^#/, ''))
      if (!target) return
      setActive(target)
      const el = refs.current[target]
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    go()
    window.addEventListener('hashchange', go)
    return () => window.removeEventListener('hashchange', go)
  }, [doc.slug])

  function jump(anchor) {
    setActive(anchor)
    refs.current[anchor]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    history.replaceState(null, '', `#${encodeURIComponent(anchor)}`)
  }

  return (
    <div className="flex gap-6 items-start">
      {/* Mục lục */}
      <aside className="hidden lg:block w-72 shrink-0 sticky top-4 max-h-[85vh] overflow-y-auto bg-white rounded-lg shadow p-3">
        <p className="text-xs font-semibold text-vs-dark mb-2">MỤC LỤC</p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Lọc điều khoản..."
          className="w-full text-xs border border-gray-200 rounded px-2 py-1 mb-2"
        />
        {(filtered ? [{ key: `${filtered.length} kết quả`, items: filtered }] : groups).map((g, i) => (
          <div key={i} className="mb-3">
            <p className="text-[10px] uppercase tracking-wide text-vs-gray-mid mb-1">{g.key}</p>
            <ul className="space-y-0.5">
              {g.items.map((c) => (
                <li key={c.anchor}>
                  <button
                    onClick={() => jump(c.anchor)}
                    className={`text-left w-full text-[11px] leading-snug px-1.5 py-1 rounded hover:bg-gray-50 ${
                      active === c.anchor ? 'bg-red-50 text-vs-red font-medium' : 'text-vs-gray'
                    }`}
                  >
                    <b>{c.don_vi}</b>
                    {c.tieu_de ? ` — ${c.tieu_de.slice(0, 52)}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>

      {/* Nội dung */}
      <article className="flex-1 min-w-0 bg-white rounded-lg shadow p-6">
        <header className="border-b border-gray-200 pb-3 mb-4">
          <h1 className="text-lg font-bold text-vs-dark font-montserrat">{doc.van_ban}</h1>
          <p className="text-xs text-vs-gray-mid mt-1">
            {[doc.co_quan, doc.nam && `Năm ${doc.nam}`, `${doc.clauses.length} điều khoản`]
              .filter(Boolean)
              .join(' • ')}
          </p>
        </header>

        {(filtered || doc.clauses).map((c) => (
          <section
            key={c.anchor}
            id={c.anchor}
            ref={(el) => { refs.current[c.anchor] = el }}
            className={`scroll-mt-4 mb-5 pl-3 border-l-2 transition-colors ${
              active === c.anchor ? 'border-vs-red bg-red-50/40' : 'border-transparent'
            }`}
          >
            <div className="flex items-baseline gap-2 mb-1">
              <button
                onClick={() => jump(c.anchor)}
                title="Sao chép liên kết tới điều khoản này"
                className="text-xs font-bold text-vs-red hover:underline shrink-0"
              >
                {c.don_vi}
              </button>
              {c.tieu_de && (
                <span className="text-xs font-medium text-vs-dark">{c.tieu_de}</span>
              )}
            </div>
            <div className="prose-sm text-sm text-vs-gray leading-relaxed max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.content}</ReactMarkdown>
            </div>
          </section>
        ))}

        {filtered && filtered.length === 0 && (
          <p className="text-sm text-vs-gray-mid">Không có điều khoản nào khớp “{q}”.</p>
        )}
      </article>
    </div>
  )
}

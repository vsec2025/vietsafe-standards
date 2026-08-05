'use client'

/**
 * "Văn bản đã sử dụng" — gộp các điều khoản được trích theo từng văn bản,
 * để người đọc thấy ngay câu trả lời dựa trên những QCVN/TCVN nào.
 */
export default function SourcesUsedList({ sources = [] }) {
  if (!sources.length) return null

  const byDoc = new Map()
  for (const s of sources) {
    const key = s.doc_slug || s.van_ban || 'khac'
    if (!byDoc.has(key)) {
      byDoc.set(key, { slug: s.doc_slug, name: s.van_ban || s.label, clauses: [] })
    }
    if (s.don_vi) byDoc.get(key).clauses.push(s.don_vi)
  }

  const docs = [...byDoc.values()]
  if (!docs.length) return null

  return (
    <div className="mt-2 pt-2 border-t border-gray-200">
      <p className="text-[10px] text-vs-gray-mid font-medium mb-1.5">
        Văn bản đã sử dụng ({docs.length})
      </p>
      <ul className="space-y-1">
        {docs.map((d, i) => (
          <li key={i} className="text-[11px] leading-snug">
            {d.slug ? (
              <a
                href={`/van-ban/${d.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-vs-red hover:underline"
              >
                {d.name}
              </a>
            ) : (
              <span className="font-medium text-vs-dark">{d.name}</span>
            )}
            {d.clauses.length > 0 && (
              <span className="text-vs-gray-mid">
                {' '}— {[...new Set(d.clauses)].join(', ')}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

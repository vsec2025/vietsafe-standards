'use client'

/**
 * Chip nguồn có đánh số, khớp với các dấu [1], [2] trong câu trả lời.
 * Bấm vào mở đúng điều khoản trong trang đọc văn bản (/van-ban/<slug>#<điều>).
 */
export default function CitationChips({ sources = [] }) {
  if (!sources.length) return null

  return (
    <div className="mt-2 pt-2 border-t border-gray-200">
      <p className="text-[10px] text-vs-gray-mid font-medium mb-1.5">
        Nguồn trích dẫn ({sources.length})
      </p>
      <div className="flex flex-wrap gap-1">
        {sources.map((s, i) => {
          const label = [s.van_ban, s.don_vi].filter(Boolean).join(' · ') || s.label
          const cls =
            'inline-flex items-center gap-1.5 text-[10px] px-2 py-1 bg-white border border-gray-200 rounded-lg text-vs-gray-mid max-w-full'
          const inner = (
            <>
              <b className="text-vs-red shrink-0">{i + 1}</b>
              <span className="truncate">{label}</span>
            </>
          )
          return s.doc_slug && s.anchor ? (
            <a
              key={i}
              href={`/van-ban/${s.doc_slug}#${encodeURIComponent(s.anchor)}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`Mở ${label} để đối chiếu`}
              className={`${cls} hover:border-vs-red hover:text-vs-dark transition`}
            >
              {inner}
              <span className="text-vs-red shrink-0">↗</span>
            </a>
          ) : (
            <span key={i} className={cls} title={s.label}>{inner}</span>
          )
        })}
      </div>
    </div>
  )
}

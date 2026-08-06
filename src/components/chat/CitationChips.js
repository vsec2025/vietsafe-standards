'use client'

/**
 * Chip nguồn có đánh số, khớp với các dấu [1], [2] trong câu trả lời.
 * Bấm vào mở đúng điều khoản trong trang đọc văn bản (/van-ban/<slug>#<điều>).
 */
export default function CitationChips({ sources = [], activeIdx, onSelect }) {
  if (!sources.length) return null

  return (
    <div className="mt-2 pt-2 border-t border-gray-200">
      <p className="text-[10px] text-vs-gray-mid font-medium mb-1.5">
        Nguồn trích dẫn ({sources.length}) — bấm để xem điều khoản
      </p>
      <div className="flex flex-wrap gap-1">
        {sources.map((s, i) => {
          const label = [s.van_ban, s.don_vi].filter(Boolean).join(' · ') || s.label
          const active = activeIdx === i
          return (
            <button
              key={i}
              onClick={() => onSelect?.(i)}
              title={active ? 'Đóng' : `Xem ${label}`}
              className={`inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg border max-w-full transition ${
                active
                  ? 'bg-vs-red text-white border-vs-red'
                  : 'bg-white border-gray-200 text-vs-gray-mid hover:border-vs-red hover:text-vs-dark'
              }`}
            >
              <b className={`shrink-0 ${active ? 'text-white' : 'text-vs-red'}`}>{i + 1}</b>
              <span className="truncate">{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

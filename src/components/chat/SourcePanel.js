'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Nội dung điều khoản mở ngay dưới câu trả lời khi bấm vào số mũ hoặc chip.
 *
 * Mở tại chỗ thay vì sang tab mới: người đọc đối chiếu ngay trong mạch câu trả
 * lời, không mất ngữ cảnh. Muốn xem trọn văn bản thì mới sang trang đọc.
 */
export default function SourcePanel({ source, index, onClose }) {
  if (!source) return null

  return (
    <div className="mt-2 border border-vs-red/30 bg-red-50/40 rounded-xl overflow-hidden">
      <div className="flex items-start gap-2 px-3 py-2 border-b border-vs-red/20 bg-white/60">
        <span className="shrink-0 w-5 h-5 rounded-full bg-vs-red text-white text-[10px] font-bold flex items-center justify-center">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-vs-dark truncate">
            {source.van_ban}
            {source.don_vi ? <span className="text-vs-red"> · {source.don_vi}</span> : null}
          </p>
          {source.tieu_de && (
            <p className="text-[11px] text-vs-gray-mid truncate">{source.tieu_de}</p>
          )}
        </div>
        {source.doc_slug && source.anchor && (
          <a
            href={`/van-ban/${source.doc_slug}#${encodeURIComponent(source.anchor)}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Mở toàn văn trong trang đọc"
            className="shrink-0 text-[10px] text-vs-red hover:underline whitespace-nowrap"
          >
            Toàn văn ↗
          </a>
        )}
        <button
          onClick={onClose}
          title="Đóng"
          className="shrink-0 text-gray-400 hover:text-vs-dark leading-none text-base px-1"
        >×</button>
      </div>

      <div className="px-3 py-2 max-h-72 overflow-y-auto prose-sm text-[13px] text-vs-gray leading-relaxed">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{source.excerpt || ''}</ReactMarkdown>
        {source.truncated && (
          <p className="mt-1 text-[10px] italic text-vs-gray-mid">
            (Đã rút gọn — bấm “Toàn văn” để đọc đầy đủ)
          </p>
        )}
      </div>
    </div>
  )
}

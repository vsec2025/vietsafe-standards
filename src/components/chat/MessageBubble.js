'use client'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CitationChips from './CitationChips'
import SourcesUsedList from './SourcesUsedList'

const CITE_RE = /\[(\d{1,2})\]/g

/**
 * Đổi các dấu [1], [2] trong văn bản thành số mũ bấm được.
 *
 * Làm ở tầng render thay vì cho model xuất HTML: nội dung model trả về được
 * coi là dữ liệu, không phải mã — tránh chèn HTML tuỳ ý vào trang.
 */
function withCitations(children, sources) {
  const arr = Array.isArray(children) ? children : [children]
  return arr.flatMap((child, ci) => {
    if (typeof child !== 'string') return [child]
    const out = []
    let last = 0
    for (const m of child.matchAll(CITE_RE)) {
      const n = parseInt(m[1], 10)
      const s = sources?.[n - 1]
      if (m.index > last) out.push(child.slice(last, m.index))
      out.push(
        s?.doc_slug && s?.anchor ? (
          <a
            key={`${ci}-${m.index}`}
            href={`/van-ban/${s.doc_slug}#${encodeURIComponent(s.anchor)}`}
            target="_blank"
            rel="noopener noreferrer"
            title={[s.van_ban, s.don_vi].filter(Boolean).join(' · ')}
            className="align-super text-[9px] font-bold text-vs-red hover:underline mx-px"
          >
            {n}
          </a>
        ) : (
          <sup key={`${ci}-${m.index}`} className="text-[9px] font-bold text-vs-red mx-px">{n}</sup>
        )
      )
      last = m.index + m[0].length
    }
    if (last < child.length) out.push(child.slice(last))
    return out.length ? out : [child]
  })
}

function IconBtn({ title, onClick, active, children, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1 rounded transition disabled:cursor-default ${
        active ? 'bg-red-50 text-vs-red' : 'text-gray-400 hover:text-vs-red hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}

export default function MessageBubble({ msg, onFeedback, onRegenerate, feedbackSent }) {
  const [copied, setCopied] = useState(false)
  const isUser = msg.role === 'user'
  const sources = msg.sources || []

  async function copy() {
    try {
      await navigator.clipboard.writeText(msg.content || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* trình duyệt chặn clipboard */ }
  }

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-vs-red text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    )
  }

  // Bọc các thẻ có thể chứa trích dẫn để chèn số mũ
  const cite = (Tag) => ({ children, ...p }) => <Tag {...p}>{withCitations(children, sources)}</Tag>
  const mdComponents = {
    p: cite('p'),
    li: cite('li'),
    td: cite('td'),
    strong: cite('strong'),
    table: ({ children }) => (
      <div className="overflow-x-auto my-2">
        <table className="min-w-full text-xs border-collapse">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-semibold">{children}</th>
    ),
    code: ({ children }) => (
      <code className="bg-gray-100 rounded px-1 py-0.5 text-[12px]">{children}</code>
    ),
  }
  mdComponents.td = ({ children, ...p }) => (
    <td {...p} className="border border-gray-200 px-2 py-1 align-top">{withCitations(children, sources)}</td>
  )

  return (
    <div className="bg-gray-50 rounded-2xl rounded-bl-sm px-4 py-3 max-w-[92%]">
      {msg.has_basis !== undefined && (
        <div className="mb-2">
          {msg.has_basis ? (
            <span className="inline-block text-[10px] px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full">
              ✓ Có cơ sở pháp lý
            </span>
          ) : (
            <span className="inline-block text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
              ⚠ Không tìm thấy trích dẫn cụ thể
            </span>
          )}
        </div>
      )}

      <div className="prose-sm text-sm text-vs-dark leading-relaxed">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {msg.content}
        </ReactMarkdown>
      </div>

      <SourcesUsedList sources={sources} />
      <CitationChips sources={sources} />

      <div className="mt-2 pt-1.5 flex items-center gap-1">
        <IconBtn title={copied ? 'Đã sao chép' : 'Sao chép'} onClick={copy} active={copied}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </IconBtn>

        {onRegenerate && (
          <IconBtn title="Tạo lại câu trả lời" onClick={onRegenerate}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </IconBtn>
        )}

        {msg.log_id && (
          <>
            <span className="w-px h-3.5 bg-gray-200 mx-0.5" />
            <IconBtn
              title="Hữu ích"
              onClick={() => onFeedback?.(msg.log_id, 1)}
              disabled={!!feedbackSent}
              active={feedbackSent === 1}
            >👍</IconBtn>
            <IconBtn
              title="Chưa chính xác"
              onClick={() => onFeedback?.(msg.log_id, -1)}
              disabled={!!feedbackSent}
              active={feedbackSent === -1}
            >👎</IconBtn>
          </>
        )}

        <span className="ml-auto text-[9px] text-vs-gray-mid">
          {msg.model_used?.includes('sonnet') ? 'Sonnet' : msg.model_used?.includes('haiku') ? 'Haiku' : ''}
        </span>
      </div>
    </div>
  )
}

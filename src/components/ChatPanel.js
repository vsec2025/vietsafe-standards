'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import UsageTracker from './UsageTracker'

const MODES = [
  { key: 'vn_only',      label: 'Tiêu chuẩn VN',    desc: 'Hỏi đáp quy định PCCC Việt Nam',        icon: '🇻🇳' },
  // Tạm tắt — corpus chưa có NFPA/ISO/EN nên không có gì để đối chiếu.
  // Bật lại: bỏ comment dòng dưới VÀ đặt VSEC_ENABLE_INTL_COMPARE=1 trên server.
  // { key: 'intl_compare', label: 'Đối chiếu QT',   desc: 'So sánh với NFPA, ISO, EN',              icon: '🌐' },
  { key: 'project',      label: 'Dự án',             desc: 'Kiểm tra tài liệu dự án với tiêu chuẩn', icon: '📋' },
]

const SUGGESTIONS = [
  'Yêu cầu lắp đặt sprinkler cho nhà cao tầng?',
  'Khoảng cách tối đa đến lối thoát nạn?',
  'Quy định về hệ thống báo cháy tự động?',
  'Yêu cầu bơm chữa cháy theo TCVN 7336?',
]

const mdComponents = {
  table: ({children}) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-xs border-collapse border border-gray-300">{children}</table>
    </div>
  ),
  thead: ({children}) => <thead className="bg-vs-red text-white">{children}</thead>,
  th: ({children}) => <th className="border border-gray-300 px-2 py-1.5 text-left font-semibold text-xs">{children}</th>,
  td: ({children}) => <td className="border border-gray-300 px-2 py-1.5 text-xs">{children}</td>,
  tr: ({children}) => <tr className="even:bg-gray-50">{children}</tr>,
  h1: ({children}) => <h1 className="text-base font-bold text-vs-dark mt-3 mb-1">{children}</h1>,
  h2: ({children}) => <h2 className="text-sm font-bold text-vs-dark mt-2.5 mb-1">{children}</h2>,
  h3: ({children}) => <h3 className="text-sm font-semibold text-vs-gray mt-2 mb-1">{children}</h3>,
  h4: ({children}) => <h4 className="text-xs font-semibold text-vs-gray mt-1.5 mb-0.5">{children}</h4>,
  p: ({children}) => <p className="text-xs leading-relaxed mb-1.5">{children}</p>,
  ul: ({children}) => <ul className="list-disc list-inside text-xs space-y-0.5 ml-2 mb-1.5">{children}</ul>,
  ol: ({children}) => <ol className="list-decimal list-inside text-xs space-y-0.5 ml-2 mb-1.5">{children}</ol>,
  li: ({children}) => <li className="text-xs leading-relaxed">{children}</li>,
  strong: ({children}) => <strong className="font-semibold text-vs-dark">{children}</strong>,
  code: ({children, className}) => {
    if (className) return <pre className="bg-gray-100 rounded p-2 text-xs overflow-x-auto my-1"><code>{children}</code></pre>
    return <code className="bg-gray-100 rounded px-1 text-[11px] font-mono">{children}</code>
  },
  blockquote: ({children}) => <blockquote className="border-l-2 border-vs-red pl-2 italic text-vs-gray-mid text-xs my-1">{children}</blockquote>,
}

export default function ChatPanel() {
  const { data: session } = useSession()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState('vn_only')
  const [questionCount, setQuestionCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState({}) // { log_id: 1 | -1 }
  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendFeedback = useCallback(async (log_id, value) => {
    if (!log_id || feedbackSent[log_id]) return
    setFeedbackSent(prev => ({ ...prev, [log_id]: value }))
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_id, feedback: value }),
      })
    } catch { /* silent */ }
  }, [feedbackSent])

  async function handleSend(e) {
    e?.preventDefault?.()
    const text = typeof e === 'string' ? e : input.trim()
    if (!text || loading) return

    setMessages(prev => [...prev, { role: 'user', content: text }])
    setInput('')
    setLoading(true)
    setQuestionCount(prev => prev + 1)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          mode,
          history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      if (data.error) {
        setMessages(prev => [...prev, { role: 'system', content: `Lỗi: ${data.error}` }])
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.reply,
          sources: data.sources,
          has_basis: data.has_basis,
          model_used: data.model_used,
          log_id: data.log_id,
        }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'system', content: 'Lỗi kết nối' }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const currentMode = MODES.find(m => m.key === mode)

  return (
    <div className="flex flex-col h-full">
      {/* Mode selector */}
      <div className="border-b border-gray-200 bg-white px-4 py-2 flex items-center gap-1">
        {MODES.map(m => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            title={m.desc}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
              mode === m.key
                ? 'bg-vs-red text-white shadow-sm'
                : 'text-vs-gray-mid hover:bg-gray-100'
            }`}
          >
            <span>{m.icon}</span>
            <span className="hidden sm:inline">{m.label}</span>
          </button>
        ))}
        <span className="ml-auto text-[10px] text-vs-gray-mid hidden md:block">{currentMode?.desc}</span>
        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="ml-2 text-xs px-2 py-1 text-vs-gray-mid hover:text-vs-red hover:bg-red-50 rounded transition"
          >
            Xóa chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 max-w-lg mx-auto">
            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" className="w-7 h-7 text-vs-red" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <h3 className="text-base font-semibold text-vs-dark mb-1">Trợ lý tiêu chuẩn PCCC</h3>
            <p className="text-xs text-vs-gray-mid mb-5">
              {currentMode?.desc} — tự động tìm kiếm trong cơ sở dữ liệu văn bản
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md mx-auto">
              {SUGGESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(q)}
                  className="text-left text-xs px-3 py-2.5 bg-gray-50 rounded-lg hover:bg-red-50 hover:text-vs-red transition border border-gray-100"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`rounded-lg px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-vs-red text-white max-w-[70%]'
                : msg.role === 'system'
                ? 'bg-yellow-50 text-yellow-700 border border-yellow-200 max-w-[85%]'
                : 'bg-gray-50 text-vs-gray max-w-[85%] border border-gray-100'
            }`}>
              {msg.role === 'assistant' ? (
                <>
                  {/* has_basis badge */}
                  {msg.has_basis !== undefined && (
                    <div className="mb-2">
                      {msg.has_basis
                        ? <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full font-medium">
                            ✓ Có cơ sở pháp lý
                          </span>
                        : <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-full font-medium">
                            ⚠ Không tìm thấy trích dẫn cụ thể
                          </span>
                      }
                    </div>
                  )}

                  {/* Content */}
                  <div className="prose-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>

                  {/* Sources */}
                  {msg.sources?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="text-[10px] text-vs-gray-mid font-medium mb-1">📄 Nguồn tham khảo:</p>
                      <div className="flex flex-wrap gap-1">
                        {msg.sources.map((s, j) => (
                          <span key={j} className="inline-block text-[10px] px-1.5 py-0.5 bg-white border border-gray-200 rounded text-vs-gray-mid">
                            {s.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Feedback + model */}
                  <div className="mt-2 pt-1.5 flex items-center gap-2">
                    <span className="text-[9px] text-vs-gray-mid flex-1">
                      {msg.model_used?.includes('haiku') ? 'Haiku' : msg.model_used?.includes('sonnet') ? 'Sonnet' : ''}
                    </span>
                    {msg.log_id && (
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-vs-gray-mid">Phản hồi:</span>
                        <button
                          onClick={() => sendFeedback(msg.log_id, 1)}
                          disabled={!!feedbackSent[msg.log_id]}
                          className={`text-sm px-1.5 py-0.5 rounded transition ${
                            feedbackSent[msg.log_id] === 1
                              ? 'bg-green-100 text-green-600'
                              : 'hover:bg-green-50 text-gray-400 hover:text-green-600'
                          } disabled:cursor-default`}
                          title="Hữu ích"
                        >👍</button>
                        <button
                          onClick={() => sendFeedback(msg.log_id, -1)}
                          disabled={!!feedbackSent[msg.log_id]}
                          className={`text-sm px-1.5 py-0.5 rounded transition ${
                            feedbackSent[msg.log_id] === -1
                              ? 'bg-red-100 text-red-500'
                              : 'hover:bg-red-50 text-gray-400 hover:text-red-500'
                          } disabled:cursor-default`}
                          title="Không hữu ích"
                        >👎</button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-vs-red rounded-full animate-bounce" style={{animationDelay:'0ms'}}/>
                  <span className="w-2 h-2 bg-vs-red rounded-full animate-bounce" style={{animationDelay:'150ms'}}/>
                  <span className="w-2 h-2 bg-vs-red rounded-full animate-bounce" style={{animationDelay:'300ms'}}/>
                </div>
                <span className="text-xs text-vs-gray-mid">Đang tìm và phân tích...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <UsageTracker questionCount={questionCount} />

      {/* Input */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <form onSubmit={handleSend} className="flex gap-2 max-w-3xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={`Nhập câu hỏi — chế độ: ${currentMode?.label}...`}
            className="vs-input text-sm"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="vs-btn-primary flex-shrink-0 disabled:opacity-50 px-4"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}

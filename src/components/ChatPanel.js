'use client'
import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function ChatPanel() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e) {
    e?.preventDefault()
    const text = typeof e === 'string' ? e : input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
        })
      })
      const data = await res.json()
      if (data.error) {
        setMessages(prev => [...prev, { role: 'system', content: `Lỗi: ${data.error}` }])
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.reply,
          sources: data.sources
        }])
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'system', content: 'Lỗi kết nối' }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  // Markdown components for styled rendering
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
      return <code className="bg-gray-100 px-1 rounded text-xs">{children}</code>
    },
    blockquote: ({children}) => <blockquote className="border-l-2 border-vs-red pl-2 my-1.5 text-xs text-vs-gray-mid italic">{children}</blockquote>,
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-vs-red rounded-full flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-vs-dark font-montserrat">Hỏi đáp AI — Tiêu chuẩn PCCC</h2>
            <p className="text-[10px] text-vs-gray-mid">Hỏi bất kỳ câu hỏi nào về Luật PCCC, QCVN, TCVN</p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="ml-auto text-xs px-2 py-1 text-vs-gray-mid hover:text-vs-red hover:bg-red-50 rounded transition"
            >
              Xóa chat
            </button>
          )}
        </div>
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
            <p className="text-xs text-vs-gray-mid mb-5">Hệ thống tự động tìm kiếm trong cơ sở dữ liệu và trả lời dựa trên nội dung văn bản</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md mx-auto">
              {[
                'Yêu cầu lắp đặt sprinkler cho nhà cao tầng?',
                'Khoảng cách tối đa đến lối thoát nạn?',
                'Quy định về hệ thống báo cháy tự động?',
                'Yêu cầu bơm chữa cháy theo TCVN 7336?'
              ].map((q, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(q); handleSend(q) }}
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
                <div className="prose-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                    {msg.content}
                  </ReactMarkdown>
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
                </div>
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

      {/* Input */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <form onSubmit={handleSend} className="flex gap-2 max-w-3xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Nhập câu hỏi về tiêu chuẩn PCCC..."
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

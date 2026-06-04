'use client'
import { useState, useRef, useEffect } from 'react'

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
    if (!input.trim() || loading) return

    const userMsg = { role: 'user', content: input.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.content,
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

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 bg-vs-gray-light">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-vs-red rounded-full flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-vs-dark font-montserrat">Hỏi đáp AI</h2>
            <p className="text-[10px] text-vs-gray-mid">Trợ lý tiêu chuẩn PCCC</p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="ml-auto text-[10px] px-2 py-0.5 text-vs-gray-mid hover:text-vs-red transition"
            >
              Xóa chat
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-vs-red" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <p className="text-xs text-vs-gray-mid mb-3">Hỏi bất kỳ câu hỏi nào về tiêu chuẩn PCCC</p>
            <div className="space-y-1.5">
              {[
                'Yêu cầu lắp đặt sprinkler cho nhà cao tầng?',
                'Khoảng cách tối đa đến lối thoát nạn?',
                'Quy định về hệ thống báo cháy tự động?'
              ].map((q, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(q); setTimeout(() => handleSend(), 50) }}
                  className="block w-full text-left text-[11px] px-3 py-2 bg-gray-50 rounded hover:bg-red-50 hover:text-vs-red transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 ${
              msg.role === 'user'
                ? 'bg-vs-red text-white'
                : msg.role === 'system'
                ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                : 'bg-gray-100 text-vs-gray'
            }`}>
              <p className="text-xs whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              {msg.sources?.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <p className="text-[10px] text-vs-gray-mid font-medium mb-1">Nguồn tham khảo:</p>
                  {msg.sources.map((s, j) => (
                    <span key={j} className="inline-block text-[10px] px-1.5 py-0.5 bg-white rounded mr-1 mb-1 text-vs-gray-mid">
                      {s.doc_id}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-vs-gray-mid rounded-full animate-bounce" style={{animationDelay:'0ms'}}/>
                <span className="w-2 h-2 bg-vs-gray-mid rounded-full animate-bounce" style={{animationDelay:'150ms'}}/>
                <span className="w-2 h-2 bg-vs-gray-mid rounded-full animate-bounce" style={{animationDelay:'300ms'}}/>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-200">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Nhập câu hỏi..."
            className="vs-input text-xs"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="vs-btn-primary flex-shrink-0 disabled:opacity-50 px-3"
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

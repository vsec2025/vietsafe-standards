'use client'
import { useState, useRef, useEffect } from 'react'
import { ChatMessage, SearchResult } from '@/types'
import { Send, Trash2, Clock } from 'lucide-react'
import { ChunkCard } from './ChunkCard'

interface Props {
  contextChunk?: SearchResult
}

export function ChatPanel({ contextChunk }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Tự động đặt câu hỏi khi có context chunk mới
  useEffect(() => {
    if (contextChunk) {
      setInput(`Giải thích cho tôi về ${contextChunk.chunk.don_vi}${contextChunk.chunk.tieu_de ? ' — ' + contextChunk.chunk.tieu_de : ''} trong ${contextChunk.chunk.van_ban}`)
    }
  }, [contextChunk])

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    setError(null)
    setWarning(null)

    const userMsg: ChatMessage = {
      id: Date.now().toString(), role: 'user', content: input,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    const question = input
    setInput('')
    setLoading(true)

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        history: messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
      }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      if (data.error === 'budget_exceeded') setError(data.message)
      else setError('Có lỗi xảy ra. Vui lòng thử lại.')
      return
    }

    if (data.warnings) setWarning(data.warnings)

    const assistantMsg: ChatMessage = {
      id: (Date.now() + 1).toString(), role: 'assistant',
      content: data.answer, sources: data.sources,
      timestamp: new Date().toISOString(),
      cost_usd: data.usage?.cost_usd,
    }
    setMessages(prev => [...prev, assistantMsg])
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Header */}
      <div className="bg-[#C8102E] px-4 py-3 flex items-center justify-between shrink-0">
        <div className="text-white font-semibold text-sm">Hỏi đáp AI</div>
        <button
          onClick={() => setMessages([])}
          className="text-white/70 hover:text-white p-1 rounded"
          title="Xóa hội thoại"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-8">
            <div className="text-3xl mb-2">💬</div>
            <div>Đặt câu hỏi về tiêu chuẩn, quy chuẩn PCCC</div>
            <div className="text-xs mt-1">Hệ thống sẽ tìm và trích dẫn điều khoản liên quan</div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
              msg.role === 'user'
                ? 'bg-[#C8102E] text-white'
                : 'bg-gray-100 text-gray-800'
            }`}>
              <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <div className="text-xs text-gray-500 font-medium">Nguồn tham chiếu:</div>
                  {msg.sources.slice(0, 3).map((s, i) => (
                    <div key={i} className="text-xs bg-white border border-gray-200 rounded p-1.5">
                      <span className="font-medium text-[#C8102E]">{s.chunk.van_ban}</span>
                      {' — '}{s.chunk.don_vi}
                      {s.chunk.tieu_de && `: ${s.chunk.tieu_de}`}
                    </div>
                  ))}
                </div>
              )}
              <div className="text-xs mt-1 opacity-50">
                {new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-3 py-2">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {warning && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-xs text-yellow-700">
            {warning}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-3 shrink-0">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder="Nhập câu hỏi... (Enter để gửi)"
            rows={2}
            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="bg-[#C8102E] hover:bg-[#a00d24] text-white p-2 rounded-lg transition disabled:opacity-50 self-end"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

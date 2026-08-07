'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import UsageTracker from './UsageTracker'
import EmptyState from './chat/EmptyState'
import MessageBubble from './chat/MessageBubble'
import AboutModal from './chat/AboutModal'

const MODES = [
  { key: 'vn_only', label: 'Tiêu chuẩn VN', desc: 'Hỏi đáp quy định PCCC Việt Nam', icon: '🇻🇳',
    placeholder: 'Hỏi về quy định PCCC — ví dụ: bậc chịu lửa yêu cầu cho nhà xưởng hạng C?' },
  // Tạm tắt — corpus chưa có NFPA/ISO/EN nên không có gì để đối chiếu.
  // Bật lại: bỏ comment dòng dưới VÀ đặt VSEC_ENABLE_INTL_COMPARE=1 trên server.
  // { key: 'intl_compare', label: 'Đối chiếu QT', desc: 'So sánh với NFPA, ISO, EN', icon: '🌐',
  //   placeholder: 'Mô tả vấn đề cần đối chiếu Việt Nam – quốc tế...' },
  // Tạm tắt để tập trung vào tra cứu bằng AI. Bật lại: bỏ comment dòng dưới
  // VÀ đặt VSEC_ENABLE_PROJECT=1 trên server (chốt chặn nằm ở /api/batch-check).
  // { key: 'project', label: 'Dự án', desc: 'Kiểm tra tài liệu dự án với tiêu chuẩn', icon: '📋',
  //   placeholder: 'Mô tả hạng mục dự án cần đối chiếu với quy chuẩn...' },
]

const SUGGESTIONS = [
  'Yêu cầu lắp đặt sprinkler cho nhà cao tầng?',
  'Khoảng cách tối đa đến lối thoát nạn?',
  'Quy định về hệ thống báo cháy tự động?',
  'Quy trình tính bề rộng thang thoát nạn?',
]

/**
 * Khung trợ lý. Hội thoại được lưu qua /api/conversations (Redis) nên còn
 * nguyên sau khi tải lại trang và đồng bộ giữa các thiết bị.
 */
export default function ChatPanel({ conversationId, onConversationSaved, onNewConversation }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState('vn_only')
  const [questionCount, setQuestionCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState({})
  const [showAbout, setShowAbout] = useState(false)
  const [quota, setQuota] = useState(null) // { spent, budget } VND hôm nay
  const endRef = useRef(null)
  const inputRef = useRef(null)
  const convRef = useRef(conversationId || null)

  const currentMode = MODES.find((m) => m.key === mode) || MODES[0]

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  // Mở một hội thoại cũ từ sidebar
  useEffect(() => {
    convRef.current = conversationId || null
    if (!conversationId) { setMessages([]); return }
    let alive = true
    fetch(`/api/conversations?id=${encodeURIComponent(conversationId)}`)
      .then((r) => r.json())
      .then((d) => { if (alive && Array.isArray(d.messages)) setMessages(d.messages) })
      .catch(() => {})
    return () => { alive = false }
  }, [conversationId])

  // Lưu lại sau mỗi lượt trả lời
  const persist = useCallback(async (msgs) => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: convRef.current, messages: msgs }),
      })
      const d = await res.json()
      if (d.conversation) {
        convRef.current = d.conversation.id
        onConversationSaved?.(d.conversation)
      }
    } catch { /* không chặn hội thoại nếu lưu lỗi */ }
  }, [onConversationSaved])

  const sendFeedback = useCallback(async (log_id, value) => {
    if (!log_id || feedbackSent[log_id]) return
    setFeedbackSent((p) => ({ ...p, [log_id]: value }))
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_id, feedback: value }),
      })
    } catch { /* silent */ }
  }, [feedbackSent])

  const ask = useCallback(async (text, history) => {
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          mode,
          history: history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      const reply = data.error
        ? { role: 'system', content: `Lỗi: ${data.error}` }
        : {
            role: 'assistant',
            content: data.reply,
            sources: data.sources,
            has_basis: data.has_basis,
            model_used: data.model_used,
            log_id: data.log_id,
            cost_vnd: data.cost_vnd,
          }
      if (data.quota) setQuota(data.quota)
      const next = [...history, reply]
      setMessages(next)
      if (!data.error) persist(next)
    } catch {
      setMessages([...history, { role: 'system', content: 'Lỗi kết nối' }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [mode, persist])

  async function handleSend(e) {
    e?.preventDefault?.()
    const text = typeof e === 'string' ? e : input.trim()
    if (!text || loading) return
    const history = [...messages, { role: 'user', content: text }]
    setMessages(history)
    setInput('')
    setQuestionCount((n) => n + 1)
    await ask(text, history)
  }

  /** Bỏ câu trả lời cuối và hỏi lại đúng câu hỏi trước đó. */
  function regenerate() {
    if (loading) return
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser) return
    const cut = messages.slice(0, messages.lastIndexOf(lastUser) + 1)
    setMessages(cut)
    ask(lastUser.content, cut)
  }

  function newChat() {
    convRef.current = null
    setMessages([])
    setInput('')
    onNewConversation?.()
    inputRef.current?.focus()
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Thanh chế độ */}
      <div className="border-b border-gray-200 px-3 py-2 flex items-center gap-1">
        <span className="text-xs font-semibold text-vs-dark mr-1 hidden sm:inline">Trợ lý PCCC</span>
        <button
          onClick={() => setShowAbout(true)}
          title="Giới thiệu trợ lý: dữ liệu, khả năng và giới hạn"
          className="w-4 h-4 mr-2 rounded-full border border-gray-300 text-[9px] text-vs-gray-mid hover:border-vs-red hover:text-vs-red transition shrink-0"
        >i</button>

        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            title={m.desc}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
              mode === m.key ? 'bg-vs-red text-white shadow-sm' : 'text-vs-gray-mid hover:bg-gray-100'
            }`}
          >
            <span>{m.icon}</span>
            <span className="hidden sm:inline">{m.label}</span>
          </button>
        ))}

        {messages.length > 0 && (
          <button
            onClick={newChat}
            className="ml-auto text-xs px-2 py-1 text-vs-gray-mid hover:text-vs-red hover:bg-red-50 rounded transition"
          >
            Hội thoại mới
          </button>
        )}
      </div>

      {/* Nội dung */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 && !loading ? (
          <EmptyState suggestions={SUGGESTIONS} onPick={handleSend} mode={currentMode.label} />
        ) : (
          <div className="p-4 space-y-4">
            {messages.map((msg, i) =>
              msg.role === 'system' ? (
                <div key={i} className="text-xs text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                  {msg.content}
                </div>
              ) : (
                <MessageBubble
                  key={i}
                  msg={msg}
                  onFeedback={sendFeedback}
                  feedbackSent={msg.log_id ? feedbackSent[msg.log_id] : undefined}
                  onRegenerate={
                    msg.role === 'assistant' && i === messages.length - 1 ? regenerate : undefined
                  }
                />
              )
            )}

            {loading && (
              <div className="bg-gray-50 rounded-2xl rounded-bl-sm px-4 py-3 inline-flex items-center gap-2">
                <span className="flex gap-1">
                  {[0, 150, 300].map((d) => (
                    <span key={d} className="w-2 h-2 bg-vs-red rounded-full animate-bounce"
                      style={{ animationDelay: `${d}ms` }} />
                  ))}
                </span>
                <span className="text-xs text-vs-gray-mid">Đang tra cứu điều khoản...</span>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <UsageTracker questionCount={questionCount} />

      {/* Ô nhập */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <form onSubmit={handleSend} className="flex gap-2 max-w-3xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={currentMode.placeholder}
            className="vs-input text-sm"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="vs-btn-primary flex-shrink-0 disabled:opacity-50 px-4"
            title="Gửi"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
        <p className="max-w-3xl mx-auto mt-1.5 text-[10px] italic text-vs-gray-mid text-center">
          Trợ lý PCCC chỉ là điểm khởi đầu tra cứu. Vui lòng kiểm tra lại với văn bản gốc trước khi áp dụng.
        </p>
        {quota && (
          <p className="max-w-3xl mx-auto mt-1 text-[10px] text-center text-vs-gray-mid">
            Hôm nay đã dùng{' '}
            <b className={quota.spent >= quota.budget ? 'text-vs-red' : 'text-vs-gray'}>
              {quota.spent.toLocaleString('vi-VN')} ₫
            </b>{' '}/ {quota.budget.toLocaleString('vi-VN')} ₫ · đặt lại lúc 0h
          </p>
        )}
      </div>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </div>
  )
}

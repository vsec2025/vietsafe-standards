'use client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import Header from '@/components/Header'
import Sidebar from '@/components/Sidebar'
import SearchPanel from '@/components/SearchPanel'
import ChatPanel from '@/components/ChatPanel'
import ChatHistorySidebar from '@/components/chat/ChatHistorySidebar'

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [activePanel, setActivePanel] = useState('chat') // mobile toggle
  const [selectedDoc, setSelectedDoc] = useState(null)

  // Sidebar trái có 2 tab: lịch sử chat và danh sách văn bản (giữ tính năng cũ)
  const [leftTab, setLeftTab] = useState('history')
  const [conversations, setConversations] = useState([])
  const [convLoading, setConvLoading] = useState(true)
  const [activeConv, setActiveConv] = useState(null)

  const loadConversations = useCallback(async () => {
    try {
      const d = await (await fetch('/api/conversations')).json()
      setConversations(d.conversations || [])
    } catch { /* Redis chưa cấu hình -> danh sách rỗng, chat vẫn dùng được */ }
    finally { setConvLoading(false) }
  }, [])

  useEffect(() => { if (status === 'authenticated') loadConversations() }, [status, loadConversations])

  function upsertConversation(entry) {
    setActiveConv(entry.id)
    setConversations((prev) => {
      const rest = prev.filter((c) => c.id !== entry.id)
      return [entry, ...rest]
    })
  }

  async function renameConv(id, title) {
    setConversations((p) => p.map((c) => (c.id === id ? { ...c, title } : c)))
    await fetch('/api/conversations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title }),
    }).catch(() => {})
  }

  async function deleteConv(id) {
    setConversations((p) => p.filter((c) => c.id !== id))
    if (activeConv === id) setActiveConv(null)
    await fetch('/api/conversations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {})
  }

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-vs-gray-light">
        <div className="text-center">
          <span className="inline-block w-10 h-10 border-3 border-vs-red border-t-transparent rounded-full animate-spin" />
          <p className="mt-3 text-sm text-vs-gray-mid font-montserrat">Đang tải...</p>
        </div>
      </div>
    )
  }

  if (!session) return null

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header />

      {/* Mobile tab bar */}
      <div className="lg:hidden flex border-b border-gray-200 bg-white">
        {[
          { key: 'docs', label: 'Văn bản', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
          { key: 'search', label: 'Tìm kiếm', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
          { key: 'chat', label: 'Hỏi đáp AI', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActivePanel(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition ${
              activePanel === tab.key ? 'text-vs-red border-b-2 border-vs-red' : 'text-vs-gray-mid'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path d={tab.icon} strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main 3-column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left - lịch sử chat / danh sách văn bản */}
        <div className={`w-64 border-r border-gray-200 flex-shrink-0 flex flex-col overflow-hidden ${
          activePanel === 'docs' ? 'flex' : 'hidden lg:flex'
        }`}>
          <div className="flex border-b border-gray-200 bg-white shrink-0">
            {[
              { key: 'history', label: 'Lịch sử chat' },
              { key: 'docs', label: 'Văn bản pháp quy' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setLeftTab(t.key)}
                className={`flex-1 py-2 text-[11px] font-medium transition ${
                  leftTab === t.key
                    ? 'text-vs-red border-b-2 border-vs-red'
                    : 'text-vs-gray-mid hover:text-vs-gray'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-hidden">
            {leftTab === 'history' ? (
              <ChatHistorySidebar
                conversations={conversations}
                activeId={activeConv}
                loading={convLoading}
                onNew={() => setActiveConv(null)}
                onOpen={(id) => { setActiveConv(id); setActivePanel('chat') }}
                onRename={renameConv}
                onDelete={deleteConv}
              />
            ) : (
              <Sidebar onDocSelect={setSelectedDoc} />
            )}
          </div>
        </div>

        {/* Center - AI Chat (main area) */}
        <div className={`flex-1 min-w-0 overflow-hidden ${
          activePanel === 'chat' ? 'block' : 'hidden lg:block'
        }`}>
          <ChatPanel
            conversationId={activeConv}
            onConversationSaved={upsertConversation}
            onNewConversation={() => setActiveConv(null)}
          />
        </div>

        {/* Right - Search */}
        <div className={`w-[420px] border-l border-gray-200 flex-shrink-0 overflow-hidden ${
          activePanel === 'search' ? 'block' : 'hidden lg:block'
        }`}>
          <SearchPanel />
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white px-4 py-1.5 flex items-center justify-between text-[10px] text-vs-gray-mid font-montserrat">
        <span>© 2025 Công ty Cổ Phần VIETSAFE E&C</span>
        <span className="italic">&quot;YOUR SAFETY – OUR SUCCESS&quot;</span>
        <span>www.vnsec.com.vn</span>
      </footer>
    </div>
  )
}

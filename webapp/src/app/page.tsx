'use client'
import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { SearchResult, DocMeta } from '@/types'
import { SearchBar } from '@/components/SearchBar'
import { ChunkCard } from '@/components/ChunkCard'
import { ChatPanel } from '@/components/ChatPanel'
import { UsageBadge } from '@/components/UsageBadge'
import { DocStatusBadge } from '@/components/DocStatusBadge'
import { UploadModal } from '@/components/UploadModal'
import { Upload, LogOut, BookOpen, FileText, ChevronRight, RefreshCw } from 'lucide-react'

export default function Dashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [docs, setDocs] = useState<DocMeta[]>([])
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedChunk, setSelectedChunk] = useState<SearchResult | undefined>()
  const [showUpload, setShowUpload] = useState(false)
  const [activeTab, setActiveTab] = useState<'search' | 'history'>('search')
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string>('all')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') fetchDocs()
  }, [status])

  const fetchDocs = async () => {
    const res = await fetch('/api/docs')
    const data = await res.json()
    setDocs(data.docs || [])
  }

  const handleSearch = async (query: string) => {
    setSearchLoading(true)
    setActiveTab('search')
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, topK: 8 }),
    })
    const data = await res.json()
    setSearchResults(data.results || [])
    setSearchLoading(false)
    setSelectedDoc(null)
  }

  const role = (session?.user as any)?.role

  const docsByType = docs.reduce((acc, d) => {
    const t = d.loai || 'KHAC'
    if (!acc[t]) acc[t] = []
    acc[t].push(d)
    return acc
  }, {} as Record<string, DocMeta[]>)

  const filteredResults = selectedDoc
    ? searchResults.filter(r => r.chunk.so_hieu === selectedDoc)
    : filterType !== 'all'
      ? searchResults.filter(r => r.chunk.loai === filterType)
      : searchResults

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#C8102E] border-t-transparent rounded-full animate-spin" />
    </div>
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Top header */}
      <header className="bg-[#C8102E] text-white px-4 py-2.5 flex items-center justify-between shrink-0 shadow-md">
        <div className="flex items-center gap-3">
          <BookOpen className="w-5 h-5" />
          <div>
            <div className="font-bold text-sm leading-tight">VIETSAFE E&C</div>
            <div className="text-xs opacity-80 leading-tight">Hệ thống Tiêu chuẩn & Quy chuẩn PCCC</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <UsageBadge />
          {['admin', 'editor'].includes(role) && (
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
              <Upload className="w-3.5 h-3.5" /> Upload
            </button>
          )}
          <div className="text-xs text-right">
            <div className="opacity-80">{session?.user?.name}</div>
            <div className="opacity-60 capitalize">{role}</div>
          </div>
          <button onClick={() => signOut({ callbackUrl: '/login' })}
            className="p-1.5 hover:bg-white/20 rounded-lg transition">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main 3-column layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* SIDEBAR: Danh sách văn bản */}
        <aside className="w-56 bg-white border-r border-gray-200 flex flex-col overflow-hidden shrink-0">
          <div className="px-3 py-2.5 border-b border-gray-100">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Văn bản ({docs.length})</div>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {Object.entries(docsByType).map(([type, typeDocs]) => (
              <div key={type}>
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 bg-gray-50 border-b border-gray-100">
                  {type} ({typeDocs.length})
                </div>
                {typeDocs.map(doc => (
                  <button key={doc.so_hieu}
                    onClick={() => setSelectedDoc(selectedDoc === doc.so_hieu ? null : doc.so_hieu)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-red-50 transition border-b border-gray-50 ${
                      selectedDoc === doc.so_hieu ? 'bg-red-50 border-l-2 border-l-[#C8102E]' : ''
                    }`}>
                    <div className="font-medium text-gray-800 truncate">{doc.so_hieu}</div>
                    <div className="text-gray-400 truncate mt-0.5">{doc.ten}</div>
                    <div className="mt-1">
                      <DocStatusBadge status={doc.trang_thai || 'con_hieu_luc'} />
                    </div>
                  </button>
                ))}
              </div>
            ))}
            {docs.length === 0 && (
              <div className="p-4 text-xs text-gray-400 text-center">Chưa có văn bản nào</div>
            )}
          </div>
          <div className="p-2 border-t border-gray-100">
            <button onClick={fetchDocs} className="w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-gray-600 py-1.5 hover:bg-gray-50 rounded transition">
              <RefreshCw className="w-3 h-3" /> Làm mới
            </button>
          </div>
        </aside>

        {/* CENTER: Tìm kiếm + Kết quả */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="bg-white border-b border-gray-200 px-4 py-3 shrink-0">
            <SearchBar onSearch={handleSearch} loading={searchLoading} />
            {searchResults.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-gray-500">{filteredResults.length} kết quả</span>
                {['all','LUAT','QCVN','TCVN','NGHI_DINH','THONG_TU'].map(t => (
                  <button key={t} onClick={() => setFilterType(t)}
                    className={`text-xs px-2 py-0.5 rounded transition ${
                      filterType === t ? 'bg-[#C8102E] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {t === 'all' ? 'Tất cả' : t}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin space-y-3">
            {searchResults.length === 0 && !searchLoading && (
              <div className="text-center text-gray-400 mt-16">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <div className="text-sm">Nhập từ khóa để tìm kiếm điều khoản</div>
                <div className="text-xs mt-1">VD: "thoát nạn", "sprinkler", "hệ thống báo cháy"</div>
              </div>
            )}
            {filteredResults.map((result, i) => (
              <ChunkCard key={result.chunk.id + i} result={result}
                onAddToChat={r => setSelectedChunk(r)} />
            ))}
          </div>
        </main>

        {/* RIGHT: Chat panel */}
        <div className="w-80 shrink-0">
          <ChatPanel contextChunk={selectedChunk} />
        </div>
      </div>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={() => { fetchDocs(); setShowUpload(false) }}
          existingDocs={docs.map(d => d.so_hieu)}
        />
      )}
    </div>
  )
}

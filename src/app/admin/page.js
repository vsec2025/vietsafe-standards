'use client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Header from '@/components/Header'

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [seedResult, setSeedResult] = useState(null)
  const [tab, setTab] = useState('docs')

  // Edit doc state
  const [editDoc, setEditDoc] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editStatus, setEditStatus] = useState('active')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    if (status === 'authenticated' && session?.user?.role !== 'admin') router.push('/dashboard')
  }, [status, session, router])

  useEffect(() => {
    if (status === 'authenticated') fetchDocs()
  }, [status])

  async function fetchDocs() {
    try {
      const res = await fetch('/api/documents')
      const data = await res.json()
      setDocuments(data.documents || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function handleSeed() {
    setSeedResult('Đang khởi tạo...')
    try {
      const res = await fetch('/api/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: 'vietsafe-dev-secret-key-2025' })
      })
      const data = await res.json()
      setSeedResult(data.message || data.error || 'Done')
      fetchDocs()
    } catch (err) {
      setSeedResult('Lỗi: ' + err.message)
    }
  }

  async function handleUpdateDoc() {
    if (!editDoc) return
    try {
      await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          document: { id: editDoc.id, title: editTitle, status: editStatus }
        })
      })
      setEditDoc(null)
      fetchDocs()
    } catch (err) { console.error(err) }
  }

  if (status !== 'authenticated' || session?.user?.role !== 'admin') return null

  return (
    <div className="min-h-screen bg-vs-gray-light">
      <Header />
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-xl font-bold text-vs-dark font-montserrat mb-6">QUẢN TRỊ HỆ THỐNG</h1>

        {/* Tabs */}
        <div className="flex gap-1 mb-4">
          {[
            { key: 'docs', label: 'Văn bản' },
            { key: 'seed', label: 'Khởi tạo dữ liệu' }
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium rounded-t transition ${
                tab === t.key ? 'bg-white text-vs-red border-t-2 border-vs-red' : 'bg-gray-200 text-vs-gray-mid'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          {tab === 'docs' && (
            <>
              <h2 className="text-base font-semibold text-vs-dark mb-4">Quản lý văn bản</h2>
              {loading ? (
                <p className="text-sm text-vs-gray-mid">Đang tải...</p>
              ) : (
                <div className="space-y-2">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-vs-dark truncate">{doc.title}</p>
                        <p className="text-xs text-vs-gray-mid">{doc.status} • {doc.filename}</p>
                      </div>
                      <button
                        onClick={() => { setEditDoc(doc); setEditTitle(doc.title); setEditStatus(doc.status) }}
                        className="text-xs px-3 py-1 text-vs-red border border-vs-red rounded hover:bg-red-50"
                      >
                        Sửa
                      </button>
                    </div>
                  ))}
                  {documents.length === 0 && (
                    <p className="text-sm text-vs-gray-mid">Chưa có văn bản. Hãy khởi tạo dữ liệu trước.</p>
                  )}
                </div>
              )}

              {/* Edit modal */}
              {editDoc && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
                    <h3 className="text-base font-semibold text-vs-dark mb-4">Chỉnh sửa văn bản</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-vs-gray mb-1">Tiêu đề</label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          className="vs-input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-vs-gray mb-1">Trạng thái</label>
                        <select
                          value={editStatus}
                          onChange={e => setEditStatus(e.target.value)}
                          className="vs-input"
                        >
                          <option value="active">Còn hiệu lực</option>
                          <option value="expired">Hết hiệu lực</option>
                          <option value="amended">Đã sửa đổi</option>
                          <option value="pending">Chờ hiệu lực</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button onClick={handleUpdateDoc} className="vs-btn-primary">Lưu</button>
                      <button onClick={() => setEditDoc(null)} className="px-4 py-2 bg-gray-100 rounded text-sm">Hủy</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'seed' && (
            <>
              <h2 className="text-base font-semibold text-vs-dark mb-4">Khởi tạo dữ liệu ban đầu</h2>
              <p className="text-sm text-vs-gray mb-4">
                Tạo tài khoản admin, editor, viewer và danh sách 3 văn bản PCCC ban đầu trong Redis.
              </p>
              <button onClick={handleSeed} className="vs-btn-primary">
                Khởi tạo dữ liệu
              </button>
              {seedResult && (
                <p className="mt-3 text-sm text-vs-gray p-3 bg-gray-50 rounded">{seedResult}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import Header from '@/components/Header'

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('upload')
  const [seedResult, setSeedResult] = useState(null)

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const fileRef = useRef(null)

  // Edit doc state
  const [editDoc, setEditDoc] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editStatus, setEditStatus] = useState('active')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    if (status === 'authenticated' && !['admin', 'editor'].includes(session?.user?.role)) router.push('/dashboard')
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

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) return setUploadResult({ ok: false, msg: 'Chọn file .md trước' })
    if (!file.name.endsWith('.md')) return setUploadResult({ ok: false, msg: 'Chỉ chấp nhận file .md' })

    setUploading(true)
    setUploadResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) {
        setUploadResult({ ok: true, msg: data.message })
        fileRef.current.value = ''
      } else {
        setUploadResult({ ok: false, msg: data.error })
      }
    } catch (err) {
      setUploadResult({ ok: false, msg: 'Lỗi: ' + err.message })
    } finally {
      setUploading(false)
    }
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
    } catch (err) { setSeedResult('Lỗi: ' + err.message) }
  }

  async function handleUpdateDoc() {
    if (!editDoc) return
    try {
      await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', document: { id: editDoc.id, title: editTitle, status: editStatus } })
      })
      setEditDoc(null)
      fetchDocs()
    } catch (err) { console.error(err) }
  }

  if (status !== 'authenticated' || !['admin', 'editor'].includes(session?.user?.role)) return null

  const isAdmin = session.user.role === 'admin'

  return (
    <div className="min-h-screen bg-vs-gray-light">
      <Header />
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-xl font-bold text-vs-dark font-montserrat mb-6">
          {isAdmin ? 'QUẢN TRỊ HỆ THỐNG' : 'QUẢN LÝ VĂN BẢN'}
        </h1>

        {/* Tabs */}
        <div className="flex gap-1 mb-4">
          {[
            { key: 'upload', label: 'Upload văn bản' },
            { key: 'docs', label: 'Danh sách văn bản' },
            ...(isAdmin ? [{ key: 'seed', label: 'Khởi tạo dữ liệu' }] : [])
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
          {/* Upload Tab */}
          {tab === 'upload' && (
            <>
              <h2 className="text-base font-semibold text-vs-dark mb-2">Upload văn bản .md</h2>
              <p className="text-sm text-vs-gray-mid mb-4">
                Upload file Markdown (.md) chứa nội dung văn bản PCCC. Hệ thống sẽ tự động xử lý (làm sạch → chia chunk → cập nhật search index) trong 1-2 phút.
              </p>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-vs-red transition">
                <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                </svg>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".md"
                  className="block w-full max-w-xs mx-auto text-sm text-vs-gray file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-vs-red file:text-white hover:file:bg-vs-red-dark file:cursor-pointer"
                />
                <p className="text-xs text-vs-gray-mid mt-2">Chỉ chấp nhận file .md (Markdown)</p>
              </div>

              <button
                onClick={handleUpload}
                disabled={uploading}
                className="vs-btn-primary mt-4 disabled:opacity-50"
              >
                {uploading ? 'Đang upload...' : 'Upload & Xử lý'}
              </button>

              {uploadResult && (
                <div className={`mt-4 p-3 rounded text-sm ${
                  uploadResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {uploadResult.ok ? '✅ ' : '❌ '}{uploadResult.msg}
                </div>
              )}

              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-semibold text-vs-dark mb-2">Quy trình tự động:</h3>
                <div className="flex items-center gap-2 text-xs text-vs-gray-mid flex-wrap">
                  <span className="px-2 py-1 bg-white rounded border">1. Upload .md</span>
                  <span>→</span>
                  <span className="px-2 py-1 bg-white rounded border">2. Commit GitHub</span>
                  <span>→</span>
                  <span className="px-2 py-1 bg-white rounded border">3. Pipeline tự chạy</span>
                  <span>→</span>
                  <span className="px-2 py-1 bg-white rounded border">4. Vercel auto-deploy</span>
                </div>
              </div>
            </>
          )}

          {/* Documents Tab */}
          {tab === 'docs' && (
            <>
              <h2 className="text-base font-semibold text-vs-dark mb-4">Danh sách văn bản</h2>
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
                    <p className="text-sm text-vs-gray-mid">Chưa có văn bản.</p>
                  )}
                </div>
              )}

              {editDoc && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
                    <h3 className="text-base font-semibold text-vs-dark mb-4">Chỉnh sửa văn bản</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-vs-gray mb-1">Tiêu đề</label>
                        <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} className="vs-input" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-vs-gray mb-1">Trạng thái</label>
                        <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className="vs-input">
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

          {/* Seed Tab (admin only) */}
          {tab === 'seed' && isAdmin && (
            <>
              <h2 className="text-base font-semibold text-vs-dark mb-4">Khởi tạo dữ liệu ban đầu</h2>
              <p className="text-sm text-vs-gray mb-4">Tạo tài khoản và danh sách văn bản mặc định trong Redis.</p>
              <button onClick={handleSeed} className="vs-btn-primary">Khởi tạo dữ liệu</button>
              {seedResult && <p className="mt-3 text-sm text-vs-gray p-3 bg-gray-50 rounded">{seedResult}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

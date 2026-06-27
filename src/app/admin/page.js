'use client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef, useCallback } from 'react'
import Header from '@/components/Header'
import ConflictsTab from '@/components/ConflictsTab'

const ROLE_LABELS = { viewer: 'Xem', engineer: 'Kỹ sư', admin: 'Admin' }
const ROLE_COLORS = { viewer: 'bg-gray-100 text-gray-600', engineer: 'bg-blue-50 text-blue-700', admin: 'bg-red-50 text-vs-red' }

function UsersTab() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [quotaEdit, setQuotaEdit] = useState({})

  useEffect(() => {
    fetch('/api/admin/users').then(r => r.json()).then(d => {
      setUsers(d.users || [])
      setLoading(false)
    })
  }, [])

  async function patch(email, payload) {
    setSaving(prev => ({ ...prev, [email]: true }))
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, ...payload }),
    })
    setSaving(prev => ({ ...prev, [email]: false }))
    const res = await fetch('/api/admin/users')
    const d = await res.json()
    setUsers(d.users || [])
  }

  if (loading) return <p className="text-sm text-vs-gray-mid py-4">Đang tải...</p>
  if (users.length === 0) return <p className="text-sm text-vs-gray-mid py-4">Chưa có người dùng nào đăng nhập.</p>

  return (
    <div>
      <h2 className="text-base font-semibold text-vs-dark mb-4">Quản lý người dùng</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-gray-200 text-vs-gray-mid text-left">
              <th className="pb-2 pr-4 font-medium">Email</th>
              <th className="pb-2 pr-4 font-medium">Tên</th>
              <th className="pb-2 pr-4 font-medium">Role</th>
              <th className="pb-2 pr-4 font-medium">Token dùng / hạn mức</th>
              <th className="pb-2 font-medium">Quota</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(u => (
              <tr key={u.email} className="hover:bg-gray-50">
                <td className="py-2.5 pr-4 text-vs-dark font-medium">{u.email}</td>
                <td className="py-2.5 pr-4 text-vs-gray">{u.full_name || '—'}</td>
                <td className="py-2.5 pr-4">
                  <select
                    value={u.role}
                    disabled={saving[u.email]}
                    onChange={e => patch(u.email, { role: e.target.value })}
                    className={`text-xs rounded px-2 py-1 border-0 font-medium cursor-pointer ${ROLE_COLORS[u.role] || 'bg-gray-100'}`}
                  >
                    {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-vs-red rounded-full"
                        style={{ width: `${Math.min(100, (u.token_used / u.token_quota) * 100)}%` }} />
                    </div>
                    <span className="text-vs-gray-mid">
                      {(u.token_used || 0).toLocaleString()} / {(u.token_quota || 50000).toLocaleString()}
                    </span>
                  </div>
                </td>
                <td className="py-2.5">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={quotaEdit[u.email] ?? u.token_quota ?? 50000}
                      onChange={e => setQuotaEdit(prev => ({ ...prev, [u.email]: e.target.value }))}
                      className="w-20 text-xs border border-gray-200 rounded px-1.5 py-0.5"
                      min="0" step="10000"
                    />
                    <button
                      onClick={() => patch(u.email, { token_quota: quotaEdit[u.email] ?? u.token_quota })}
                      disabled={saving[u.email]}
                      className="text-xs px-2 py-0.5 bg-vs-red text-white rounded hover:opacity-90 disabled:opacity-50"
                    >
                      {saving[u.email] ? '...' : 'Lưu'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const STEPS = [
  { id: 'upload', label: 'Upload file' },
  { id: 'commit', label: 'Commit lên GitHub' },
  { id: 'pipeline', label: 'Pipeline xử lý chunks' },
  { id: 'deploy', label: 'Vercel deploy' },
]

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('upload')
  const [seedResult, setSeedResult] = useState(null)

  // Upload + progress
  const [uploading, setUploading] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1) // -1 = not started
  const [stepStatus, setStepStatus] = useState({}) // {stepId: 'done'|'running'|'error'|'waiting'}
  const [pipelineMsg, setPipelineMsg] = useState('')
  const [completed, setCompleted] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const fileRef = useRef(null)
  const pollRef = useRef(null)

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
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [status])

  async function fetchDocs() {
    try {
      const res = await fetch('/api/documents')
      const data = await res.json()
      setDocuments(data.documents || [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  function resetProgress() {
    setCurrentStep(-1)
    setStepStatus({})
    setPipelineMsg('')
    setCompleted(false)
    setErrorMsg('')
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  function updateStep(stepId, s, msg) {
    setStepStatus(prev => ({ ...prev, [stepId]: s }))
    if (msg) setPipelineMsg(msg)
    setCurrentStep(STEPS.findIndex(st => st.id === stepId))
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) return setErrorMsg('Chọn file .md trước')
    if (!file.name.endsWith('.md')) return setErrorMsg('Chỉ chấp nhận file .md')

    resetProgress()
    setUploading(true)
    
    // Step 1: Upload
    updateStep('upload', 'running', `Đang upload "${file.name}"...`)

    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()

      if (!data.success) {
        updateStep('upload', 'error', data.error)
        setErrorMsg(data.error)
        setUploading(false)
        return
      }

      // Step 1 done, Step 2 done (commit happened in upload API)
      updateStep('upload', 'done')
      updateStep('commit', 'done', `"${file.name}" đã commit lên GitHub`)
      fileRef.current.value = ''

      // Step 3: Start polling pipeline
      updateStep('pipeline', 'running', 'Đang chờ pipeline bắt đầu...')
      startPipelinePolling()

    } catch (err) {
      updateStep('upload', 'error', 'Lỗi: ' + err.message)
      setErrorMsg(err.message)
      setUploading(false)
    }
  }

  function startPipelinePolling() {
    let attempts = 0
    const maxAttempts = 40 // ~5 min max

    pollRef.current = setInterval(async () => {
      attempts++
      if (attempts > maxAttempts) {
        clearInterval(pollRef.current)
        updateStep('pipeline', 'error', 'Timeout — kiểm tra GitHub Actions')
        setUploading(false)
        return
      }

      try {
        const res = await fetch('/api/pipeline-status')
        const data = await res.json()
        const runs = data.runs || []
        
        if (runs.length === 0) {
          setPipelineMsg('Đang chờ pipeline khởi động...')
          return
        }

        const latest = runs[0]
        
        if (latest.status === 'in_progress' || latest.status === 'queued') {
          updateStep('pipeline', 'running', 'Pipeline đang xử lý chunks...')
        } else if (latest.status === 'completed') {
          clearInterval(pollRef.current)
          pollRef.current = null

          if (latest.conclusion === 'success') {
            updateStep('pipeline', 'done', `Pipeline hoàn thành: ${latest.commit}`)
            updateStep('deploy', 'running', 'Vercel đang deploy...')
            
            // Wait ~20s for Vercel to deploy
            setTimeout(() => {
              updateStep('deploy', 'done', 'Deploy hoàn thành!')
              setCompleted(true)
              setUploading(false)
              // Play notification sound
              try { new Audio('data:audio/wav;base64,UklGRl9vT19teleType...').play().catch(()=>{}) } catch(e){}
            }, 20000)
          } else {
            updateStep('pipeline', 'error', `Pipeline thất bại: ${latest.conclusion}`)
            setErrorMsg(`Pipeline thất bại. Xem chi tiết tại GitHub Actions.`)
            setUploading(false)
          }
        }
      } catch (err) {
        setPipelineMsg('Đang kiểm tra...')
      }
    }, 8000)
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

  const progressPercent = currentStep < 0 ? 0 : Math.min(100, ((Object.values(stepStatus).filter(s => s === 'done').length) / STEPS.length) * 100)

  return (
    <div className="min-h-screen bg-vs-gray-light">
      <Header />

      {/* Completion notification */}
      {completed && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-green-500 text-white py-4 px-6 shadow-lg animate-pulse">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎉</span>
              <div>
                <p className="font-bold text-base">XỬ LÝ HOÀN THÀNH!</p>
                <p className="text-sm opacity-90">Văn bản đã được xử lý và deploy thành công. Dữ liệu tìm kiếm đã cập nhật.</p>
              </div>
            </div>
            <button onClick={() => setCompleted(false)} className="text-white/80 hover:text-white text-2xl">✕</button>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-xl font-bold text-vs-dark font-montserrat mb-6">
          {isAdmin ? 'QUẢN TRỊ HỆ THỐNG' : 'QUẢN LÝ VĂN BẢN'}
        </h1>

        {/* Tabs */}
        <div className="flex gap-1 mb-4">
          {[
            { key: 'upload', label: 'Upload văn bản' },
            { key: 'conflicts', label: '⚠️ Rà soát xung đột' },
            { key: 'docs', label: 'Danh sách văn bản' },
            ...(isAdmin ? [
              { key: 'users', label: '👥 Người dùng' },
              { key: 'seed', label: 'Khởi tạo dữ liệu' },
            ] : [])
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
          {tab === 'upload' && (
            <>
              <h2 className="text-base font-semibold text-vs-dark mb-4">Upload văn bản .md</h2>

              {/* File picker */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-vs-red transition mb-4">
                <svg className="w-10 h-10 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                </svg>
                <input ref={fileRef} type="file" accept=".md" onChange={() => { resetProgress(); setErrorMsg('') }}
                  className="block w-full max-w-xs mx-auto text-sm text-vs-gray file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-vs-red file:text-white hover:file:bg-vs-red-dark file:cursor-pointer" />
              </div>

              <button onClick={handleUpload} disabled={uploading}
                className="vs-btn-primary disabled:opacity-50 mb-4">
                {uploading ? 'Đang xử lý...' : 'Upload & Xử lý'}
              </button>

              {errorMsg && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">❌ {errorMsg}</div>
              )}

              {/* Progress Steps */}
              {currentStep >= 0 && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
                  {/* Progress bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-[10px] text-vs-gray-mid mb-1">
                      <span>Tiến trình</span>
                      <span>{Math.round(progressPercent)}%</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{ 
                          width: `${progressPercent}%`,
                          background: completed ? '#22c55e' : errorMsg ? '#ef4444' : '#C8102E'
                        }} />
                    </div>
                  </div>

                  {/* Steps */}
                  <div className="space-y-2">
                    {STEPS.map((step, i) => {
                      const s = stepStatus[step.id]
                      return (
                        <div key={step.id} className="flex items-center gap-3">
                          {/* Icon */}
                          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm"
                            style={{
                              background: s === 'done' ? '#22c55e' : s === 'running' ? '#C8102E' : s === 'error' ? '#ef4444' : '#e5e7eb',
                              color: s && s !== 'waiting' ? 'white' : '#9ca3af'
                            }}>
                            {s === 'done' ? '✓' : s === 'running' ? (
                              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : s === 'error' ? '✕' : i + 1}
                          </div>
                          {/* Label */}
                          <span className={`text-sm ${
                            s === 'done' ? 'text-green-700 font-medium' : 
                            s === 'running' ? 'text-vs-red font-medium' :
                            s === 'error' ? 'text-red-600' : 'text-vs-gray-mid'
                          }`}>
                            {step.label}
                            {s === 'running' && <span className="text-xs ml-2 text-vs-gray-mid animate-pulse">đang xử lý...</span>}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Status message */}
                  {pipelineMsg && (
                    <p className="mt-3 text-xs text-vs-gray-mid border-t pt-2">{pipelineMsg}</p>
                  )}
                </div>
              )}

              {/* Completed message */}
              {completed && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">🎉</span>
                    <span className="text-green-700 font-semibold">Xử lý hoàn thành!</span>
                  </div>
                  <p className="text-sm text-green-600">Văn bản đã được chia chunks, cập nhật search index, và deploy lên webapp.</p>
                  <button onClick={() => router.push('/dashboard')} className="mt-2 text-sm text-vs-red font-medium hover:underline">
                    → Quay lại Dashboard tra cứu
                  </button>
                </div>
              )}
            </>
          )}

          {tab === 'conflicts' && <ConflictsTab />}

          {tab === 'docs' && (
            <>
              <h2 className="text-base font-semibold text-vs-dark mb-4">Danh sách văn bản</h2>
              {loading ? <p className="text-sm text-vs-gray-mid">Đang tải...</p> : (
                <div className="space-y-2">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-vs-dark truncate">{doc.title}</p>
                        <p className="text-xs text-vs-gray-mid">{doc.status} • {doc.filename}</p>
                      </div>
                      <button onClick={() => { setEditDoc(doc); setEditTitle(doc.title); setEditStatus(doc.status) }}
                        className="text-xs px-3 py-1 text-vs-red border border-vs-red rounded hover:bg-red-50">Sửa</button>
                      <button onClick={async () => {
                        if (!confirm(`Xóa "${doc.title}"? Sẽ xóa cả file trên GitHub và chunks.`)) return
                        const res = await fetch('/api/documents/delete', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ docId: doc.id, filename: doc.filename })
                        })
                        const data = await res.json()
                        if (data.success) { alert(data.message); fetchDocs() }
                        else alert('Lỗi: ' + data.error)
                      }} className="text-xs px-3 py-1 text-red-600 border border-red-300 rounded hover:bg-red-50">Xóa</button>
                    </div>
                  ))}
                  {documents.length === 0 && <p className="text-sm text-vs-gray-mid">Chưa có văn bản.</p>}
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

          {tab === 'users' && isAdmin && <UsersTab />}

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

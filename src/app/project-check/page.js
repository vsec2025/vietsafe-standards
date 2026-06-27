'use client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import Header from '@/components/Header'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const STATUS_CONFIG = {
  COMPLIANT:     { label: 'Tuân thủ',       color: 'bg-green-50 text-green-700 border-green-200',  dot: 'bg-green-500' },
  NON_COMPLIANT: { label: 'Vi phạm',         color: 'bg-red-50 text-red-700 border-red-200',        dot: 'bg-red-500' },
  NEEDS_REVIEW:  { label: 'Cần xem xét',    color: 'bg-yellow-50 text-yellow-700 border-yellow-200', dot: 'bg-yellow-400' },
  NO_COVERAGE:   { label: 'Không có dữ liệu', color: 'bg-gray-50 text-gray-500 border-gray-200',   dot: 'bg-gray-300' },
}

const SEVERITY_COLOR = { HIGH: 'text-red-600 bg-red-50', MEDIUM: 'text-yellow-700 bg-yellow-50', LOW: 'text-blue-600 bg-blue-50' }

export default function ProjectCheckPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [text, setText] = useState('')
  const [filename, setFilename] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [expandedIdx, setExpandedIdx] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFilename(file.name)
    const content = await file.text()
    setText(content)
    setResult(null)
    setError('')
  }

  async function handleCheck() {
    if (!text.trim()) return setError('Nhập hoặc upload nội dung tài liệu trước')
    setLoading(true)
    setError('')
    setResult(null)
    setExpandedIdx(null)

    try {
      const res = await fetch('/api/batch-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, filename: filename || 'Tài liệu dự án' }),
      })
      const data = await res.json()
      if (data.error) setError(data.error)
      else setResult(data)
    } catch {
      setError('Lỗi kết nối')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'loading' || !session) return null

  const summary = result?.summary
  const scorePercent = summary
    ? Math.round((summary.compliant / summary.total) * 100)
    : 0

  return (
    <div className="min-h-screen bg-vs-gray-light flex flex-col">
      <Header />
      <div className="max-w-5xl mx-auto w-full px-4 py-6 flex-1">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-vs-red rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-vs-dark font-montserrat">Kiểm tra tài liệu dự án</h1>
            <p className="text-xs text-vs-gray-mid">Đối chiếu tự động với tiêu chuẩn PCCC hiện hành</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Input */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-vs-dark">Tài liệu dự án</h2>
              <label className="cursor-pointer text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-vs-gray transition">
                <input ref={fileRef} type="file" accept=".md,.txt" className="hidden" onChange={handleFile} />
                📁 Upload .md / .txt
              </label>
            </div>
            {filename && (
              <p className="text-[11px] text-vs-gray-mid mb-2">📄 {filename}</p>
            )}
            <textarea
              value={text}
              onChange={e => { setText(e.target.value); setResult(null) }}
              placeholder="Paste nội dung thuyết minh thiết kế PCCC, hoặc upload file .md / .txt..."
              className="w-full h-56 text-xs border border-gray-200 rounded p-3 resize-none focus:outline-none focus:border-vs-red font-mono"
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-[10px] text-vs-gray-mid">{text.length.toLocaleString()} ký tự</span>
              <button
                onClick={handleCheck}
                disabled={loading || !text.trim()}
                className="vs-btn-primary disabled:opacity-50 text-sm px-5"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                    Đang phân tích...
                  </span>
                ) : '▶ Kiểm tra'}
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-red-600">❌ {error}</p>}
          </div>

          {/* Summary */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-vs-dark mb-3">Kết quả tổng quan</h2>
            {!result && !loading && (
              <div className="flex flex-col items-center justify-center h-48 text-center text-vs-gray-mid">
                <svg className="w-12 h-12 mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                </svg>
                <p className="text-xs">Upload tài liệu và nhấn Kiểm tra</p>
              </div>
            )}
            {loading && (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <div className="flex gap-1">
                  {[0,150,300].map(d => (
                    <span key={d} className="w-3 h-3 bg-vs-red rounded-full animate-bounce" style={{animationDelay:`${d}ms`}}/>
                  ))}
                </div>
                <p className="text-xs text-vs-gray-mid">Đang phân tích từng đoạn...</p>
              </div>
            )}
            {result && summary && (
              <div className="space-y-4">
                {/* Score ring */}
                <div className="flex items-center gap-4">
                  <div className="relative w-20 h-20 flex-shrink-0">
                    <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3"/>
                      <circle cx="18" cy="18" r="15.9" fill="none"
                        stroke={scorePercent >= 70 ? '#22c55e' : scorePercent >= 40 ? '#f59e0b' : '#ef4444'}
                        strokeWidth="3"
                        strokeDasharray={`${scorePercent} ${100 - scorePercent}`}
                        strokeLinecap="round"/>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-lg font-bold text-vs-dark">{scorePercent}%</span>
                      <span className="text-[9px] text-vs-gray-mid">tuân thủ</span>
                    </div>
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    {[
                      { key: 'compliant',     label: 'Tuân thủ',       color: 'text-green-600' },
                      { key: 'non_compliant', label: 'Vi phạm',         color: 'text-red-600' },
                      { key: 'needs_review',  label: 'Cần xem xét',    color: 'text-yellow-600' },
                      { key: 'no_coverage',   label: 'Không có dữ liệu', color: 'text-gray-400' },
                    ].map(({ key, label, color }) => (
                      <div key={key} className="text-center p-2 bg-gray-50 rounded">
                        <p className={`text-lg font-bold ${color}`}>{summary[key]}</p>
                        <p className="text-[9px] text-vs-gray-mid">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {summary.high_issues > 0 && (
                  <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                    <span className="font-bold text-base">⚠</span>
                    <span>{summary.high_issues} vấn đề nghiêm trọng (HIGH) cần xử lý ngay</span>
                  </div>
                )}
                <p className="text-[10px] text-vs-gray-mid">Đã phân tích {summary.total} đoạn văn bản</p>
              </div>
            )}
          </div>
        </div>

        {/* Detail results */}
        {result?.results?.length > 0 && (
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-vs-dark mb-4">Chi tiết từng đoạn</h2>
            <div className="space-y-2">
              {result.results.map((r, idx) => {
                const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.NEEDS_REVIEW
                const expanded = expandedIdx === idx
                return (
                  <div key={idx} className={`border rounded-lg overflow-hidden ${expanded ? 'border-vs-red' : 'border-gray-100'}`}>
                    <button
                      className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition"
                      onClick={() => setExpandedIdx(expanded ? null : idx)}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`}/>
                      <span className={`text-[10px] font-medium px-2 py-0.5 border rounded-full flex-shrink-0 ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      <span className="text-xs text-vs-gray flex-1 truncate">{r.section}</span>
                      {r.issues?.filter(i => i.severity === 'HIGH').length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-medium flex-shrink-0">
                          ⚠ {r.issues.filter(i => i.severity === 'HIGH').length} HIGH
                        </span>
                      )}
                      <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/>
                      </svg>
                    </button>
                    {expanded && (
                      <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                        <p className="text-xs text-vs-gray">{r.summary}</p>
                        {r.issues?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-vs-dark mb-1.5">Vấn đề phát hiện:</p>
                            <div className="space-y-1.5">
                              {r.issues.map((issue, j) => (
                                <div key={j} className="flex gap-2 text-xs">
                                  <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 h-fit ${SEVERITY_COLOR[issue.severity] || ''}`}>
                                    {issue.severity}
                                  </span>
                                  <div>
                                    <p className="text-vs-gray">{issue.description}</p>
                                    {issue.regulation && (
                                      <p className="text-[10px] text-vs-gray-mid mt-0.5">📄 {issue.regulation}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {r.recommendations?.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-vs-dark mb-1">Khuyến nghị:</p>
                            <ul className="text-xs text-vs-gray space-y-1">
                              {r.recommendations.map((rec, j) => (
                                <li key={j} className="flex gap-1.5"><span className="text-vs-red flex-shrink-0">→</span>{rec}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

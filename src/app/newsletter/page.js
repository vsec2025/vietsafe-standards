'use client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const mdComponents = {
  h1: ({children}) => <h1 className="text-xl font-bold text-vs-dark mt-6 mb-3 font-montserrat">{children}</h1>,
  h2: ({children}) => <h2 className="text-base font-bold text-vs-dark mt-5 mb-2 border-b border-gray-200 pb-1">{children}</h2>,
  h3: ({children}) => <h3 className="text-sm font-semibold text-vs-gray mt-4 mb-1.5">{children}</h3>,
  p: ({children}) => <p className="text-sm leading-relaxed mb-3 text-vs-gray">{children}</p>,
  ul: ({children}) => <ul className="list-disc list-inside text-sm space-y-1 ml-3 mb-3 text-vs-gray">{children}</ul>,
  ol: ({children}) => <ol className="list-decimal list-inside text-sm space-y-1 ml-3 mb-3 text-vs-gray">{children}</ol>,
  li: ({children}) => <li className="text-sm leading-relaxed">{children}</li>,
  strong: ({children}) => <strong className="font-semibold text-vs-dark">{children}</strong>,
  table: ({children}) => (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-sm border-collapse border border-gray-200">{children}</table>
    </div>
  ),
  thead: ({children}) => <thead className="bg-vs-red text-white">{children}</thead>,
  th: ({children}) => <th className="border border-gray-200 px-3 py-2 text-left font-medium text-sm">{children}</th>,
  td: ({children}) => <td className="border border-gray-200 px-3 py-2 text-sm">{children}</td>,
  tr: ({children}) => <tr className="even:bg-gray-50">{children}</tr>,
  blockquote: ({children}) => (
    <blockquote className="border-l-4 border-vs-red pl-4 italic text-vs-gray-mid my-3 text-sm">{children}</blockquote>
  ),
}

export default function NewsletterPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    if (status === 'authenticated' && !['admin', 'editor'].includes(session?.user?.role)) router.push('/dashboard')
  }, [status, session, router])

  async function generate() {
    setLoading(true)
    setError('')
    setData(null)
    try {
      const res = await fetch(`/api/newsletter?days=${days}`)
      const d = await res.json()
      if (d.error) setError(d.error)
      else setData(d)
    } catch {
      setError('Lỗi kết nối')
    } finally {
      setLoading(false)
    }
  }

  async function copyMarkdown() {
    if (!data?.newsletter) return
    await navigator.clipboard.writeText(data.newsletter)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (status === 'loading' || !session) return null
  if (!['admin', 'editor'].includes(session?.user?.role)) return null

  const stats = data?.stats

  return (
    <div className="min-h-screen bg-vs-gray-light flex flex-col">
      <Header />
      <div className="max-w-4xl mx-auto w-full px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-vs-red rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 12h6m-6-4h2"/>
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-vs-dark font-montserrat">Bản tin tuần — VSEC-AI</h1>
            <p className="text-xs text-vs-gray-mid">Tóm tắt tự động các câu hỏi và xu hướng tra cứu tiêu chuẩn</p>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-vs-gray font-medium">Khoảng thời gian:</label>
            <select
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              className="text-sm border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-vs-red"
            >
              <option value={7}>7 ngày qua</option>
              <option value={14}>14 ngày qua</option>
              <option value={30}>30 ngày qua</option>
            </select>
          </div>
          <button
            onClick={generate}
            disabled={loading}
            className="vs-btn-primary disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                Đang tạo bản tin...
              </span>
            ) : '✨ Tạo bản tin'}
          </button>
          {data?.newsletter && (
            <button
              onClick={copyMarkdown}
              className="text-sm px-4 py-2 border border-gray-200 rounded hover:bg-gray-50 transition text-vs-gray"
            >
              {copied ? '✓ Đã copy' : '📋 Copy Markdown'}
            </button>
          )}
          {data?.generated_at && (
            <span className="text-[10px] text-vs-gray-mid ml-auto">
              Tạo lúc: {new Date(data.generated_at).toLocaleString('vi-VN')}
            </span>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">❌ {error}</div>
        )}

        {data?.message && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-700">
            ⚠ {data.message}
          </div>
        )}

        {/* Stats bar */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Tổng câu hỏi', value: stats.total, color: 'text-vs-dark' },
              { label: 'Có cơ sở pháp lý', value: `${stats.has_basis_pct}%`, color: 'text-green-600' },
              { label: '👍 Hữu ích', value: stats.thumbs_up, color: 'text-green-500' },
              { label: '👎 Cần cải thiện', value: stats.thumbs_down, color: 'text-red-500' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white rounded-lg shadow px-4 py-3 text-center">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-[10px] text-vs-gray-mid mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Newsletter content */}
        {data?.newsletter && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="border-b border-gray-100 pb-3 mb-4 flex items-center gap-2">
              <span className="text-xs font-medium text-vs-red uppercase tracking-wide">Bản tin VSEC-AI</span>
              <span className="text-xs text-vs-gray-mid">• {days} ngày qua</span>
            </div>
            <div className="prose max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {data.newsletter}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

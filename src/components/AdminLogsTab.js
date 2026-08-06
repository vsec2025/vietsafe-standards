'use client'
import { useCallback, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const fmt = (iso) => {
  const d = new Date(iso)
  return isNaN(d) ? '—' : d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function Stat({ label, value, hint }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
      <p className="text-[10px] text-vs-gray-mid">{label}</p>
      <p className="text-base font-bold text-vs-dark leading-tight">{value}</p>
      {hint && <p className="text-[10px] text-vs-gray-mid">{hint}</p>}
    </div>
  )
}

/** Lịch sử hỏi–đáp toàn hệ thống + luồng hội thoại của từng người (admin). */
export default function AdminLogsTab() {
  const [view, setView] = useState('logs') // logs | conversations
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)

  const [days, setDays] = useState(30)
  const [user, setUser] = useState('')
  const [only, setOnly] = useState('')
  const [q, setQ] = useState('')

  // Hội thoại
  const [convUser, setConvUser] = useState('')
  const [convs, setConvs] = useState([])
  const [convMsgs, setConvMsgs] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams({ days: String(days) })
    if (user) p.set('user', user)
    if (only) p.set('only', only)
    if (q.trim()) p.set('q', q.trim())
    try {
      const d = await (await fetch(`/api/admin/logs?${p}`)).json()
      setData(d.error ? { error: d.error } : d)
    } catch { setData({ error: 'Lỗi tải dữ liệu' }) }
    finally { setLoading(false) }
  }, [days, user, only, q])

  useEffect(() => { if (view === 'logs') load() }, [view, load])

  async function openUserConvs(email) {
    setConvUser(email)
    setConvMsgs(null)
    const d = await (await fetch(`/api/conversations?user=${encodeURIComponent(email)}`)).json()
    setConvs(d.conversations || [])
  }

  async function openConv(id) {
    const d = await (await fetch(`/api/conversations?user=${encodeURIComponent(convUser)}&id=${encodeURIComponent(id)}`)).json()
    setConvMsgs(d.messages || [])
  }

  const stats = data?.stats
  const users = stats?.users || []

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-vs-dark">Lịch sử hỏi đáp</h2>
        <div className="flex gap-1">
          {[['logs', 'Theo lượt hỏi'], ['conversations', 'Theo hội thoại']].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)}
              className={`text-xs px-3 py-1.5 rounded transition ${
                view === k ? 'bg-vs-red text-white' : 'bg-gray-100 text-vs-gray-mid hover:bg-gray-200'
              }`}>{l}</button>
          ))}
        </div>
      </div>

      {view === 'logs' && (
        <>
          {/* Bộ lọc */}
          <div className="flex flex-wrap gap-2 mb-3">
            <select value={days} onChange={(e) => setDays(+e.target.value)} className="text-xs border border-gray-200 rounded px-2 py-1.5">
              {[7, 30, 90, 365].map((d) => <option key={d} value={d}>{d} ngày qua</option>)}
            </select>
            <select value={user} onChange={(e) => setUser(e.target.value)} className="text-xs border border-gray-200 rounded px-2 py-1.5 max-w-[200px]">
              <option value="">Tất cả người dùng</option>
              {users.map((u) => <option key={u.email} value={u.email}>{u.email} ({u.count})</option>)}
            </select>
            <select value={only} onChange={(e) => setOnly(e.target.value)} className="text-xs border border-gray-200 rounded px-2 py-1.5">
              <option value="">Tất cả kết quả</option>
              <option value="nobasis">Không có căn cứ</option>
              <option value="thumbsdown">Bị đánh giá 👎</option>
            </select>
            <input value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="Tìm trong câu hỏi..." className="text-xs border border-gray-200 rounded px-2 py-1.5 flex-1 min-w-[160px]" />
            <button onClick={load} className="text-xs px-3 py-1.5 bg-vs-red text-white rounded hover:opacity-90">Lọc</button>
          </div>

          {loading && <p className="text-sm text-vs-gray-mid py-4">Đang tải...</p>}
          {data?.error && <p className="text-sm text-red-600 py-4">❌ {data.error}</p>}

          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <Stat label="Lượt hỏi" value={stats.total.toLocaleString()} />
              <Stat label="Có căn cứ pháp lý" value={`${stats.has_basis_pct}%`} />
              <Stat label="Bị 👎" value={stats.thumbs_down} hint="cần cải thiện corpus" />
              <Stat label="Token đã dùng" value={stats.tokens.toLocaleString()} />
            </div>
          )}

          {data?.logs?.length === 0 && !loading && (
            <p className="text-sm text-vs-gray-mid py-4">Không có lượt hỏi nào khớp bộ lọc.</p>
          )}

          {data?.logs?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-vs-gray-mid text-left">
                    <th className="pb-2 pr-3 font-medium">Thời gian</th>
                    <th className="pb-2 pr-3 font-medium">Người hỏi</th>
                    <th className="pb-2 pr-3 font-medium">Câu hỏi</th>
                    <th className="pb-2 pr-3 font-medium">Căn cứ</th>
                    <th className="pb-2 font-medium">Phản hồi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.logs.map((l) => (
                    <tr key={l.id} onClick={() => setDetail(l)}
                      className="hover:bg-gray-50 cursor-pointer">
                      <td className="py-2 pr-3 text-vs-gray-mid whitespace-nowrap">{fmt(l.created_at)}</td>
                      <td className="py-2 pr-3 text-vs-gray truncate max-w-[150px]">{l.user_email}</td>
                      <td className="py-2 pr-3 text-vs-dark">
                        <span className="line-clamp-2">{l.query_text}</span>
                      </td>
                      <td className="py-2 pr-3">
                        {l.has_basis
                          ? <span className="text-green-600">✓</span>
                          : <span className="text-amber-600">⚠</span>}
                      </td>
                      <td className="py-2">{l.feedback === 1 ? '👍' : l.feedback === -1 ? '👎' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[10px] text-vs-gray-mid">
                Hiện {data.logs.length} / {data.total} lượt · bấm một dòng để xem toàn văn
              </p>
            </div>
          )}
        </>
      )}

      {view === 'conversations' && (
        <div className="flex gap-3">
          <div className="w-56 shrink-0">
            <p className="text-[10px] uppercase text-vs-gray-mid mb-1">Người dùng</p>
            <ul className="space-y-0.5 max-h-96 overflow-y-auto">
              {users.length === 0 && <li className="text-xs text-vs-gray-mid">Chuyển sang tab “Theo lượt hỏi” để nạp danh sách.</li>}
              {users.map((u) => (
                <li key={u.email}>
                  <button onClick={() => openUserConvs(u.email)}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded truncate ${
                      convUser === u.email ? 'bg-red-50 text-vs-red font-medium' : 'text-vs-gray hover:bg-gray-50'
                    }`}>{u.email}</button>
                </li>
              ))}
            </ul>
          </div>

          <div className="w-60 shrink-0 border-l border-gray-200 pl-3">
            <p className="text-[10px] uppercase text-vs-gray-mid mb-1">Hội thoại</p>
            {!convUser && <p className="text-xs text-vs-gray-mid">Chọn một người dùng.</p>}
            {convUser && convs.length === 0 && <p className="text-xs text-vs-gray-mid">Chưa có hội thoại nào.</p>}
            <ul className="space-y-0.5 max-h-96 overflow-y-auto">
              {convs.map((c) => (
                <li key={c.id}>
                  <button onClick={() => openConv(c.id)}
                    className="w-full text-left text-xs px-2 py-1.5 rounded text-vs-gray hover:bg-gray-50 truncate"
                    title={c.title}>{c.title}</button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex-1 min-w-0 border-l border-gray-200 pl-3 max-h-96 overflow-y-auto">
            {!convMsgs && <p className="text-xs text-vs-gray-mid">Chọn một hội thoại để xem nội dung.</p>}
            {convMsgs?.map((m, i) => (
              <div key={i} className={`mb-2 text-xs rounded-lg px-2.5 py-1.5 ${
                m.role === 'user' ? 'bg-vs-red text-white ml-8' : 'bg-gray-50 text-vs-gray mr-4'
              }`}>
                <div className="prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chi tiết một lượt hỏi */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between p-4 border-b border-gray-200">
              <div className="min-w-0">
                <p className="text-xs text-vs-gray-mid">{fmt(detail.created_at)} · {detail.user_email}</p>
                <h3 className="text-sm font-bold text-vs-dark mt-0.5">{detail.query_text}</h3>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-vs-dark text-xl leading-none">×</button>
            </div>

            <div className="p-4">
              <div className="flex flex-wrap gap-2 text-[10px] text-vs-gray-mid mb-3">
                <span className={detail.has_basis ? 'text-green-600' : 'text-amber-600'}>
                  {detail.has_basis ? '✓ Có căn cứ' : '⚠ Không có căn cứ'}
                </span>
                <span>{detail.model_used}</span>
                <span>{(detail.input_tokens || 0) + (detail.output_tokens || 0)} token</span>
                {detail.latency_ms && <span>{Math.round(detail.latency_ms / 100) / 10}s</span>}
                {detail.feedback === 1 && <span>👍</span>}
                {detail.feedback === -1 && <span>👎 {detail.feedback_note || ''}</span>}
              </div>

              <div className="prose-sm text-sm text-vs-dark">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.answer_text || '(trống)'}</ReactMarkdown>
              </div>

              {Array.isArray(detail.citations) && detail.citations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-[10px] text-vs-gray-mid font-medium mb-1">
                    Điều khoản đã trích ({detail.citations.length})
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {detail.citations.map((c, i) => (
                      <span key={i} className="text-[10px] px-2 py-1 bg-gray-50 border border-gray-200 rounded">
                        <b className="text-vs-red">{i + 1}</b> {c.label || c.id}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

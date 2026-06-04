'use client'
import { useState, useEffect } from 'react'

export default function ConflictsTab() {
  const [conflicts, setConflicts] = useState([])
  const [loading, setLoading] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [reviewDoc, setReviewDoc] = useState('')
  const [reviewResult, setReviewResult] = useState(null)

  useEffect(() => { fetchConflicts() }, [])

  async function fetchConflicts() {
    setLoading(true)
    try {
      const res = await fetch('/api/review-conflicts')
      const data = await res.json()
      setConflicts(data.conflicts || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function triggerReview() {
    if (!reviewDoc.trim()) return
    setReviewing(true)
    setReviewResult(null)
    try {
      const res = await fetch('/api/review-conflicts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newDocFilename: reviewDoc.trim() })
      })
      const data = await res.json()
      setReviewResult(data)
      fetchConflicts()
    } catch (e) {
      setReviewResult({ error: e.message })
    } finally {
      setReviewing(false)
    }
  }

  async function resolveConflict(conflictId, action) {
    try {
      await fetch('/api/review-conflicts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conflictId, action })
      })
      fetchConflicts()
    } catch (e) { console.error(e) }
  }

  const pending = conflicts.filter(c => c.status === 'pending')
  const resolved = conflicts.filter(c => c.status !== 'pending')

  return (
    <>
      <h2 className="text-base font-semibold text-vs-dark mb-4">Rà soát xung đột văn bản</h2>

      {/* Trigger review */}
      <div className="p-4 bg-gray-50 rounded-lg mb-4">
        <p className="text-sm text-vs-gray mb-2">Nhập tên file văn bản mới để AI rà soát xung đột với các văn bản cũ:</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={reviewDoc}
            onChange={e => setReviewDoc(e.target.value)}
            placeholder="ví dụ: luat55.md"
            className="vs-input text-sm flex-1"
          />
          <button onClick={triggerReview} disabled={reviewing || !reviewDoc.trim()}
            className="vs-btn-primary disabled:opacity-50 flex-shrink-0 text-sm">
            {reviewing ? 'Đang rà soát...' : '🔍 Rà soát'}
          </button>
        </div>
        {reviewing && (
          <div className="mt-3 flex items-center gap-2 text-sm text-vs-gray-mid">
            <span className="inline-block w-4 h-4 border-2 border-vs-red border-t-transparent rounded-full animate-spin" />
            AI đang so sánh văn bản mới với {'>'}250 chunks cũ...
          </div>
        )}
        {reviewResult && (
          <div className={`mt-3 p-3 rounded text-sm ${
            reviewResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
          }`}>
            {reviewResult.error ? `❌ ${reviewResult.error}` : `✅ ${reviewResult.message}`}
          </div>
        )}
      </div>

      {/* Pending conflicts */}
      {pending.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-vs-dark mb-2 flex items-center gap-2">
            <span className="w-5 h-5 bg-yellow-500 text-white text-xs rounded-full flex items-center justify-center">{pending.length}</span>
            Xung đột chờ xử lý
          </h3>
          <div className="space-y-2">
            {pending.map(c => (
              <div key={c.id} className="p-3 border border-yellow-200 bg-yellow-50 rounded-lg">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-vs-dark">
                      {c.type === 'superseded' ? '🔴 Thay thế' : '🟡 Sửa đổi'}
                    </p>
                    <p className="text-xs text-vs-gray mt-1">
                      <b>Cũ:</b> {c.old_label}
                    </p>
                    <p className="text-xs text-vs-gray">
                      <b>Mới:</b> {c.new_label}
                    </p>
                    <p className="text-xs text-vs-gray-mid mt-1 italic">{c.reason}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => resolveConflict(c.id, 'accept')}
                      className="text-xs px-2.5 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 font-medium">
                      Đánh dấu lỗi thời
                    </button>
                    <button onClick={() => resolveConflict(c.id, 'reject')}
                      className="text-xs px-2.5 py-1.5 bg-gray-200 text-vs-gray rounded hover:bg-gray-300">
                      Giữ nguyên
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resolved history */}
      {resolved.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-vs-gray-mid mb-2">Đã xử lý ({resolved.length})</h3>
          <div className="space-y-1">
            {resolved.slice(0, 10).map(c => (
              <div key={c.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-xs">
                <span>{c.status === 'accepted' ? '✅' : '⏭️'}</span>
                <span className="text-vs-gray truncate flex-1">
                  {c.old_label} → {c.status === 'accepted' ? 'Đã đánh dấu lỗi thời' : 'Giữ nguyên'}
                </span>
                <span className="text-vs-gray-mid text-[10px]">{new Date(c.resolvedAt).toLocaleDateString('vi-VN')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && pending.length === 0 && resolved.length === 0 && !reviewResult && (
        <div className="text-center py-6">
          <p className="text-sm text-vs-gray-mid">Chưa có xung đột nào. Upload văn bản mới rồi nhấn "Rà soát" để kiểm tra.</p>
        </div>
      )}
    </>
  )
}

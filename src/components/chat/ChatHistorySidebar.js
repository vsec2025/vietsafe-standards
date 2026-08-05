'use client'
import { useEffect, useMemo, useRef, useState } from 'react'

function bucketOf(iso) {
  if (!iso) return 'Cũ hơn'
  const d = new Date(iso)
  if (isNaN(d)) return 'Cũ hơn'
  const days = (Date.now() - d.getTime()) / 86400000
  if (days < 1) return 'Hôm nay'
  if (days < 7) return '7 ngày qua'
  return 'Cũ hơn'
}
const ORDER = ['Hôm nay', '7 ngày qua', 'Cũ hơn']

export default function ChatHistorySidebar({
  conversations = [],
  activeId,
  onNew,
  onOpen,
  onRename,
  onDelete,
  loading,
}) {
  const [q, setQ] = useState('')
  const [menuId, setMenuId] = useState(null)
  const [editId, setEditId] = useState(null)
  const [editVal, setEditVal] = useState('')
  const boxRef = useRef(null)

  // Bấm ra ngoài thì đóng menu 3 chấm
  useEffect(() => {
    const h = (e) => { if (!boxRef.current?.contains(e.target)) setMenuId(null) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = s ? conversations.filter((c) => (c.title || '').toLowerCase().includes(s)) : conversations
    const m = new Map(ORDER.map((k) => [k, []]))
    for (const c of list) m.get(bucketOf(c.updatedAt))?.push(c)
    return ORDER.map((k) => [k, m.get(k)]).filter(([, v]) => v.length)
  }, [conversations, q])

  function submitRename(id) {
    const t = editVal.trim()
    setEditId(null)
    if (t) onRename?.(id, t)
  }

  return (
    <div ref={boxRef} className="h-full flex flex-col bg-white">
      <div className="p-2.5 border-b border-gray-200">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-medium bg-vs-red text-white rounded-lg px-3 py-2 hover:opacity-90 transition"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
          Bắt đầu hội thoại mới
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm trong lịch sử chat"
          className="mt-2 w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-vs-red"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading && <p className="text-xs text-vs-gray-mid px-1 py-2">Đang tải...</p>}
        {!loading && !groups.length && (
          <p className="text-xs text-vs-gray-mid px-1 py-2">
            {q ? 'Không có hội thoại nào khớp.' : 'Chưa có hội thoại nào.'}
          </p>
        )}

        {groups.map(([label, items]) => (
          <div key={label} className="mb-3">
            <p className="text-[10px] uppercase tracking-wide text-vs-gray-mid px-1 mb-1">{label}</p>
            <ul className="space-y-0.5">
              {items.map((c) => (
                <li key={c.id} className="relative group">
                  {editId === c.id ? (
                    <input
                      autoFocus
                      value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                      onBlur={() => submitRename(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitRename(c.id)
                        if (e.key === 'Escape') setEditId(null)
                      }}
                      className="w-full text-xs border border-vs-red rounded px-2 py-1.5"
                    />
                  ) : (
                    <div
                      className={`flex items-center rounded-lg ${
                        activeId === c.id ? 'bg-red-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <button
                        onClick={() => onOpen?.(c.id)}
                        className={`flex-1 min-w-0 text-left text-xs px-2 py-1.5 truncate ${
                          activeId === c.id ? 'text-vs-red font-medium' : 'text-vs-gray'
                        }`}
                        title={c.title}
                      >
                        {c.title || 'Hội thoại'}
                      </button>
                      <button
                        onClick={() => setMenuId(menuId === c.id ? null : c.id)}
                        className="px-1.5 py-1.5 text-gray-400 hover:text-vs-dark opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Tuỳ chọn"
                      >⋯</button>
                    </div>
                  )}

                  {menuId === c.id && (
                    <div className="absolute right-1 top-8 z-20 w-32 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-xs">
                      <button
                        onClick={() => { setEditId(c.id); setEditVal(c.title || ''); setMenuId(null) }}
                        className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-vs-gray"
                      >Đổi tên</button>
                      <button
                        onClick={() => {
                          setMenuId(null)
                          if (confirm(`Xoá hội thoại "${c.title || ''}"?`)) onDelete?.(c.id)
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600"
                      >Xoá</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'

const statusConfig = {
  active: { label: 'Còn hiệu lực', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  expired: { label: 'Hết hiệu lực', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  amended: { label: 'Đã sửa đổi', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  pending: { label: 'Chờ hiệu lực', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' }
}

export default function Sidebar({ onDocSelect }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    fetchDocuments()
  }, [])

  async function fetchDocuments() {
    try {
      const res = await fetch('/api/documents')
      const data = await res.json()
      setDocuments(data.documents || [])
    } catch (err) {
      console.error('Error loading documents:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = filter === 'all' 
    ? documents 
    : documents.filter(d => d.status === filter)

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-3 border-b border-gray-200">
        <h2 className="text-sm font-bold text-vs-dark font-montserrat uppercase tracking-wide mb-2">
          Văn bản pháp quy
        </h2>
        
        {/* Filter */}
        <div className="flex flex-wrap gap-1">
          {[
            { key: 'all', label: 'Tất cả' },
            { key: 'active', label: 'Hiệu lực' },
            { key: 'expired', label: 'Hết HL' },
            { key: 'amended', label: 'Sửa đổi' },
            { key: 'pending', label: 'Chờ HL' }
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-[11px] px-2 py-0.5 rounded-full transition font-medium ${
                filter === f.key 
                  ? 'bg-vs-red text-white' 
                  : 'bg-gray-100 text-vs-gray-mid hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-sm text-vs-gray-mid">Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-vs-gray-mid">Không có văn bản</div>
        ) : (
          filtered.map(doc => {
            const st = statusConfig[doc.status] || statusConfig.active
            const isSelected = selected === doc.id
            return (
              <button
                key={doc.id}
                onClick={() => {
                  setSelected(doc.id)
                  onDocSelect?.(doc)
                }}
                className={`w-full text-left p-3 border-b border-gray-100 hover:bg-gray-50 transition ${
                  isSelected ? 'bg-red-50 border-l-2 border-l-vs-red' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${st.dot}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-vs-dark leading-snug line-clamp-2">
                      {doc.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${st.color}`}>
                        {st.label}
                      </span>
                      {/* Văn bản chưa từng chỉnh qua giao diện không có updatedAt —
                          new Date('') sẽ hiển thị "Invalid Date". */}
                      {doc.updatedAt && !isNaN(new Date(doc.updatedAt)) && (
                        <span className="text-[10px] text-vs-gray-mid">
                          {new Date(doc.updatedAt).toLocaleDateString('vi-VN')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-gray-200 text-center">
        <p className="text-[10px] text-vs-gray-mid">{documents.length} văn bản</p>
      </div>
    </div>
  )
}

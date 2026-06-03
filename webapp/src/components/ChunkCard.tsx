'use client'
import { useState } from 'react'
import { SearchResult } from '@/types'
import { DocStatusBadge } from './DocStatusBadge'
import { ChevronDown, ChevronUp, FileText } from 'lucide-react'

interface Props {
  result: SearchResult
  onAddToChat?: (chunk: SearchResult) => void
}

export function ChunkCard({ result, onAddToChat }: Props) {
  const [expanded, setExpanded] = useState(false)
  const { chunk, doc_status } = result

  const preview = chunk.content.replace(/#+\s/g, '').substring(0, 200)

  return (
    <div className={`border rounded-lg overflow-hidden bg-white transition-all ${
      doc_status === 'het_hieu_luc' ? 'opacity-60 border-red-200' :
      doc_status === 'da_sua_doi' ? 'border-yellow-300' : 'border-gray-200'
    }`}>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <DocStatusBadge status={doc_status} />
              <span className="text-xs text-gray-500 truncate">{chunk.van_ban}</span>
            </div>
            <div className="font-medium text-sm text-gray-800">
              {chunk.don_vi}{chunk.tieu_de ? ` — ${chunk.tieu_de}` : ''}
            </div>
            {chunk.phan && (
              <div className="text-xs text-gray-400 mt-0.5">{chunk.phan}</div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onAddToChat && (
              <button
                onClick={() => onAddToChat(result)}
                className="text-xs text-[#C8102E] hover:underline px-2 py-1 rounded hover:bg-red-50"
              >
                Hỏi AI
              </button>
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {!expanded && (
          <p className="text-xs text-gray-600 mt-2 line-clamp-2">{preview}...</p>
        )}
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-3 bg-gray-50">
          <div className="prose-legal text-sm text-gray-700 whitespace-pre-wrap max-h-96 overflow-y-auto scrollbar-thin">
            {chunk.content}
          </div>
        </div>
      )}

      {doc_status === 'da_sua_doi' && (
        <div className="bg-yellow-50 border-t border-yellow-200 px-3 py-2 text-xs text-yellow-700">
          ⚠️ Điều khoản này đã được sửa đổi bổ sung. Vui lòng kiểm tra văn bản sửa đổi mới nhất.
        </div>
      )}
      {doc_status === 'het_hieu_luc' && (
        <div className="bg-red-50 border-t border-red-200 px-3 py-2 text-xs text-red-700">
          🚫 Điều khoản này đã hết hiệu lực.
        </div>
      )}
    </div>
  )
}

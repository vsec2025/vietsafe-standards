'use client'
import { useState } from 'react'
import { DocType, DocStatus } from '@/types'
import { X, Upload, AlertCircle } from 'lucide-react'

interface Props {
  onClose: () => void
  onSuccess: () => void
  existingDocs: string[]
}

export function UploadModal({ onClose, onSuccess, existingDocs }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [meta, setMeta] = useState({
    so_hieu: '', ten: '', loai: 'LUAT' as DocType,
    ngay_ban_hanh: '', ngay_hieu_luc: '',
    trang_thai: 'con_hieu_luc' as DocStatus,
    sua_doi_cho: '', thay_the_cho: '', ghi_chu: '',
  })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.name.endsWith('.md')) { setError('Chỉ chấp nhận file .md'); return }
    setFile(f)
    setError('')
    // Tự điền tên file vào số hiệu nếu chưa có
    if (!meta.so_hieu) {
      const guess = f.name.replace('.md', '').replace(/_/g, ' ')
      setMeta(m => ({ ...m, so_hieu: guess }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) { setError('Vui lòng chọn file .md'); return }
    if (!meta.so_hieu || !meta.ten) { setError('Vui lòng điền đầy đủ thông tin'); return }

    setLoading(true)
    setError('')
    const form = new FormData()
    form.append('file', file)
    form.append('meta', JSON.stringify(meta))

    const res = await fetch('/api/upload', { method: 'POST', body: form })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error || 'Upload thất bại'); return }
    onSuccess()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="bg-[#C8102E] px-5 py-4 flex items-center justify-between rounded-t-xl">
          <div className="text-white font-semibold">Upload văn bản mới</div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* File */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File .md <span className="text-red-500">*</span></label>
            <label className="flex items-center gap-3 border-2 border-dashed border-gray-300 rounded-lg p-4 cursor-pointer hover:border-red-400 transition">
              <Upload className="w-5 h-5 text-gray-400" />
              <span className="text-sm text-gray-500">{file ? file.name : 'Chọn file .md...'}</span>
              <input type="file" accept=".md" onChange={handleFile} className="hidden" />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Số hiệu văn bản <span className="text-red-500">*</span></label>
              <input value={meta.so_hieu} onChange={e => setMeta(m => ({ ...m, so_hieu: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="VD: Luật 55/2024/QH15" required />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Tên đầy đủ <span className="text-red-500">*</span></label>
              <input value={meta.ten} onChange={e => setMeta(m => ({ ...m, ten: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="VD: Luật Phòng cháy, chữa cháy và cứu nạn, cứu hộ" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Loại văn bản</label>
              <select value={meta.loai} onChange={e => setMeta(m => ({ ...m, loai: e.target.value as DocType }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500">
                <option value="LUAT">Luật</option>
                <option value="NGHI_DINH">Nghị định</option>
                <option value="THONG_TU">Thông tư</option>
                <option value="QCVN">QCVN</option>
                <option value="TCVN">TCVN</option>
                <option value="KHAC">Khác</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
              <select value={meta.trang_thai} onChange={e => setMeta(m => ({ ...m, trang_thai: e.target.value as DocStatus }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500">
                <option value="con_hieu_luc">Còn hiệu lực</option>
                <option value="cho_hieu_luc">Chờ có hiệu lực</option>
                <option value="da_sua_doi">Đã sửa đổi</option>
                <option value="het_hieu_luc">Hết hiệu lực</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày ban hành</label>
              <input type="date" value={meta.ngay_ban_hanh} onChange={e => setMeta(m => ({ ...m, ngay_ban_hanh: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày hiệu lực</label>
              <input type="date" value={meta.ngay_hieu_luc} onChange={e => setMeta(m => ({ ...m, ngay_hieu_luc: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
          </div>

          {/* Quan hệ sửa đổi */}
          <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-3 space-y-3">
            <div className="text-sm font-medium text-yellow-800 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              Quan hệ sửa đổi (nếu có)
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Văn bản này sửa đổi bổ sung văn bản nào?</label>
              <select value={meta.sua_doi_cho} onChange={e => setMeta(m => ({ ...m, sua_doi_cho: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500">
                <option value="">— Không (văn bản độc lập) —</option>
                {existingDocs.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Văn bản này thay thế hoàn toàn văn bản nào?</label>
              <select value={meta.thay_the_cho} onChange={e => setMeta(m => ({ ...m, thay_the_cho: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500">
                <option value="">— Không —</option>
                {existingDocs.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
            <textarea value={meta.ghi_chu} onChange={e => setMeta(m => ({ ...m, ghi_chu: e.target.value }))}
              rows={2} placeholder="Ghi chú thêm về văn bản..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500" />
          </div>

          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition">
              Hủy
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-[#C8102E] hover:bg-[#a00d24] text-white py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-60">
              {loading ? 'Đang upload...' : 'Upload & Xử lý'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

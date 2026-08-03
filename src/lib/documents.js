// Danh sách văn bản suy trực tiếp từ corpus.
//
// Trước đây danh sách nằm trong Redis (documents:list) tách rời corpus, nên hai
// bên lệch nhau: văn bản có trong corpus mà không có trong danh sách (không xoá
// được qua giao diện), và ngược lại. Tên file trong danh sách seed cũng không
// khớp file thật, khiến nút Xoá gọi GitHub xoá nhầm đường dẫn không tồn tại.
//
// Nay corpus là nguồn sự thật về việc "văn bản nào đang tồn tại"; Redis chỉ phủ
// thêm metadata người dùng chỉnh (trạng thái, tiêu đề, ai upload).
import { loadSearchData } from './search'
import { getDocMeta } from './redis'

export const DOC_STATUSES = ['active', 'expired', 'amended', 'pending']

function titleFor(chunk) {
  const parts = [chunk.van_ban || chunk.so_hieu]
  if (chunk.co_quan) parts.push(chunk.co_quan)
  return parts.filter(Boolean).join(' — ') || 'Văn bản chưa xác định'
}

export async function listDocuments() {
  const [{ chunks }, meta] = await Promise.all([loadSearchData(), getDocMeta()])

  const byFile = new Map()
  for (const c of chunks || []) {
    // source = tên file thật trong raw/, do pipeline ghi vào từng chunk
    const filename = c.source || ''
    if (!filename) continue
    const entry = byFile.get(filename)
    if (entry) {
      entry.chunks += 1
      continue
    }
    byFile.set(filename, {
      id: filename,
      filename,
      title: titleFor(c),
      van_ban: c.van_ban || '',
      so_hieu: c.so_hieu || '',
      loai: c.loai || '',
      nam: c.nam || '',
      chunks: 1,
    })
  }

  const docs = []
  for (const doc of byFile.values()) {
    const m = meta[doc.filename] || {}
    // Đã bấm xoá nhưng pipeline chưa chạy xong: ẩn khỏi danh sách để giao diện
    // phản ánh ngay ý định của người dùng.
    if (m.deletedAt) continue
    docs.push({
      ...doc,
      title: m.title || doc.title,
      status: m.status || 'active',
      uploadedBy: m.uploadedBy || '',
      uploadedAt: m.uploadedAt || '',
      updatedAt: m.updatedAt || '',
    })
  }

  docs.sort((a, b) => b.chunks - a.chunks)
  return docs
}

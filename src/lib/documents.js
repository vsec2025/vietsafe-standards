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

/** Phần sau dấu '/' trong clause_id — dùng làm neo (#anchor) trên trang đọc. */
export function anchorOf(chunk) {
  const cid = chunk.clause_id || chunk.id || ''
  const i = cid.indexOf('/')
  return i === -1 ? cid : cid.slice(i + 1)
}

/**
 * Toàn văn một văn bản, dựng từ chính các chunk đã cắt theo điều khoản.
 *
 * Dựng từ chunk (chứ không đọc lại file .md) để neo trên trang đọc LUÔN trùng
 * khớp với trích dẫn mà chat trả về — không thể lệch nhau.
 */
export async function getDocument(slug) {
  const { chunks } = await loadSearchData()
  const list = (chunks || []).filter((c) => c.doc_slug === slug)
  if (!list.length) return null

  const f = list[0]
  return {
    slug,
    van_ban: f.van_ban || f.so_hieu || slug,
    so_hieu: f.so_hieu || '',
    loai: f.loai || '',
    co_quan: f.co_quan || '',
    nam: f.nam || '',
    source: f.source || '',
    total_tokens: list.reduce((s, c) => s + (c.tokens || 0), 0),
    clauses: list.map((c) => ({
      anchor: anchorOf(c),
      don_vi: c.don_vi || '',
      tieu_de: c.tieu_de || '',
      phan: c.phan || '',
      chuong: c.chuong || '',
      content: c.content || '',
    })),
  }
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
      doc_slug: c.doc_slug || '', // để mở trang đọc /van-ban/<slug>
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

'use client'
import { useEffect, useState } from 'react'

function Section({ title, children, open, onToggle }) {
  return (
    <div className="border-b border-gray-200 last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between text-left py-2.5 text-sm font-medium text-vs-dark hover:text-vs-red transition"
      >
        {title}
        <span className={`text-vs-gray-mid transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {open && <div className="pb-3 text-[13px] text-vs-gray leading-relaxed">{children}</div>}
    </div>
  )
}

export default function AboutModal({ onClose }) {
  const [open, setOpen] = useState('data')
  const [docs, setDocs] = useState(null)

  // Liệt kê đúng các văn bản đang có trong hệ thống, không viết cứng danh sách
  useEffect(() => {
    fetch('/api/documents')
      .then((r) => r.json())
      .then((d) => setDocs(d.documents || []))
      .catch(() => setDocs([]))
  }, [])

  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const t = (k) => setOpen(open === k ? '' : k)

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-4 border-b border-gray-200">
          <div>
            <h3 className="text-base font-bold text-vs-dark font-montserrat">Trợ lý PCCC VIETSAFE</h3>
            <p className="text-xs text-vs-gray-mid mt-0.5">Tra cứu quy chuẩn dựa trên văn bản đã số hoá</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-vs-dark text-xl leading-none">×</button>
        </div>

        <div className="px-4">
          <Section title="Trợ lý dùng dữ liệu nào?" open={open === 'data'} onToggle={() => t('data')}>
            {docs === null && <p className="text-vs-gray-mid">Đang tải danh sách...</p>}
            {docs?.length === 0 && <p className="text-vs-gray-mid">Chưa có văn bản nào được nạp.</p>}
            {docs?.length > 0 && (
              <>
                <p className="mb-2">
                  Trợ lý chỉ trả lời dựa trên <b>{docs.length} văn bản</b> đã được nạp và cắt theo điều khoản:
                </p>
                <ul className="space-y-1">
                  {docs.map((d) => (
                    <li key={d.id} className="flex justify-between gap-2">
                      {d.doc_slug ? (
                        <a href={`/van-ban/${d.doc_slug}`} target="_blank" rel="noopener noreferrer"
                          className="text-vs-red hover:underline">{d.van_ban || d.title}</a>
                      ) : (
                        <span>{d.van_ban || d.title}</span>
                      )}
                      <span className="text-vs-gray-mid shrink-0">{d.chunks} điều</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>

          <Section title="Trả lời được loại câu hỏi gì?" open={open === 'ask'} onToggle={() => t('ask')}>
            <ul className="list-disc pl-4 space-y-1">
              <li><b>Tra cứu điều khoản</b>: quy định nào áp dụng cho tình huống cụ thể.</li>
              <li><b>Quy trình tính toán</b>: các bước, công thức và ngưỡng tối thiểu theo quy chuẩn.</li>
              <li><b>Đối chiếu hồ sơ</b>: kiểm tra đoạn tài liệu dự án với quy định (trang Kiểm tra dự án).</li>
            </ul>
          </Section>

          <Section title="Trích dẫn hoạt động thế nào?" open={open === 'cite'} onToggle={() => t('cite')}>
            <p>
              Mỗi khẳng định có tính quy phạm được gắn số nhỏ dạng <sup className="text-vs-red font-bold">1</sup>{' '}
              ngay sau câu. Số này khớp với chip ở khối “Nguồn trích dẫn” bên dưới câu trả lời.
              Bấm vào số hoặc chip sẽ mở đúng điều khoản trong trang đọc văn bản để bạn tự đối chiếu.
            </p>
            <p className="mt-2">
              Nếu không tìm được căn cứ, trợ lý gắn nhãn <b>“Không tìm thấy trích dẫn cụ thể”</b> thay vì suy đoán.
            </p>
          </Section>

          <Section title="Trợ lý KHÔNG mạnh ở điểm gì?" open={open === 'limit'} onToggle={() => t('limit')}>
            <ul className="list-disc pl-4 space-y-1">
              <li><b>Không thay thế thẩm duyệt chính thức.</b> Kết quả là điểm khởi đầu tra cứu, không phải kết luận pháp lý.</li>
              <li><b>Chỉ biết văn bản đã nạp.</b> Quy định nằm ngoài danh sách trên thì trợ lý không biết — kể cả khi văn bản đó đang có hiệu lực.</li>
              <li><b>Không tự cập nhật.</b> Văn bản mới ban hành phải được nạp vào hệ thống mới dùng được.</li>
              <li><b>Có thể hiểu sai ngữ cảnh dự án.</b> Hãy nêu rõ loại công trình, quy mô, hạng nguy hiểm cháy để kết quả sát hơn.</li>
            </ul>
          </Section>

          <Section title="Tìm hiểu thêm ở đâu?" open={open === 'more'} onToggle={() => t('more')}>
            <p>
              Xem toàn văn từng quy chuẩn trong mục <b>Văn bản pháp quy</b>, hoặc liên hệ đội kỹ thuật
              VIETSAFE E&C qua <a href="mailto:info@vnsec.com.vn" className="text-vs-red hover:underline">info@vnsec.com.vn</a>.
            </p>
          </Section>
        </div>

        <div className="p-4 pt-2">
          <p className="text-[11px] italic text-vs-gray-mid">
            Trợ lý PCCC chỉ là điểm khởi đầu tra cứu. Vui lòng kiểm tra lại với văn bản gốc trước khi áp dụng.
          </p>
        </div>
      </div>
    </div>
  )
}

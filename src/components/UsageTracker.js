'use client'
import { useState, useEffect } from 'react'

/**
 * Thanh trạng thái phiên làm việc: thời gian và số câu hỏi.
 *
 * Phần ước lượng chi phí (dạng "$0.000/$0.30") đã bỏ: nó tính cứng theo giá
 * Haiku và ngân sách USD, cả hai đều sai sau khi chuyển sang Sonnet 5 và hạn
 * mức tính bằng VND. Mức sử dụng thật hiển thị bằng thanh nhỏ dưới ô nhập,
 * lấy từ chi tiêu thực tế chứ không phải ước lượng.
 */
export default function UsageTracker({ questionCount }) {
  const [sessionStart] = useState(Date.now())
  const [elapsed, setElapsed] = useState('0:00')

  useEffect(() => {
    const timer = setInterval(() => {
      const diff = Date.now() - sessionStart
      const mins = Math.floor(diff / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      setElapsed(`${mins}:${secs.toString().padStart(2, '0')}`)
    }, 1000)
    return () => clearInterval(timer)
  }, [sessionStart])

  if (!questionCount) return null

  return (
    <div className="px-3 py-1 border-t border-gray-200 bg-gray-50 text-[10px] flex items-center gap-3 text-vs-gray-mid">
      <span className="flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
        </svg>
        {elapsed}
      </span>
      <span>{questionCount} câu hỏi</span>
    </div>
  )
}

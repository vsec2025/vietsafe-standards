'use client'

/**
 * Màn hình mở đầu khi bắt đầu hội thoại mới.
 * Biểu tượng dùng bản sắc VIETSAFE (khiên + ngọn lửa cách điệu trong khối đỏ),
 * không sao chép nhận diện của bên thứ ba.
 */
export default function EmptyState({ suggestions = [], onPick, mode }) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 py-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-vs-red flex items-center justify-center shadow-lg shadow-red-200/60 mb-5">
        <svg viewBox="0 0 24 24" className="w-9 h-9 text-white" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M12 3l7 3v5c0 4.4-3 8.2-7 10-4-1.8-7-5.6-7-10V6l7-3z" strokeLinejoin="round" />
          <path d="M12 8.5c1.4 1.3 2.2 2.5 2.2 3.7a2.2 2.2 0 01-4.4 0c0-1.2.8-2.4 2.2-3.7z" strokeLinejoin="round" />
        </svg>
      </div>

      <h2 className="text-xl sm:text-2xl font-bold text-vs-dark font-montserrat">
        Tôi có thể giúp gì cho bạn hôm nay?
      </h2>
      <p className="mt-2 max-w-md text-sm text-vs-gray-mid leading-relaxed">
        Tôi nắm rõ các QCVN/TCVN PCCC đã được số hoá trong hệ thống.
        <br className="hidden sm:block" />
        Bạn mô tả tình huống dự án, chúng ta cùng tra cứu điều khoản áp dụng.
      </p>

      {suggestions.length > 0 && (
        <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-2xl">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onPick?.(s)}
              className="text-left text-[13px] leading-snug text-vs-gray bg-white border border-gray-200 rounded-xl px-4 py-3
                         hover:border-vs-red hover:shadow-md hover:-translate-y-px transition-all duration-150"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {mode && (
        <p className="mt-6 text-[11px] text-vs-gray-mid">
          Chế độ đang dùng: <b className="text-vs-gray">{mode}</b>
        </p>
      )}
    </div>
  )
}

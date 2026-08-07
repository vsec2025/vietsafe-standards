import { callClaude } from './claude'

/**
 * Tách một câu hỏi thành nhiều truy vấn con để tìm kiếm.
 *
 * Vì sao cần: câu hỏi dạng "quy trình tính bề rộng thang thoát nạn" cần ghép
 * nhiều mảnh nằm rải rác — phân loại công năng, số người, hệ số chiều rộng,
 * bề rộng tối thiểu. Nhúng MỘT câu hỏi rồi tìm chỉ ra được những đoạn *nghe
 * giống câu hỏi đó*, nên phần lớn kết quả trùng nhau về một khía cạnh và các
 * mảnh còn lại không bao giờ lọt vào ngữ cảnh. Không có bước này thì hệ thống
 * chỉ đọc lại điều khoản chứ không tổng hợp được.
 */

// Cùng model với lượt trả lời chính (Sonnet 5) — dự án đã thống nhất một model.
const MODEL = process.env.VSEC_EXPAND_MODEL ?? process.env.VSEC_DEFAULT_MODEL ?? 'claude-sonnet-5'

// Sonnet 5 bật adaptive thinking mặc định, và max_tokens là trần chung cho
// thinking + câu trả lời. Đặt sát nhu cầu (~150 token truy vấn) thì thinking
// ăn hết trần, trả về rỗng và ta lặng lẽ mất bước tách câu hỏi.
const MAX_TOKENS = 2000

const SYSTEM = `Bạn là kỹ sư PCCC Việt Nam, chuẩn bị truy vấn để tra cứu QCVN/TCVN.

Cho một câu hỏi, hãy liệt kê các NỘI DUNG CẦN TRA để trả lời đầy đủ.

Quy tắc:
- Mỗi dòng một truy vấn ngắn (3-12 từ), dùng thuật ngữ như trong văn bản quy chuẩn.
- Câu hỏi dạng quy trình/cách tính/thiết kế: tách thành 3-5 truy vấn cho các
  khía cạnh KHÁC NHAU (phân loại, thông số đầu vào, công thức/hệ số, giới hạn
  tối thiểu, trường hợp đặc biệt). Không viết 5 truy vấn cùng nói một ý.
- Câu hỏi tra cứu đơn giản: chỉ trả về ĐÚNG MỘT dòng là chính câu hỏi đó.
- Dùng từ ngữ của văn bản quy chuẩn, không dùng từ thông tục.
  Ví dụ: "nhà xưởng" -> "nhà sản xuất"; "thang thoát hiểm" -> "buồng thang bộ thoát nạn".
- CHỈ xuất các dòng truy vấn. Không đánh số, không gạch đầu dòng, không giải thích.`

/**
 * Trả về { queries, usage }.
 * - queries: mảng truy vấn, luôn có câu hỏi gốc ở đầu.
 * - usage: token của chính lượt tách này, để cộng vào hạn mức ngày của user.
 */
export async function expandQuery(question, apiKey, { max = 5 } = {}) {
  const original = (question || '').trim()
  const none = { queries: [original].filter(Boolean), usage: { input: 0, output: 0 } }
  if (!original || !apiKey || apiKey === 'placeholder') return none

  try {
    const { text, usage } = await callClaude({
      apiKey,
      model: MODEL,
      system: SYSTEM,
      messages: [{ role: 'user', content: original }],
      maxTokens: MAX_TOKENS,
      effort: 'low',
    })

    const subs = text
      .split('\n')
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
      .filter((l) => l.length >= 3 && l.length <= 120)
      .filter((l) => l.toLowerCase() !== original.toLowerCase())

    return {
      // Câu hỏi gốc luôn được giữ: nó là diễn đạt sát nhất với ý người dùng
      queries: [original, ...subs].slice(0, max + 1),
      usage: { input: usage?.input_tokens ?? 0, output: usage?.output_tokens ?? 0 },
    }
  } catch (e) {
    // Tách câu hỏi hỏng thì lùi về tìm kiếm một truy vấn — không chặn hội thoại
    console.error('[query-expand] lỗi, dùng truy vấn gốc:', e.message)
    return none
  }
}

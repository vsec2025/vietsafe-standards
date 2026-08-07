// Gọi Claude Messages API.
//
// LƯU Ý QUAN TRỌNG: Claude Sonnet 5 bật adaptive thinking MẶC ĐỊNH (Haiku 4.5
// thì không). Khi đó `content` trả về gồm cả khối `thinking` lẫn khối `text`,
// và khối thinking thường đứng TRƯỚC. Đọc `content[0].text` sẽ ra `undefined`
// -> câu trả lời rỗng, dù API gọi thành công. Luôn dùng extractText().
//
// `max_tokens` là trần chung cho thinking + câu trả lời, nên phải rộng rãi;
// giá trị cũ (600-2000) đủ cho Haiku không-thinking nhưng bị thinking ăn hết.

export const CLAUDE_URL = 'https://api.anthropic.com/v1/messages'

/** Ghép toàn bộ khối `text`, bỏ qua thinking và các loại khối khác. */
export function extractText(data) {
  if (!Array.isArray(data?.content)) return ''
  return data.content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
    .trim()
}

/**
 * Gọi Claude và trả về { text, usage, stopReason, raw }.
 * Ném lỗi kèm nội dung phản hồi để log ra nguyên nhân thật.
 */
export async function callClaude({
  apiKey,
  model,
  system,
  messages,
  maxTokens = 8000,
  // low|medium|high|xhigh|max — 'low' đủ tốt cho hỏi-đáp, giữ độ trễ thấp.
  // Đặt null để BỎ HẲN: Haiku 4.5 không nhận output_config.effort và sẽ trả 400.
  effort = 'low',
}) {
  const res = await fetch(CLAUDE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages,
      ...(effort ? { output_config: { effort } } : {}),
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`Anthropic API ${res.status}:`, body)
    throw new Error(`Anthropic API ${res.status}`)
  }

  const data = await res.json()
  const text = extractText(data)

  // Hết trần token trước khi kịp viết câu trả lời — im lặng trả về rỗng sẽ
  // hiện ra như "AI không trả lời", rất khó lần ra nguyên nhân.
  if (!text && data.stop_reason === 'max_tokens') {
    console.error(`Anthropic: hết max_tokens (${maxTokens}) trước khi có text. usage=`,
      JSON.stringify(data.usage))
  }

  return { text, usage: data.usage, stopReason: data.stop_reason, raw: data }
}

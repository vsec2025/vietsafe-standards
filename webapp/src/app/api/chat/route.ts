import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { search } from '@/lib/search'
import { addUsage, checkBudget } from '@/lib/usage'
import { getRedis, keys, getVNMonth } from '@/lib/redis'
import { ChatMessage } from '@/types'

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const userId = (session.user as any).id
  
  // Kiểm tra budget
  const { ok, usage } = await checkBudget(userId)
  if (!ok) {
    return NextResponse.json({ 
      error: 'budget_exceeded',
      message: 'Bạn đã đạt giới hạn $0.30 hôm nay. Hạn mức sẽ reset lúc 00:00.' 
    }, { status: 429 })
  }
  
  const { question, sessionId, history = [] } = await req.json()
  if (!question?.trim()) return NextResponse.json({ error: 'Empty question' }, { status: 400 })
  
  // Tìm context liên quan
  const searchResults = await search(question, 4)
  
  const context = searchResults.map(r => 
    `[${r.chunk.van_ban} - ${r.chunk.don_vi}${r.chunk.tieu_de ? ': ' + r.chunk.tieu_de : ''}]\n${r.chunk.content}`
  ).join('\n\n---\n\n')
  
  const warningChunks = searchResults.filter(r => r.doc_status === 'da_sua_doi')
  
  // Gọi Claude API
  const systemPrompt = `Bạn là chuyên gia tư vấn pháp lý và kỹ thuật về phòng cháy chữa cháy (PCCC) của công ty VIETSAFE E&C.
Nhiệm vụ: Trả lời câu hỏi dựa trên các tiêu chuẩn, quy chuẩn và văn bản pháp luật được cung cấp.

Quy tắc trả lời:
1. Chỉ trả lời dựa trên tài liệu được cung cấp, không suy đoán
2. Luôn trích dẫn rõ nguồn (tên văn bản, số điều/mục)
3. Nếu thông tin không có trong tài liệu, nói rõ "Không tìm thấy quy định liên quan trong hệ thống"
4. Dùng tiếng Việt, ngắn gọn, chính xác
5. Với yêu cầu kỹ thuật số liệu: trích dẫn chính xác con số từ văn bản

Tài liệu tham chiếu:
${context || 'Không tìm thấy tài liệu liên quan.'}`

  const messages = [
    ...history.slice(-6).map((m: any) => ({ role: m.role, content: m.content })),
    { role: 'user', content: question }
  ]

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    }),
  })
  
  const data = await response.json()
  if (!response.ok) {
    return NextResponse.json({ error: data.error?.message || 'API error' }, { status: 500 })
  }
  
  const answer = data.content[0].text
  const inputTokens = data.usage.input_tokens
  const outputTokens = data.usage.output_tokens
  
  // Ghi usage
  const newUsage = await addUsage(userId, inputTokens, outputTokens)
  
  // Lưu vào lịch sử chat
  const redis = getRedis()
  const month = getVNMonth()
  const msgId = `msg_${Date.now()}`
  const userMsg: ChatMessage = {
    id: `${msgId}_q`, role: 'user', content: question,
    timestamp: new Date().toISOString(),
  }
  const assistantMsg: ChatMessage = {
    id: `${msgId}_a`, role: 'assistant', content: answer,
    sources: searchResults,
    timestamp: new Date().toISOString(),
    tokens_used: inputTokens + outputTokens,
    cost_usd: newUsage.cost_usd,
  }
  
  await redis.lpush(keys.chat(userId, month), 
    JSON.stringify(userMsg), 
    JSON.stringify(assistantMsg)
  )
  // Giữ tối đa 500 messages/tháng/user
  await redis.ltrim(keys.chat(userId, month), 0, 499)
  
  return NextResponse.json({
    answer,
    sources: searchResults,
    usage: newUsage,
    warnings: warningChunks.length > 0 
      ? `⚠️ ${warningChunks.length} điều khoản trong kết quả đã được sửa đổi`
      : null,
  })
}

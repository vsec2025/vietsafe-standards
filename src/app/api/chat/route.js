import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { searchDocuments } from '@/lib/search'
import { getChatHistory, saveChatMessage } from '@/lib/redis'

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const { message, history } = await request.json()
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Tin nhắn không hợp lệ' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey || apiKey === 'placeholder') {
      return NextResponse.json({ error: 'Chưa cấu hình API key' }, { status: 500 })
    }

    // RAG: search relevant chunks
    const searchResults = await searchDocuments(message, 5)
    // Filter out superseded chunks for AI context
    const activeResults = searchResults.filter(r => !r._superseded)
    const context = activeResults
      .map(r => {
        const doc = r.loai === 'LUAT' ? (r.van_ban || 'Luật PCCC') 
          : r.loai === 'QCVN' ? 'QCVN 06:2022/BXD' 
          : r.loai === 'TCVN' ? 'TCVN 7336:2021' : 'N/A'
        const section = [r.phan, r.don_vi, r.tieu_de].filter(Boolean).join(' - ')
        return `[${doc} | ${section}]\n${r.content || r.text || ''}`
      })
      .join('\n\n---\n\n')

    const systemPrompt = `Bạn là trợ lý chuyên về tiêu chuẩn PCCC (phòng cháy chữa cháy) Việt Nam của Công ty VIETSAFE E&C.
Trả lời bằng tiếng Việt, chính xác, trích dẫn điều khoản cụ thể.
Sử dụng Markdown để format: dùng bảng khi so sánh dữ liệu, heading cho các phần, bold cho từ khóa quan trọng, bullet list cho liệt kê.
Nếu không tìm thấy thông tin, nói rõ và gợi ý hướng tra cứu.

NGỮ CẢNH TỪ CƠ SỞ DỮ LIỆU PCCC:
${context || '(Không tìm thấy văn bản liên quan)'}`

    const messages = [
      ...(history || []).slice(-10),
      { role: 'user', content: message }
    ]

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages
      })
    })

    if (!response.ok) {
      const errData = await response.text()
      console.error('Anthropic API error:', errData)
      return NextResponse.json({ error: 'Lỗi gọi AI' }, { status: 502 })
    }

    const data = await response.json()
    const reply = data.content?.[0]?.text || 'Không có phản hồi'

    // Save chat history
    const month = new Date().toISOString().slice(0, 7) // YYYY-MM
    try {
      const existing = await getChatHistory(session.user.email, month)
      const updated = [
        ...existing,
        { role: 'user', content: message, timestamp: new Date().toISOString() },
        { role: 'assistant', content: reply, timestamp: new Date().toISOString() }
      ]
      // Keep last 200 messages per month
      await saveChatMessage(session.user.email, month, updated.slice(-200))
    } catch (e) {
      console.error('Chat history save error:', e)
    }

    return NextResponse.json({
      reply,
      sources: searchResults.map(r => {
        const doc = r.loai === 'LUAT' ? (r.van_ban || 'Luật PCCC')
          : r.loai === 'QCVN' ? 'QCVN 06:2022/BXD'
          : r.loai === 'TCVN' ? 'TCVN 7336:2021' : r.loai
        const section = [r.don_vi, r.tieu_de].filter(Boolean).join(' — ')
        return { label: `${doc} | ${section}` }
      })
    })
  } catch (err) {
    console.error('Chat error:', err)
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 })
  }
}

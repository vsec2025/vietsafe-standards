import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { hybridSearch } from '@/lib/hybrid-search'
import { logQuery, getUserProfile, upsertUserProfile, incrementTokenUsage } from '@/lib/supabase'

const MODEL_DEFAULT = process.env.VSEC_DEFAULT_MODEL ?? 'claude-haiku-4-5-20251001'
const MODEL_COMPARE = process.env.VSEC_COMPARE_MODEL ?? 'claude-sonnet-5'

const SYSTEM_BASE = `Bạn là trợ lý chuyên về tiêu chuẩn PCCC (phòng cháy chữa cháy) của Công ty VIETSAFE E&C.
Trả lời bằng ngôn ngữ của câu hỏi. Dùng Markdown: bảng khi so sánh, heading cho các phần, bold từ khóa quan trọng.

Quy tắc bắt buộc:
1. Chỉ dùng thông tin từ NGỮ CẢNH được cung cấp. Không suy diễn ngoài phạm vi.
2. Mỗi luận điểm phải kèm trích dẫn [TÊN VĂN BẢN, Điều/Mục X.X].
3. Nếu không đủ thông tin, nói rõ: "Không tìm thấy quy định cụ thể trong corpus hiện có."
4. Đặt dòng cuối: HAS_BASIS: true (nếu có ít nhất 1 trích dẫn cụ thể) hoặc HAS_BASIS: false.`

const SYSTEM_COMPARE = `${SYSTEM_BASE}

Chế độ đối chiếu Việt–Quốc tế: sau khi trình bày quy định Việt Nam, so sánh với tiêu chuẩn quốc tế (NFPA, ISO, EN) nếu có trong ngữ cảnh.`

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey || apiKey === 'placeholder') {
      return NextResponse.json({ error: 'Chưa cấu hình API key' }, { status: 500 })
    }

    const { message, history, mode = 'vn_only' } = await request.json()
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Tin nhắn không hợp lệ' }, { status: 400 })
    }

    // Kiểm tra token quota (nếu Supabase được cấu hình)
    const profile = await getUserProfile(session.user.email)
    if (profile && profile.token_used >= profile.token_quota) {
      return NextResponse.json(
        { error: 'Đã đạt hạn mức token tháng này. Liên hệ admin để nâng hạn mức.' },
        { status: 429 }
      )
    }
    if (!profile) {
      upsertUserProfile(session.user.email, session.user.name).catch(() => {})
    }

    const startTime = Date.now()
    const topK = parseInt(process.env.VSEC_TOP_K ?? '6', 10)
    const chunks = await hybridSearch(message, { topK, mode })
    const activeChunks = chunks.filter((r) => !r._superseded)

    const context = activeChunks
      .map((r, i) => {
        // Dùng đúng metadata của chunk. TUYỆT ĐỐI không suy đoán số hiệu:
        // gán mặc định (vd. mọi chunk QCVN -> "QCVN 06:2022/BXD") sẽ tạo ra
        // trích dẫn sai — nguy hiểm hơn là không có trích dẫn.
        const docName =
          r.van_ban || r.so_hieu || `${r.loai || 'Văn bản'} (chưa xác định số hiệu)`
        const section = [r.phan, r.don_vi, r.tieu_de].filter(Boolean).join(' — ')
        return `[${i + 1}] ${docName} | ${section}\n${r.content || r.text || ''}`
      })
      .join('\n\n---\n\n')

    const model = mode === 'intl_compare' ? MODEL_COMPARE : MODEL_DEFAULT
    const systemPrompt =
      (mode === 'intl_compare' ? SYSTEM_COMPARE : SYSTEM_BASE) +
      `\n\nNGỮ CẢNH:\n${context || '(Không tìm thấy văn bản liên quan)'}`

    const messages = [...(history || []).slice(-10), { role: 'user', content: message }]

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: 1500, system: systemPrompt, messages }),
    })

    if (!aiRes.ok) {
      console.error('Anthropic API error:', await aiRes.text())
      return NextResponse.json({ error: 'Lỗi gọi AI' }, { status: 502 })
    }

    const aiData = await aiRes.json()
    const rawReply = aiData.content?.[0]?.text || ''
    // Chỉ công nhận "có cơ sở pháp lý" khi ngữ cảnh thực sự có văn bản xác định
    // được danh tính — tránh gắn huy hiệu cho câu trả lời dựa trên chunk khuyết
    // metadata (người dùng sẽ tin vào một trích dẫn không kiểm chứng được).
    const hasIdentifiedSource = activeChunks.some((r) => r.van_ban || r.so_hieu)
    const has_basis = /HAS_BASIS:\s*true/i.test(rawReply) && hasIdentifiedSource
    const reply = rawReply.replace(/HAS_BASIS:\s*(true|false)/i, '').trim()

    const latency_ms = Date.now() - startTime
    const inputTokens = aiData.usage?.input_tokens ?? 0
    const outputTokens = aiData.usage?.output_tokens ?? 0

    const citations = activeChunks.map((r) => ({
      id: r.id,
      label: [r.van_ban || r.so_hieu || r.loai, r.don_vi, r.tieu_de].filter(Boolean).join(' — '),
      score: r.score,
    }))

    const [logId] = await Promise.all([
      logQuery({
        user_email: session.user.email,
        query_text: message,
        mode,
        answer_text: reply,
        citations,
        has_basis,
        model_used: model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        latency_ms,
      }).catch(() => null),
      incrementTokenUsage(session.user.email, inputTokens, outputTokens).catch(() => {}),
    ])

    return NextResponse.json({
      reply,
      has_basis,
      model_used: model,
      sources: citations,
      token_usage: { input: inputTokens, output: outputTokens },
      log_id: logId,
    })
  } catch (err) {
    console.error('Chat error:', err)
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 })
  }
}

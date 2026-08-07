import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { multiHybridSearch } from '@/lib/hybrid-search'
import { expandQuery } from '@/lib/query-expand'
import { logQuery, getDailyUsage, upsertUserProfile, incrementTokenUsage } from '@/lib/supabase'
import { formatVnd, costVnd } from '@/lib/pricing'
import { callClaude } from '@/lib/claude'
import { anchorOf } from '@/lib/documents'

const MODEL_DEFAULT = process.env.VSEC_DEFAULT_MODEL ?? 'claude-sonnet-5'
const MODEL_COMPARE = process.env.VSEC_COMPARE_MODEL ?? 'claude-sonnet-5'

// Chế độ đối chiếu Việt–quốc tế tạm tắt: corpus hiện chỉ có văn bản Việt Nam
// (Luật 55, QCVN 06, TCVN 7336, NQ 66.18) — chưa có NFPA/ISO/EN để so sánh,
// nên chế độ này sẽ tạo ra đối chiếu không có căn cứ.
// Bật lại: đặt biến môi trường VSEC_ENABLE_INTL_COMPARE=1 và bỏ comment mục
// tương ứng trong MODES ở src/components/ChatPanel.js
const INTL_COMPARE_ENABLED = process.env.VSEC_ENABLE_INTL_COMPARE === '1'

const SYSTEM_BASE = `Bạn là kỹ sư tư vấn PCCC của Công ty VIETSAFE E&C, hỗ trợ đồng nghiệp tra cứu và áp dụng quy chuẩn.

Trả lời bằng ngôn ngữ của câu hỏi. Viết như một kỹ sư giàu kinh nghiệm hướng dẫn đồng nghiệp — đi thẳng vào cách làm, không chỉ đọc lại điều khoản.

## Nguồn và trích dẫn (bắt buộc)
- CHỈ dùng thông tin trong NGỮ CẢNH. Không bổ sung kiến thức ngoài, không suy đoán con số.
- Mỗi khẳng định có tính quy phạm phải gắn số nguồn ngay sau câu, dạng [1], [2] — đúng số thứ tự của khối trong NGỮ CẢNH. Cần thì gắn nhiều: [1][3].
- Nêu số hiệu văn bản và điều/mục khi dẫn, ví dụ: "theo QCVN 06:2022/BXD, mục 3.4.1 [2]".
- Nếu ngữ cảnh không đủ, nói thẳng phần nào thiếu: "Ngữ cảnh hiện có không quy định về X." Không lấp bằng suy đoán.
- KHÔNG bịa số hiệu, số điều, hay giá trị. Thiếu thì nói thiếu.

## Cách trình bày theo loại câu hỏi
**Câu hỏi quy trình / cách tính / cách thiết kế** — trả lời dạng quy trình kỹ thuật:
1. Mở đầu: nêu văn bản và phiên bản áp dụng, kèm những thông số dự án còn cần làm rõ (loại công trình, có sprinkler hay không, số tầng...) vì chúng đổi kết quả.
2. Các bước đánh số, mỗi bước nêu rõ phải xác định gì và tra ở đâu.
3. **Công thức viết tường minh kèm đơn vị**, ví dụ: \`Bề rộng yêu cầu (mm) = Số người × hệ số (mm/người)\`.
4. Bảng Markdown khi cần lập số liệu theo tầng/khu vực/hạng mục.
5. Ví dụ tính minh hoạ nếu ngữ cảnh đủ dữ liệu.
6. Chốt lại: tóm tắt công thức và các mốc kiểm tra bắt buộc.

**Câu hỏi tra cứu** — trả lời trực tiếp, ngắn gọn, kèm trích dẫn; không dựng quy trình.

## Nguyên tắc kỹ thuật
- Giá trị nào có ngưỡng tối thiểu theo quy chuẩn thì phải nêu: kết quả tính được nhưng nhỏ hơn tối thiểu thì lấy giá trị tối thiểu.
- Nêu rõ điều kiện áp dụng và ngoại lệ nếu ngữ cảnh có.
- Giữ nguyên đơn vị của văn bản gốc; quy đổi thì ghi cả hai.
- Nêu giả định bạn đã dùng và khuyến nghị điểm cần người có thẩm quyền xác nhận.

## Dòng cuối
Kết thúc bằng đúng một dòng: HAS_BASIS: true (nếu có ít nhất một trích dẫn cụ thể) hoặc HAS_BASIS: false.`

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

    // Chặn ở server, không chỉ ẩn trên giao diện — client cũ hoặc gọi API
    // trực tiếp vẫn không dùng được chế độ đang tắt.
    if (mode === 'intl_compare' && !INTL_COMPARE_ENABLED) {
      return NextResponse.json(
        { error: 'Chế độ đối chiếu quốc tế đang tạm tắt. Vui lòng dùng chế độ Tiêu chuẩn VN.' },
        { status: 400 }
      )
    }

    // Hạn mức chi tiêu theo NGÀY (VND). Nếu Supabase không đọc được thì
    // usage.ok = false và ta cho đi tiếp — không khoá người dùng chỉ vì hệ
    // thống ghi log đang hỏng.
    const usage = await getDailyUsage(session.user.email)
    if (usage.blocked) {
      return NextResponse.json(
        {
          error: `Đã dùng hết hạn mức ${formatVnd(usage.budget)}/ngày. Hạn mức đặt lại vào 0h, hoặc liên hệ admin.`,
          usage: { spent: Math.round(usage.spent), budget: usage.budget },
        },
        { status: 429 }
      )
    }
    upsertUserProfile(session.user.email, session.user.name).catch(() => {})

    const startTime = Date.now()

    // topK=8 là con số từ thời chunk còn cả trang (~920 token). Sau khi cắt
    // theo điều khoản, chunk trung bình còn ~230 token, nên 8 chunk chỉ còn
    // ~1.800 token ngữ cảnh — quá ít để tổng hợp. 20 đưa về mức cũ.
    const topK = parseInt(process.env.VSEC_TOP_K ?? '20', 10)

    // Tách câu hỏi thành các truy vấn con rồi tìm riêng từng cái. Một câu hỏi
    // dạng quy trình cần nhiều mảnh khác nhau, mà nhúng một truy vấn chỉ kéo
    // về những đoạn na ná câu hỏi.
    const { queries, usage: expandUsage } = await expandQuery(message, apiKey)
    const chunks = await multiHybridSearch(queries, { topK, mode })
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

    let aiData, rawReply
    try {
      const out = await callClaude({
        apiKey,
        model,
        system: systemPrompt,
        messages,
        maxTokens: 8000, // trần chung cho thinking + câu trả lời
      })
      rawReply = out.text
      aiData = out.raw
    } catch (e) {
      return NextResponse.json({ error: 'Lỗi gọi AI' }, { status: 502 })
    }

    if (!rawReply) {
      return NextResponse.json(
        { error: 'AI không trả về nội dung. Vui lòng thử lại.' },
        { status: 502 }
      )
    }
    // Chỉ công nhận "có cơ sở pháp lý" khi ngữ cảnh thực sự có văn bản xác định
    // được danh tính — tránh gắn huy hiệu cho câu trả lời dựa trên chunk khuyết
    // metadata (người dùng sẽ tin vào một trích dẫn không kiểm chứng được).
    const hasIdentifiedSource = activeChunks.some((r) => r.van_ban || r.so_hieu)
    const has_basis = /HAS_BASIS:\s*true/i.test(rawReply) && hasIdentifiedSource
    const reply = rawReply.replace(/HAS_BASIS:\s*(true|false)/i, '').trim()

    const latency_ms = Date.now() - startTime

    // Gộp cả token của bước tách câu hỏi: nó cũng gọi Claude và cũng tính tiền,
    // bỏ qua thì hạn mức ngày đếm thiếu so với hoá đơn thật.
    const inputTokens = (aiData.usage?.input_tokens ?? 0) + expandUsage.input
    const outputTokens = (aiData.usage?.output_tokens ?? 0) + expandUsage.output

    // Kèm luôn nội dung điều khoản để giao diện mở ngay bên dưới câu trả lời,
    // không phải rời trang hay gọi thêm API. Cắt bớt để không phình payload —
    // muốn đọc trọn thì có liên kết sang trang đọc.
    const EXCERPT = 1400
    const citations = activeChunks.map((r) => {
      const full = r.content || r.text || ''
      return {
        id: r.id,
        doc_slug: r.doc_slug || '',
        anchor: anchorOf(r),
        don_vi: r.don_vi || '',
        van_ban: r.van_ban || r.so_hieu || r.loai || '',
        tieu_de: r.tieu_de || '',
        label: [r.van_ban || r.so_hieu || r.loai, r.don_vi, r.tieu_de].filter(Boolean).join(' — '),
        excerpt: full.slice(0, EXCERPT),
        truncated: full.length > EXCERPT,
        score: r.score,
      }
    })

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

    const costThisTurn = costVnd(model, inputTokens, outputTokens)

    return NextResponse.json({
      reply,
      has_basis,
      model_used: model,
      sources: citations,
      token_usage: { input: inputTokens, output: outputTokens },
      // Chi phí lượt này + hạn mức còn lại, để giao diện hiện cho người dùng
      cost_vnd: Math.round(costThisTurn),
      quota: usage.ok
        ? { spent: Math.round(usage.spent + costThisTurn), budget: usage.budget }
        : null,
      log_id: logId,
    })
  } catch (err) {
    console.error('Chat error:', err)
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'

const MODEL = process.env.VSEC_COMPARE_MODEL ?? 'claude-sonnet-4-6-20251101'

const SYSTEM_NEWSLETTER = `Bạn là biên tập viên bản tin kỹ thuật của Công ty VIETSAFE E&C — chuyên về PCCC.

Từ danh sách câu hỏi của kỹ sư trong tuần, hãy tạo bản tin Markdown gồm:

1. **TÓM TẮT TUẦN** — 2-3 câu về xu hướng câu hỏi
2. **TOP CHỦ ĐỀ** — nhóm các câu hỏi thành 3-5 chủ đề, mỗi chủ đề gồm:
   - Tiêu đề chủ đề (bold)
   - Số lượng câu hỏi
   - Câu hỏi tiêu biểu (1-2 câu)
   - Ghi chú ngắn về tiêu chuẩn liên quan
3. **ĐIỂM ĐÁNG CHÚ Ý** — câu hỏi nào được đánh giá 👎 nhiều nhất (cần cải thiện corpus)
4. **THỐNG KÊ** — bảng markdown: tổng câu hỏi, tỷ lệ có cơ sở pháp lý, chế độ phổ biến nhất

Viết bằng tiếng Việt, giọng chuyên nghiệp, ngắn gọn.`

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    if (!['admin', 'editor'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey || apiKey === 'placeholder') return NextResponse.json({ error: 'Chưa cấu hình API key' }, { status: 500 })

    const { searchParams } = new URL(request.url)
    const days = Math.min(30, Math.max(1, parseInt(searchParams.get('days') ?? '7', 10)))

    const sb = getSupabase()
    if (!sb) return NextResponse.json({ error: 'Supabase chưa cấu hình' }, { status: 500 })

    const since = new Date(Date.now() - days * 86400000).toISOString()
    const { data: logs, error } = await sb
      .from('query_logs')
      .select('query_text, mode, has_basis, feedback, latency_ms, model_used, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!logs?.length) return NextResponse.json({ newsletter: null, stats: null, message: 'Chưa có dữ liệu trong khoảng thời gian này.' })

    const stats = {
      total: logs.length,
      has_basis_pct: Math.round((logs.filter(l => l.has_basis).length / logs.length) * 100),
      thumbs_up: logs.filter(l => l.feedback === 1).length,
      thumbs_down: logs.filter(l => l.feedback === -1).length,
      avg_latency_ms: Math.round(logs.filter(l => l.latency_ms).reduce((a, b) => a + b.latency_ms, 0) / (logs.filter(l => l.latency_ms).length || 1)),
      by_mode: {
        vn_only: logs.filter(l => l.mode === 'vn_only').length,
        intl_compare: logs.filter(l => l.mode === 'intl_compare').length,
        project: logs.filter(l => l.mode === 'project').length,
      },
    }

    const questions = logs.map(l => `- [${l.mode}] ${l.query_text}${l.feedback === -1 ? ' 👎' : ''}`).join('\n')

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM_NEWSLETTER,
        messages: [{
          role: 'user',
          content: `Bản tin ${days} ngày qua (${since.slice(0,10)} → hôm nay).\n\nThống kê: ${JSON.stringify(stats)}\n\nDanh sách câu hỏi:\n${questions}`,
        }],
      }),
    })

    if (!aiRes.ok) return NextResponse.json({ error: 'Lỗi gọi AI' }, { status: 502 })
    const aiData = await aiRes.json()
    const newsletter = aiData.content?.[0]?.text ?? ''

    return NextResponse.json({ newsletter, stats, days, generated_at: new Date().toISOString() })
  } catch (err) {
    console.error('newsletter error:', err)
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 })
  }
}

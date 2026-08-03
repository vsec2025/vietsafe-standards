import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { hybridSearch } from '@/lib/hybrid-search'
import { logQuery, getUserProfile, incrementTokenUsage } from '@/lib/supabase'

const MODEL = process.env.VSEC_DEFAULT_MODEL ?? 'claude-sonnet-5'

const SYSTEM_BATCH = `Bạn là chuyên gia kiểm tra sự tuân thủ tiêu chuẩn PCCC Việt Nam của Công ty VIETSAFE E&C.

Nhiệm vụ: Đánh giá đoạn văn bản tài liệu dự án xem có tuân thủ các quy định PCCC hiện hành không.

Trả lời JSON theo đúng cấu trúc sau (không thêm text ngoài JSON):
{
  "status": "COMPLIANT" | "NON_COMPLIANT" | "NEEDS_REVIEW" | "NO_COVERAGE",
  "summary": "Tóm tắt 1-2 câu",
  "issues": [
    { "severity": "HIGH"|"MEDIUM"|"LOW", "description": "mô tả vấn đề", "regulation": "tên văn bản và điều khoản" }
  ],
  "recommendations": ["khuyến nghị 1", "khuyến nghị 2"],
  "has_basis": true | false
}

Quy tắc:
- COMPLIANT: tài liệu đúng với quy định tìm được
- NON_COMPLIANT: tài liệu vi phạm quy định rõ ràng
- NEEDS_REVIEW: cần xem xét thêm, có điểm chưa rõ
- NO_COVERAGE: không tìm thấy quy định liên quan trong corpus
- has_basis: true nếu có ít nhất 1 trích dẫn cụ thể`

function splitSections(text, maxChars = 800) {
  const lines = text.split('\n')
  const sections = []
  let current = []
  let charCount = 0

  for (const line of lines) {
    if ((line.startsWith('##') || line.startsWith('# ')) && charCount > 200) {
      if (current.length) sections.push(current.join('\n').trim())
      current = [line]
      charCount = line.length
    } else {
      current.push(line)
      charCount += line.length
      if (charCount >= maxChars) {
        sections.push(current.join('\n').trim())
        current = []
        charCount = 0
      }
    }
  }
  if (current.length) sections.push(current.join('\n').trim())
  return sections.filter(s => s.length > 50)
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey || apiKey === 'placeholder') return NextResponse.json({ error: 'Chưa cấu hình API key' }, { status: 500 })

    const profile = await getUserProfile(session.user.email)
    if (profile && profile.token_used >= profile.token_quota) {
      return NextResponse.json({ error: 'Đã đạt hạn mức token. Liên hệ admin.' }, { status: 429 })
    }

    const { text, filename = 'Tài liệu dự án' } = await request.json()
    if (!text?.trim()) return NextResponse.json({ error: 'Nội dung tài liệu trống' }, { status: 400 })

    const sections = splitSections(text)
    if (sections.length === 0) return NextResponse.json({ error: 'Không đọc được nội dung' }, { status: 400 })

    const MAX_SECTIONS = 20
    const toCheck = sections.slice(0, MAX_SECTIONS)

    const topK = parseInt(process.env.VSEC_TOP_K ?? '4', 10)
    let totalInput = 0, totalOutput = 0
    const results = []

    for (const section of toCheck) {
      const chunks = await hybridSearch(section, { topK, mode: 'project' })
      const context = chunks
        .map((r, i) => {
          const doc = r.van_ban || r.so_hieu || r.loai || 'N/A'
          const loc = [r.don_vi, r.tieu_de].filter(Boolean).join(' — ')
          return `[${i+1}] ${doc} | ${loc}\n${r.content || r.text || ''}`
        })
        .join('\n\n---\n\n')

      const prompt = `NGỮ CẢNH QUY ĐỊNH:\n${context || '(Không tìm thấy quy định liên quan)'}\n\nĐOẠN TÀI LIỆU DỰ ÁN:\n${section}`

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 600,
          system: SYSTEM_BATCH,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (!aiRes.ok) continue

      const aiData = await aiRes.json()
      totalInput += aiData.usage?.input_tokens ?? 0
      totalOutput += aiData.usage?.output_tokens ?? 0

      let parsed
      try {
        const raw = aiData.content?.[0]?.text || '{}'
        parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim())
      } catch {
        parsed = { status: 'NEEDS_REVIEW', summary: 'Không phân tích được', issues: [], recommendations: [], has_basis: false }
      }

      results.push({ section: section.slice(0, 200) + (section.length > 200 ? '...' : ''), ...parsed })
    }

    incrementTokenUsage(session.user.email, totalInput, totalOutput).catch(() => {})
    logQuery({
      user_email: session.user.email,
      query_text: `[BATCH] ${filename}`,
      mode: 'project',
      answer_text: JSON.stringify(results).slice(0, 2000),
      has_basis: results.some(r => r.has_basis),
      model_used: MODEL,
      input_tokens: totalInput,
      output_tokens: totalOutput,
    }).catch(() => {})

    const summary = {
      total: results.length,
      compliant: results.filter(r => r.status === 'COMPLIANT').length,
      non_compliant: results.filter(r => r.status === 'NON_COMPLIANT').length,
      needs_review: results.filter(r => r.status === 'NEEDS_REVIEW').length,
      no_coverage: results.filter(r => r.status === 'NO_COVERAGE').length,
      high_issues: results.flatMap(r => r.issues || []).filter(i => i.severity === 'HIGH').length,
    }

    return NextResponse.json({ filename, summary, results, token_usage: { input: totalInput, output: totalOutput } })
  } catch (err) {
    console.error('batch-check error:', err)
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 })
  }
}

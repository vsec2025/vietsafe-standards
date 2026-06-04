import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getRedis } from '@/lib/redis'
import { loadSearchData } from '@/lib/search'

// POST: trigger conflict review for new document
// GET: get pending conflicts
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || !['admin', 'editor'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
    }

    const { newDocFilename } = await request.json()
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'Chưa cấu hình ANTHROPIC_API_KEY' }, { status: 500 })

    // Load all chunks
    const { chunks } = await loadSearchData()
    if (!chunks?.length) return NextResponse.json({ error: 'Chưa có dữ liệu chunks' }, { status: 400 })

    // Separate new vs old chunks
    const newChunks = chunks.filter(c => {
      const src = (c.source || c.id || '').toLowerCase()
      return newDocFilename ? src.includes(newDocFilename.toLowerCase().replace('.md', '')) : false
    })
    const oldChunks = chunks.filter(c => {
      const src = (c.source || c.id || '').toLowerCase()
      return !newDocFilename || !src.includes(newDocFilename.toLowerCase().replace('.md', ''))
    })

    if (newChunks.length === 0) {
      return NextResponse.json({ error: 'Không tìm thấy chunks của văn bản mới', conflicts: [] })
    }

    // Batch new chunks into groups for efficient API calls
    const newSummary = newChunks.slice(0, 20).map(c => 
      `[${c.id}] ${(c.don_vi || '')} ${(c.tieu_de || '')}: ${(c.content || '').slice(0, 200)}`
    ).join('\n---\n')

    const oldSummary = oldChunks.slice(0, 40).map(c =>
      `[${c.id}] ${(c.van_ban || c.loai || '')} | ${(c.don_vi || '')} ${(c.tieu_de || '')}: ${(c.content || '').slice(0, 150)}`
    ).join('\n---\n')

    // Ask Haiku to find conflicts
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: `Bạn là chuyên gia pháp luật PCCC Việt Nam. Nhiệm vụ: so sánh văn bản MỚI với các văn bản CŨ, tìm các điều khoản CŨ bị thay thế, sửa đổi, hoặc bãi bỏ bởi văn bản mới.

Trả về CHÍNH XÁC dạng JSON array, không có text khác:
[
  {
    "old_chunk_id": "id của chunk cũ bị ảnh hưởng",
    "old_label": "tên văn bản + điều khoản cũ",
    "new_chunk_id": "id của chunk mới thay thế",
    "new_label": "tên văn bản + điều khoản mới",
    "type": "superseded hoặc amended",
    "reason": "giải thích ngắn gọn"
  }
]

Nếu KHÔNG có xung đột, trả về: []
CHỈ trả về JSON, không thêm text hay markdown.`,
        messages: [{
          role: 'user',
          content: `VĂN BẢN MỚI:\n${newSummary}\n\n---\n\nVĂN BẢN CŨ:\n${oldSummary}\n\nTìm các điều khoản CŨ bị thay thế hoặc sửa đổi bởi văn bản MỚI.`
        }]
      })
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Lỗi gọi AI' }, { status: 502 })
    }

    const aiData = await response.json()
    const rawText = aiData.content?.[0]?.text || '[]'
    
    let conflicts = []
    try {
      const cleaned = rawText.replace(/```json|```/g, '').trim()
      conflicts = JSON.parse(cleaned)
      if (!Array.isArray(conflicts)) conflicts = []
    } catch (e) {
      console.error('Failed to parse AI response:', rawText)
      conflicts = []
    }

    // Save pending conflicts to Redis
    const r = getRedis()
    if (r && conflicts.length > 0) {
      const pending = conflicts.map((c, i) => ({
        ...c,
        id: `conflict_${Date.now()}_${i}`,
        status: 'pending', // pending | accepted | rejected
        created: new Date().toISOString(),
        newDocFilename
      }))
      const existing = await r.get('conflicts:pending') || '[]'
      const all = [...(typeof existing === 'string' ? JSON.parse(existing) : existing), ...pending]
      await r.set('conflicts:pending', JSON.stringify(all))
    }

    return NextResponse.json({ 
      conflicts,
      total: conflicts.length,
      message: conflicts.length > 0 
        ? `Phát hiện ${conflicts.length} xung đột cần xử lý` 
        : 'Không phát hiện xung đột'
    })
  } catch (err) {
    console.error('Review error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET: retrieve pending conflicts
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })

    const r = getRedis()
    if (!r) return NextResponse.json({ conflicts: [] })

    const data = await r.get('conflicts:pending') || '[]'
    const conflicts = typeof data === 'string' ? JSON.parse(data) : data
    return NextResponse.json({ conflicts })
  } catch (err) {
    return NextResponse.json({ conflicts: [] })
  }
}

// PATCH: resolve a conflict (accept/reject)
export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || !['admin', 'editor'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Không có quyền' }, { status: 403 })
    }

    const { conflictId, action } = await request.json() // action: 'accept' | 'reject'
    const r = getRedis()
    if (!r) return NextResponse.json({ error: 'Redis unavailable' }, { status: 500 })

    const data = await r.get('conflicts:pending') || '[]'
    const conflicts = typeof data === 'string' ? JSON.parse(data) : data
    const idx = conflicts.findIndex(c => c.id === conflictId)
    if (idx === -1) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 })

    const conflict = conflicts[idx]
    conflict.status = action === 'accept' ? 'accepted' : 'rejected'
    conflict.resolvedBy = session.user.email
    conflict.resolvedAt = new Date().toISOString()

    // If accepted, mark old chunk as superseded in chunk_status
    if (action === 'accept') {
      const statusData = await r.get('chunks:status') || '{}'
      const chunkStatus = typeof statusData === 'string' ? JSON.parse(statusData) : statusData
      chunkStatus[conflict.old_chunk_id] = {
        status: conflict.type, // 'superseded' or 'amended'
        superseded_by: conflict.new_label,
        reason: conflict.reason,
        date: new Date().toISOString()
      }
      await r.set('chunks:status', JSON.stringify(chunkStatus))
    }

    // Save log to Redis (will be synced to GitHub later)
    const logData = await r.get('review:log') || '[]'
    const log = typeof logData === 'string' ? JSON.parse(logData) : logData
    log.push({
      date: new Date().toISOString(),
      conflict,
      action,
      by: session.user.email
    })
    await r.set('review:log', JSON.stringify(log))

    // Update conflicts list
    conflicts[idx] = conflict
    await r.set('conflicts:pending', JSON.stringify(conflicts))

    return NextResponse.json({ success: true, conflict })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const token = process.env.GITHUB_TOKEN
    const repo = process.env.GITHUB_REPO || 'vsec2025/vietsafe-standards'
    if (!token) {
      return NextResponse.json({ error: 'Chưa cấu hình' }, { status: 500 })
    }

    // Get latest workflow runs
    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/runs?per_page=3`,
      { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' } }
    )
    
    if (!res.ok) {
      return NextResponse.json({ error: 'Không lấy được trạng thái' }, { status: 502 })
    }

    const data = await res.json()
    const runs = (data.workflow_runs || []).map(r => ({
      id: r.id,
      status: r.status, // queued, in_progress, completed
      conclusion: r.conclusion, // success, failure, null
      name: r.name,
      commit: r.head_commit?.message?.slice(0, 80),
      started: r.created_at,
      updated: r.updated_at,
      url: r.html_url
    }))

    return NextResponse.json({ runs })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

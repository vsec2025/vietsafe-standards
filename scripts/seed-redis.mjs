#!/usr/bin/env node
// VSEC — Seed Redis: tạo users mặc định + danh sách documents trong Upstash Redis
// Tương đương route POST /api/seed nhưng chạy trực tiếp từ CLI (không cần server).
// Yêu cầu: KV_REST_API_URL, KV_REST_API_TOKEN trong .env.local
//
// Chạy: npm run seed   (hoặc: node scripts/seed-redis.mjs)

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Redis } from '@upstash/redis'
import bcrypt from 'bcryptjs' // CJS module — named import không hoạt động dưới Node ESM
const { hash } = bcrypt

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, '..')

// Load .env.local (không cần dotenv)
try {
  readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n').forEach((line) => {
    const eq = line.indexOf('=')
    if (eq > 0 && !line.startsWith('#')) {
      const k = line.slice(0, eq).trim()
      const v = line.slice(eq + 1).trim()
      if (k) process.env[k] = v
    }
  })
} catch {
  /* dùng env từ shell */
}

const URL = process.env.KV_REST_API_URL
const TOKEN = process.env.KV_REST_API_TOKEN

if (!URL || !TOKEN || URL === 'placeholder') {
  console.error('❌  KV_REST_API_URL / KV_REST_API_TOKEN chưa được set trong .env.local')
  process.exit(1)
}

const redis = new Redis({ url: URL, token: TOKEN })

// ── Users mặc định (role: viewer / editor / admin — khớp với src/lib/auth.js) ──
const USERS = [
  { email: 'namnt@vnsec.com.vn', name: 'Admin VIETSAFE', password: 'CongtyVSEC@2025', role: 'admin' },
  { email: 'editor@vnsec.com.vn', name: 'Editor VIETSAFE', password: 'Editor@2025', role: 'editor' },
  { email: 'viewer@vnsec.com.vn', name: 'Viewer VIETSAFE', password: 'Viewer@2025', role: 'viewer' },
]

const DOCUMENTS = [
  {
    id: 'doc_luat55',
    title: 'Luật Phòng cháy, chữa cháy và Cứu nạn, cứu hộ (Luật số 55/2024/QH15)',
    filename: 'luat-55-2024.md',
    status: 'active',
    uploadedBy: 'namnt@vnsec.com.vn',
    uploadedAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'doc_qcvn06',
    title: 'QCVN 06:2022/BXD — Quy chuẩn kỹ thuật quốc gia về An toàn cháy cho nhà và công trình',
    filename: 'qcvn-06-2022.md',
    status: 'active',
    uploadedBy: 'namnt@vnsec.com.vn',
    uploadedAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'doc_tcvn7336',
    title: 'TCVN 7336:2021 — Phòng cháy chữa cháy - Hệ thống sprinkler tự động - Yêu cầu thiết kế và lắp đặt',
    filename: 'tcvn-7336-2021.md',
    status: 'active',
    uploadedBy: 'namnt@vnsec.com.vn',
    uploadedAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
]

async function main() {
  console.log('\n🌱 VSEC — Seed Redis\n')

  for (const u of USERS) {
    const password = await hash(u.password, 12)
    await redis.set(
      `user:${u.email}`,
      JSON.stringify({
        email: u.email,
        name: u.name,
        password,
        role: u.role,
        createdAt: new Date().toISOString(),
      })
    )
    console.log(`   ✅  user: ${u.email} (${u.role})`)
  }

  await redis.set('documents:list', JSON.stringify(DOCUMENTS))
  console.log(`   ✅  documents:list (${DOCUMENTS.length} tài liệu)`)

  console.log(`\n✅  Hoàn thành: ${USERS.length} users + ${DOCUMENTS.length} documents\n`)
}

main().catch((e) => {
  console.error('\n❌', e.message)
  process.exit(1)
})

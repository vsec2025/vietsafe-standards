#!/usr/bin/env node
// VSEC — Bootstrap Redis: tạo tài khoản admin đầu tiên + danh sách documents.
//
// Đăng nhập chính của hệ thống là Google (Gmail). Script này chỉ dùng để "mồi"
// tài khoản admin đầu tiên vào allowlist — sau đó admin tự thêm các email khác
// qua trang Quản trị → Người dùng.
//
// Yêu cầu: KV_REST_API_URL, KV_REST_API_TOKEN trong .env.local
//
// Chạy:
//   ADMIN_EMAIL=ten.ban@gmail.com npm run seed
//
// Tuỳ chọn (chỉ khi cần đăng nhập mật khẩu dự phòng):
//   ADMIN_EMAIL=... ADMIN_PASSWORD='mat-khau-manh' npm run seed

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
      if (k && !process.env[k]) process.env[k] = v
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

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''

if (!ADMIN_EMAIL) {
  console.error('❌  Thiếu ADMIN_EMAIL.\n')
  console.error('    Chạy:  ADMIN_EMAIL=ten.ban@gmail.com npm run seed\n')
  process.exit(1)
}

const redis = new Redis({ url: URL, token: TOKEN })

const DOCUMENTS = [
  {
    id: 'doc_luat55',
    title: 'Luật Phòng cháy, chữa cháy và Cứu nạn, cứu hộ (Luật số 55/2024/QH15)',
    filename: 'luat-55-2024.md',
    status: 'active',
    uploadedBy: ADMIN_EMAIL,
    uploadedAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'doc_qcvn06',
    title: 'QCVN 06:2022/BXD — Quy chuẩn kỹ thuật quốc gia về An toàn cháy cho nhà và công trình',
    filename: 'qcvn-06-2022.md',
    status: 'active',
    uploadedBy: ADMIN_EMAIL,
    uploadedAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'doc_tcvn7336',
    title: 'TCVN 7336:2021 — Phòng cháy chữa cháy - Hệ thống sprinkler tự động - Yêu cầu thiết kế và lắp đặt',
    filename: 'tcvn-7336-2021.md',
    status: 'active',
    uploadedBy: ADMIN_EMAIL,
    uploadedAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
]

async function main() {
  console.log('\n🌱 VSEC — Bootstrap Redis\n')

  const existing = await redis.get(`user:${ADMIN_EMAIL}`)
  if (existing) {
    console.log(`   ℹ️   user:${ADMIN_EMAIL} đã tồn tại — giữ nguyên, không ghi đè.`)
  } else {
    const record = {
      email: ADMIN_EMAIL,
      name: 'Admin VIETSAFE',
      role: 'admin',
      createdAt: new Date().toISOString(),
    }
    if (ADMIN_PASSWORD) {
      record.password = await hash(ADMIN_PASSWORD, 12)
      console.log('   ✅  admin có cả đăng nhập Google và mật khẩu')
    } else {
      console.log('   ✅  admin chỉ đăng nhập bằng Google (khuyến nghị)')
    }
    await redis.set(`user:${ADMIN_EMAIL}`, JSON.stringify(record))
    console.log(`   ✅  user:${ADMIN_EMAIL} (admin)`)
  }

  const docs = await redis.get('documents:list')
  if (docs) {
    console.log('   ℹ️   documents:list đã tồn tại — giữ nguyên.')
  } else {
    await redis.set('documents:list', JSON.stringify(DOCUMENTS))
    console.log(`   ✅  documents:list (${DOCUMENTS.length} tài liệu)`)
  }

  console.log('\n✅  Hoàn thành.')
  console.log('    Bước tiếp: đăng nhập bằng Google với email trên, rồi vào')
  console.log('    Quản trị → Người dùng để cấp quyền cho các email khác.\n')
}

main().catch((e) => {
  console.error('\n❌', e.message)
  process.exit(1)
})

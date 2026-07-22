#!/usr/bin/env node
// VSEC-AI M0 Setup Script
// Chạy một lần để khởi tạo Supabase schema + kiểm tra kết nối
// Yêu cầu: Node 18+, file .env.local đã điền đủ
//
// Cách chạy:
//   cp .env.example .env.local   # điền các keys
//   node scripts/setup-m0.mjs

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

// Load .env.local thủ công (không cần dotenv)
const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dir, '..', '.env.local')
try {
  readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=')
    if (k && !k.startsWith('#')) process.env[k.trim()] = v.join('=').trim()
  })
} catch { console.warn('⚠️  .env.local không tìm thấy — dùng env từ shell') }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || SUPABASE_URL === 'placeholder') {
  console.error('❌  NEXT_PUBLIC_SUPABASE_URL chưa được set trong .env.local')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Schema SQL ─────────────────────────────────────────────────────────────
const SCHEMA_SQL = `
-- VSEC-AI Schema Rev 0
create table if not exists user_profiles (
  id          bigserial primary key,
  email       text unique not null,
  full_name   text,
  role        text default 'viewer' check (role in ('viewer', 'engineer', 'admin')),
  token_quota int default 50000,
  token_used  int default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists query_logs (
  id            bigserial primary key,
  user_email    text not null,
  query_text    text not null,
  mode          text default 'vn_only',
  answer_text   text,
  citations     jsonb,
  has_basis     boolean,
  model_used    text,
  input_tokens  int default 0,
  output_tokens int default 0,
  latency_ms    int,
  feedback      smallint,
  feedback_note text,
  created_at    timestamptz default now()
);

create index if not exists query_logs_user_email_idx on query_logs(user_email);
create index if not exists query_logs_created_at_idx on query_logs(created_at desc);

create or replace function increment_token_used(p_email text, p_tokens int)
returns void language plpgsql as $$
begin
  insert into user_profiles (email, token_used)
  values (p_email, p_tokens)
  on conflict (email) do update
    set token_used = user_profiles.token_used + p_tokens,
        updated_at = now();
end;
$$;
`

async function runSQL(sql) {
  // Supabase JS client không có raw SQL execute trực tiếp trên free tier.
  // Dùng pg REST endpoint qua service key.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ sql }),
  })
  if (!res.ok) {
    // exec_sql function chưa tồn tại — dùng pg extension thay thế
    return { error: await res.text() }
  }
  return { ok: true }
}

async function checkUpstashVector() {
  const url = process.env.UPSTASH_VECTOR_REST_URL
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN
  if (!url || url === 'placeholder') return '⚠️  Chưa cấu hình'
  try {
    const res = await fetch(`${url}/info`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const d = await res.json()
    return res.ok ? `✅  ${d.vectorCount ?? 0} vectors, dim=${d.dimension ?? '?'}` : `❌  ${JSON.stringify(d)}`
  } catch (e) { return `❌  ${e.message}` }
}

async function checkGoogleEmbedding() {
  const key = process.env.GOOGLE_API_KEY
  if (!key || key === 'placeholder') return '⚠️  Chưa cấu hình'
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'models/gemini-embedding-001', content: { parts: [{ text: 'test' }] } }) }
    )
    const d = await res.json()
    const dims = d.embedding?.values?.length
    return res.ok ? `✅  ${dims ?? 3072} dims OK` : `❌  ${d.error?.message}`
  } catch (e) { return `❌  ${e.message}` }
}

async function checkAnthropicKey() {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || key === 'placeholder') return '⚠️  Chưa cấu hình'
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    })
    return res.ok ? '✅  Key hợp lệ' : `❌  HTTP ${res.status}`
  } catch (e) { return `❌  ${e.message}` }
}

async function main() {
  console.log('\n🚀 VSEC-AI M0 Setup\n')

  // 1. Supabase schema
  console.log('1️⃣  Tạo Supabase schema...')
  console.log('   ⚠️  Supabase JS không hỗ trợ raw DDL qua REST trên free tier.')
  console.log('   👉  Paste nội dung schema/supabase.sql vào:')
  console.log(`      ${SUPABASE_URL.replace('https://','').split('.')[0]} → SQL Editor → Run\n`)

  // Thử kiểm tra bảng đã tồn tại chưa
  const { data, error } = await sb.from('user_profiles').select('count').limit(1)
  if (error && error.code === '42P01') {
    console.log('   ⏳  Bảng user_profiles chưa tồn tại — cần chạy SQL trước.')
  } else if (!error) {
    console.log('   ✅  Bảng user_profiles đã tồn tại.')
  }

  // 2. Kiểm tra các services
  console.log('2️⃣  Kiểm tra kết nối các services...')
  const [vecStatus, embedStatus, claudeStatus] = await Promise.all([
    checkUpstashVector(),
    checkGoogleEmbedding(),
    checkAnthropicKey(),
  ])
  console.log(`   Upstash Vector:     ${vecStatus}`)
  console.log(`   Google Embedding:   ${embedStatus}`)
  console.log(`   Anthropic Claude:   ${claudeStatus}`)

  // 3. Summary
  console.log('\n📋 Các bước còn lại:')
  if (vecStatus.startsWith('⚠️')) console.log('   - Tạo Upstash Vector index (dim=3072, cosine) qua Vercel Marketplace')
  if (embedStatus.startsWith('⚠️')) console.log('   - Thêm GOOGLE_API_KEY vào .env.local')
  if (claudeStatus.startsWith('⚠️')) console.log('   - Thêm ANTHROPIC_API_KEY vào .env.local')
  console.log('   - Chạy schema/supabase.sql trong Supabase SQL Editor')
  console.log('   - Sau khi có đủ keys: node scripts/ingest-corpus.mjs\n')
}

main().catch(e => { console.error(e); process.exit(1) })

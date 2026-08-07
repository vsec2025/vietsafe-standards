-- VSEC-AI Supabase Schema — Rev 1
-- Chạy trong Supabase > SQL Editor

-- ── USER PROFILES ─────────────────────────────────────────────────────────
create table if not exists user_profiles (
  id          bigserial primary key,
  email       text unique not null,
  full_name   text,
  token_quota int default 50000,
  token_used  int default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── QUERY LOGS ────────────────────────────────────────────────────────────
create table if not exists query_logs (
  id            bigserial primary key,
  user_email    text not null,
  query_text    text not null,
  mode          text default 'vn_only',   -- 'vn_only' | 'intl_compare' | 'project'
  answer_text   text,
  citations     jsonb,
  has_basis     boolean,
  model_used    text,
  input_tokens  int default 0,
  output_tokens int default 0,
  latency_ms    int,
  feedback      smallint,                 -- 1 = 👍, -1 = 👎, null = chưa
  feedback_note text,
  created_at    timestamptz default now()
);

create index if not exists query_logs_user_email_idx on query_logs(user_email);
create index if not exists query_logs_created_at_idx on query_logs(created_at desc);

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table user_profiles enable row level security;
alter table query_logs enable row level security;

-- Service role key (dùng trong API routes) bypass RLS nên không cần policy thêm.

-- ── FUNCTIONS ─────────────────────────────────────────────────────────────
create or replace function increment_token_used(p_email text, p_tokens int)
returns void language plpgsql as $$
begin
  insert into user_profiles (email, token_used, token_quota)
  values (p_email, p_tokens, 50000)
  on conflict (email) do update
    set token_used = user_profiles.token_used + p_tokens,
        updated_at = now();
end;
$$;

-- ── Hạn mức theo NGÀY tính bằng VND (thay cho token_quota cộng dồn) ─────────
-- Chi tiêu được tính trực tiếp từ query_logs nên tự reset mỗi ngày; ở đây chỉ
-- lưu hạn mức và mốc "admin bấm Reset".
alter table user_profiles add column if not exists daily_budget_vnd int default 5000;
alter table user_profiles add column if not exists quota_reset_at  timestamptz;

-- Truy vấn hạn mức lọc theo (email, created_at) nên cần chỉ mục ghép
create index if not exists query_logs_email_created_idx
  on query_logs(user_email, created_at desc);

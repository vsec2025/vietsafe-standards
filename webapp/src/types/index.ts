export type UserRole = 'admin' | 'editor' | 'viewer'
export type DocStatus = 'con_hieu_luc' | 'het_hieu_luc' | 'da_sua_doi' | 'cho_hieu_luc'
export type DocType = 'LUAT' | 'QCVN' | 'TCVN' | 'NGHI_DINH' | 'THONG_TU' | 'KHAC'

export interface User {
  id: string
  username: string
  role: UserRole
  displayName: string
  createdAt: string
}

export interface DocMeta {
  so_hieu: string
  ten: string
  loai: DocType
  ngay_ban_hanh: string
  ngay_hieu_luc: string
  trang_thai: DocStatus
  file_name: string
  total_chunks: number
  sua_doi_cho?: string   // so_hieu của văn bản mà file này sửa đổi
  thay_the_cho?: string  // so_hieu của văn bản bị thay thế hoàn toàn
  ghi_chu?: string
  uploaded_by: string
  uploaded_at: string
}

export interface Chunk {
  id: string
  van_ban: string
  so_hieu: string
  loai: DocType
  co_quan: string
  nam: string
  phan: string
  don_vi: string
  tieu_de: string
  content: string
  tokens: number
  trang_thai?: DocStatus
}

export interface SearchResult {
  chunk: Chunk
  score: number
  doc_status: DocStatus
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: SearchResult[]
  timestamp: string
  tokens_used?: number
  cost_usd?: number
}

export interface DailyUsage {
  tokens_used: number
  cost_usd: number
  calls: number
  date: string
}

export const DAILY_BUDGET_USD = 0.30
export const COST_PER_1K_INPUT = 0.00025   // Claude Haiku input
export const COST_PER_1K_OUTPUT = 0.00125  // Claude Haiku output

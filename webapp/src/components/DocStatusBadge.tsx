import { DocStatus } from '@/types'

const STATUS_CONFIG: Record<DocStatus, { label: string; color: string }> = {
  con_hieu_luc:   { label: 'Còn hiệu lực',       color: 'bg-green-100 text-green-700 border-green-200' },
  da_sua_doi:     { label: 'Đã sửa đổi',          color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  het_hieu_luc:   { label: 'Hết hiệu lực',        color: 'bg-red-100 text-red-700 border-red-200' },
  cho_hieu_luc:   { label: 'Chờ có hiệu lực',     color: 'bg-blue-100 text-blue-700 border-blue-200' },
}

export function DocStatusBadge({ status }: { status: DocStatus }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.con_hieu_luc
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { DailyUsage, DAILY_BUDGET_USD } from '@/types'

export function UsageBadge() {
  const [usage, setUsage] = useState<DailyUsage | null>(null)

  useEffect(() => {
    const fetchUsage = () =>
      fetch('/api/usage').then(r => r.json()).then(d => setUsage(d.usage))
    fetchUsage()
    const interval = setInterval(fetchUsage, 30000)
    return () => clearInterval(interval)
  }, [])

  if (!usage) return null

  const pct = Math.min(100, (usage.cost_usd / DAILY_BUDGET_USD) * 100)
  const color = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-green-500'
  const textColor = pct >= 100 ? 'text-red-600' : pct >= 80 ? 'text-yellow-600' : 'text-green-600'

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs space-y-1.5 min-w-[160px]">
      <div className="flex justify-between font-medium">
        <span className="text-gray-600">Chi phí hôm nay</span>
        <span className={textColor}>${usage.cost_usd.toFixed(3)}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-gray-400">
        <span>{usage.calls} lượt</span>
        <span>${DAILY_BUDGET_USD.toFixed(2)}/ngày</span>
      </div>
      {pct >= 80 && pct < 100 && (
        <div className="text-yellow-600 font-medium">⚠️ Gần đến giới hạn</div>
      )}
      {pct >= 100 && (
        <div className="text-red-600 font-medium">🚫 Đã hết hạn mức hôm nay</div>
      )}
    </div>
  )
}

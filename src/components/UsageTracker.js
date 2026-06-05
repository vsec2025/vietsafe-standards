'use client'
import { useState, useEffect, useRef } from 'react'

// Cost estimates for Claude Haiku
const COST_PER_QUESTION = 0.003 // ~$0.003 per Q&A (input + output tokens)
const DAILY_BUDGET = 0.30 // $0.30/user/day
const WARNING_THRESHOLD = 0.8 // Warn at 80% of budget

export default function UsageTracker({ questionCount }) {
  const [sessionStart] = useState(Date.now())
  const [elapsed, setElapsed] = useState('0:00')

  useEffect(() => {
    const timer = setInterval(() => {
      const diff = Date.now() - sessionStart
      const mins = Math.floor(diff / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      setElapsed(`${mins}:${secs.toString().padStart(2, '0')}`)
    }, 1000)
    return () => clearInterval(timer)
  }, [sessionStart])

  const estimatedCost = questionCount * COST_PER_QUESTION
  const budgetPercent = Math.min(100, (estimatedCost / DAILY_BUDGET) * 100)
  const isWarning = budgetPercent >= WARNING_THRESHOLD * 100
  const isOver = budgetPercent >= 100

  return (
    <div className={`px-3 py-1.5 border-t text-[10px] flex items-center gap-3 ${
      isOver ? 'bg-red-50 border-red-200' : isWarning ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'
    }`}>
      {/* Session time */}
      <span className="text-vs-gray-mid flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        {elapsed}
      </span>

      {/* Questions count */}
      <span className="text-vs-gray-mid">
        {questionCount} câu hỏi
      </span>

      {/* Cost bar */}
      <div className="flex-1 flex items-center gap-1.5">
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${budgetPercent}%`,
              background: isOver ? '#ef4444' : isWarning ? '#f59e0b' : '#22c55e'
            }} />
        </div>
        <span className={`font-medium ${isOver ? 'text-red-600' : isWarning ? 'text-yellow-600' : 'text-vs-gray-mid'}`}>
          ${estimatedCost.toFixed(3)}/${DAILY_BUDGET.toFixed(2)}
        </span>
      </div>

      {/* Warning */}
      {isOver && <span className="text-red-600 font-medium">⚠️ Vượt ngân sách!</span>}
      {isWarning && !isOver && <span className="text-yellow-600">⚡ Gần hết ngân sách</span>}
    </div>
  )
}

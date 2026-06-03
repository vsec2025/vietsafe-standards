import { getRedis, keys, getVNDate } from './redis'
import { DailyUsage, DAILY_BUDGET_USD, COST_PER_1K_INPUT, COST_PER_1K_OUTPUT } from '@/types'

export function calcCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1000) * COST_PER_1K_INPUT + 
         (outputTokens / 1000) * COST_PER_1K_OUTPUT
}

export async function getUsage(userId: string, date?: string): Promise<DailyUsage> {
  const redis = getRedis()
  const d = date || getVNDate()
  const data = await redis.get<DailyUsage>(keys.usage(userId, d))
  return data || { tokens_used: 0, cost_usd: 0, calls: 0, date: d }
}

export async function addUsage(
  userId: string, 
  inputTokens: number, 
  outputTokens: number
): Promise<DailyUsage> {
  const redis = getRedis()
  const date = getVNDate()
  const cost = calcCost(inputTokens, outputTokens)
  const key = keys.usage(userId, date)
  
  const current = await getUsage(userId, date)
  const updated: DailyUsage = {
    tokens_used: current.tokens_used + inputTokens + outputTokens,
    cost_usd: current.cost_usd + cost,
    calls: current.calls + 1,
    date,
  }
  
  // TTL 48 giờ (tự xóa sau 2 ngày)
  await redis.set(key, JSON.stringify(updated), { ex: 48 * 3600 })
  return updated
}

export async function checkBudget(userId: string): Promise<{ ok: boolean; usage: DailyUsage }> {
  const usage = await getUsage(userId)
  return { ok: usage.cost_usd < DAILY_BUDGET_USD, usage }
}

export function usagePercent(usage: DailyUsage): number {
  return Math.min(100, (usage.cost_usd / DAILY_BUDGET_USD) * 100)
}

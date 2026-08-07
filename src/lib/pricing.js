// Quy đổi token -> tiền, dùng cho hạn mức theo ngày.
//
// Giá niêm yết của Anthropic tính bằng USD trên 1 triệu token, tách riêng
// token vào và token ra (token ra đắt gấp ~5 lần).

/** USD / 1 triệu token. Cập nhật khi Anthropic đổi giá. */
export const MODEL_PRICES = {
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-haiku-4-5': { input: 1, output: 5 },
}
const DEFAULT_PRICE = MODEL_PRICES['claude-sonnet-5']

/** Tỷ giá USD->VND, chỉnh qua biến môi trường khi cần. */
export const USD_VND = parseInt(process.env.VSEC_USD_VND ?? '26000', 10)

/** Hạn mức mặc định mỗi người mỗi ngày (VND). */
export const DEFAULT_DAILY_BUDGET_VND = parseInt(process.env.VSEC_DAILY_BUDGET_VND ?? '5000', 10)

function priceOf(model) {
  if (!model) return DEFAULT_PRICE
  // Khớp theo tiền tố để không vỡ khi model có hậu tố ngày tháng
  const key = Object.keys(MODEL_PRICES).find((k) => model.startsWith(k))
  return key ? MODEL_PRICES[key] : DEFAULT_PRICE
}

export function costUsd(model, inputTokens = 0, outputTokens = 0) {
  const p = priceOf(model)
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000
}

export function costVnd(model, inputTokens = 0, outputTokens = 0) {
  return costUsd(model, inputTokens, outputTokens) * USD_VND
}

export const formatVnd = (v) => `${Math.round(v).toLocaleString('vi-VN')} ₫`

/**
 * Mốc 0h theo giờ Việt Nam (UTC+7).
 * Dùng UTC thì hạn mức sẽ reset lúc 7h sáng — không khớp "mỗi ngày" của người dùng.
 */
export function startOfDayVN(now = new Date()) {
  const shifted = new Date(now.getTime() + 7 * 3600_000)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - 7 * 3600_000)
}

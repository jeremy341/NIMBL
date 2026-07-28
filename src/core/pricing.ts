import type { PriceVersion } from "./providers"

export interface PriceableUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}

export function estimateProviderCost(price: PriceVersion, usage: PriceableUsage) {
  const rates = price.perMillionTokens
  const cacheRead = usage.cacheReadTokens || 0
  const cacheWrite = usage.cacheWriteTokens || 0
  const ordinaryInput = Math.max(0, usage.inputTokens - cacheRead - cacheWrite)
  const usd = ordinaryInput * rates.input / 1_000_000
    + cacheRead * (rates.cacheRead ?? rates.input) / 1_000_000
    + cacheWrite * (rates.cacheWrite ?? rates.input) / 1_000_000
    + usage.outputTokens * rates.output / 1_000_000
    + (rates.reasoning ? (usage.reasoningTokens || 0) * rates.reasoning / 1_000_000 : 0)
  return { usd, estimated: true as const, effectiveFrom: price.effectiveFrom, source: price.source }
}

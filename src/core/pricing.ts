import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { applyLiveCatalog, type PriceVersion, type ProviderModel } from "./providers"

export interface PriceableUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}

const MODELS_DEV_URL = process.env.NIMBL_MODELS_URL || "https://models.dev"
// Refresh pricing at most every two hours, matching a frequent catalog update
// without adding a network request to every prompt.
const CACHE_TTL_MS = 2 * 60 * 60 * 1000
let catalogPromise: Promise<Record<string, unknown> | undefined> | undefined

function catalogPath() {
  const base = process.platform === "win32"
    ? process.env.LOCALAPPDATA || process.env.APPDATA || join(homedir(), "AppData", "Local")
    : process.env.XDG_CACHE_HOME || join(homedir(), ".cache")
  return join(base, "nimbl", "models.dev.json")
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function readCatalogCache() {
  const file = catalogPath()
  if (!existsSync(file)) return undefined
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as unknown
    const record = asRecord(value)
    const checkedAt = typeof record?.checkedAt === "number" ? record.checkedAt : 0
    const data = asRecord(record?.data)
    return data ? { data, checkedAt } : undefined
  } catch {
    return undefined
  }
}

async function loadCatalog() {
  const cached = readCatalogCache()
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    if (cached.data) applyLiveCatalog(cached.data)
    return cached.data
  }
  try {
    const response = await fetch(`${MODELS_DEV_URL.replace(/\/$/, "")}/api.json`, { signal: AbortSignal.timeout(4_000), headers: { "user-agent": "nimbl" } })
    if (!response.ok) throw new Error(`models.dev returned ${response.status}`)
    const data = asRecord(await response.json())
    if (!data) throw new Error("models.dev returned invalid JSON")
    applyLiveCatalog(data)
    const file = catalogPath()
    mkdirSync(dirname(file), { recursive: true })
    const temporary = `${file}.${process.pid}.tmp`
    writeFileSync(temporary, JSON.stringify({ checkedAt: Date.now(), data }), { encoding: "utf8", mode: 0o600 })
    renameSync(temporary, file)
    return data
  } catch {
    // Keep using the last known catalog during outages. Pricing is preferable
    // to disappear entirely, and the next request will retry after the TTL.
    if (cached?.data) applyLiveCatalog(cached.data)
    return cached?.data
  }
}

function catalogProvider(data: Record<string, unknown>, providerID: string) {
  const aliases = providerID === "opencode-zen" ? ["opencode", "opencode-zen"] : [providerID]
  for (const alias of aliases) {
    const provider = asRecord(data[alias])
    if (provider) return provider
  }
  return undefined
}

/** Resolve current model.dev pricing, falling back silently when offline. */
export async function catalogPrice(providerID: string, modelID: string, fallback?: ProviderModel) {
  catalogPromise ??= loadCatalog()
  const data = await catalogPromise
  const provider = data && catalogProvider(data, providerID)
  const models = provider && asRecord(provider.models)
  const model = models && asRecord(models[modelID])
  const cost = model && asRecord(model.cost)
  const input = typeof cost?.input === "number" ? cost.input : undefined
  const output = typeof cost?.output === "number" ? cost.output : undefined
  if (input === undefined || output === undefined) return fallback?.pricing?.findLast((item) => item.effectiveFrom)
  const cacheRead = typeof cost?.cache_read === "number" ? cost.cache_read : undefined
  const cacheWrite = typeof cost?.cache_write === "number" ? cost.cache_write : undefined
  return {
    effectiveFrom: new Date().toISOString().slice(0, 10),
    currency: "USD" as const,
    perMillionTokens: { input, output, cacheRead, cacheWrite },
    source: { url: `${MODELS_DEV_URL}/api.json`, checkedAt: new Date().toISOString() },
  }
}

/** Fetch + apply the live models.dev catalog (model list, context, cost, status). Fire-and-forget at startup. */
export async function warmCatalog() {
  try {
    await loadCatalog()
  } catch { /* Silent; static catalog remains the fallback. */ }
}

export function estimateProviderCost(price: PriceVersion, usage: PriceableUsage) {  const rates = price.perMillionTokens
  const cacheRead = usage.cacheReadTokens || 0
  const cacheWrite = usage.cacheWriteTokens || 0
  const reasoningTokens = usage.reasoningTokens || 0
  const ordinaryInput = Math.max(0, usage.inputTokens - cacheRead - cacheWrite)
  // OpenAI-style usage reports output tokens that already include reasoning
  // tokens (output = text + reasoning). Charge only the non-reasoning output at
  // the output rate, and the reasoning portion at the reasoning rate (falling
  // back to the output rate when the catalog omits one).
  const ordinaryOutput = Math.max(0, usage.outputTokens - reasoningTokens)
  const usd = ordinaryInput * rates.input / 1_000_000
    + cacheRead * (rates.cacheRead ?? rates.input) / 1_000_000
    + cacheWrite * (rates.cacheWrite ?? rates.input) / 1_000_000
    + ordinaryOutput * rates.output / 1_000_000
    + reasoningTokens * (rates.reasoning ?? rates.output) / 1_000_000
  return { usd, estimated: true as const, effectiveFrom: price.effectiveFrom, source: price.source }
}

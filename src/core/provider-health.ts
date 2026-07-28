import type { ProviderDefinition } from "./providers"

export interface ProviderHealth {
  status: "healthy" | "degraded" | "unavailable" | "unknown"
  checkedAt: number
  latencyMs?: number
  reason?: string
  discoveredModels?: string[]
}

const cache = new Map<string, { expires: number; value: ProviderHealth }>()
type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export function clearProviderHealthCache() { cache.clear() }

export async function checkProviderHealth(provider: ProviderDefinition, apiKey: string, options: { signal?: AbortSignal; force?: boolean; fetcher?: Fetcher; now?: () => number } = {}): Promise<ProviderHealth> {
  const now = options.now ?? Date.now
  const cached = cache.get(provider.id)
  if (!options.force && cached && cached.expires > now()) return cached.value
  const started = now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), provider.health.timeoutMs)
  const abort = () => controller.abort()
  options.signal?.addEventListener("abort", abort, { once: true })
  try {
    const response = await (options.fetcher ?? fetch)(provider.baseURL.replace(/\/$/, "") + provider.health.path, { signal: controller.signal, headers: { ...provider.headers, ...(provider.local ? {} : { Authorization: `Bearer ${apiKey}` }) } })
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
    const body = await response.json().catch(() => ({})) as { data?: Array<{ id?: string }>; models?: Array<{ name?: string }> }
    const discoveredModels = body.data?.map((item) => item.id).filter((id): id is string => Boolean(id)) ?? body.models?.map((item) => item.name).filter((id): id is string => Boolean(id))
    const value: ProviderHealth = { status: "healthy", checkedAt: now(), latencyMs: now() - started, discoveredModels }
    cache.set(provider.id, { expires: now() + 30_000, value })
    return value
  } catch (error) {
    const value: ProviderHealth = { status: "unavailable", checkedAt: now(), latencyMs: now() - started, reason: error instanceof Error ? error.message : String(error) }
    cache.set(provider.id, { expires: now() + 5_000, value })
    return value
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener("abort", abort)
  }
}

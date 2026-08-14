import { PROVIDERS, type ProviderDefinition } from "./providers"
import type { NimblSettings } from "./settings"

export interface RoutingSignals { requiresTools?: boolean; requiresReasoning?: boolean; privateData?: boolean; maxCostUsd?: number; maxLatencyMs?: number; availableProviders?: string[]; health?: Record<string, { latencyMs?: number; healthy?: boolean }> }
export interface ProviderRoute { provider: ProviderDefinition; score: number; rationale: string[]; estimatedCostUsd?: number; estimatedLatencyMs?: number }

function estimateCost(provider: ProviderDefinition) { const model = provider.models.find((candidate) => candidate.pricing) || provider.models[0]; const pricing = model?.pricing?.[0]?.perMillionTokens; return pricing ? (pricing.input + pricing.output) / 2_000_000 : model?.free ? 0 : undefined }
function supports(provider: ProviderDefinition, signals: RoutingSignals) { const model = provider.models[0]; if (signals.requiresTools && !model?.capabilities.tools) return false; if (signals.requiresReasoning && !model?.capabilities.reasoning) return false; return true }

export function rankProviders(prompt: string, settings: Pick<NimblSettings, "providerRouting"> & Partial<Pick<NimblSettings, "providerAllowlist" | "providerDenylist">>, signals: RoutingSignals = {}): ProviderRoute[] {
  const text = prompt.toLowerCase(); const allow = settings.providerAllowlist?.length ? new Set(settings.providerAllowlist) : undefined; const deny = new Set(settings.providerDenylist || [])
  return PROVIDERS.filter((provider) => (!allow || allow.has(provider.id)) && !deny.has(provider.id) && (!signals.availableProviders || signals.availableProviders.includes(provider.id)) && supports(provider, signals)).map((provider) => {
    const reasons: string[] = []; let score = 0; const cost = estimateCost(provider); const health = signals.health?.[provider.id]
    if (provider.local && (settings.providerRouting.preferLocal || /\b(private|offline|local|secret)\b/.test(text) || signals.privateData)) { score += 50; reasons.push("local/private preference") }
    if (settings.providerRouting.preferFast || /\b(quick|fast|brief|latency)\b/.test(text)) { score += provider.id === "groq" ? 35 : 10; reasons.push("fast route") }
    if (settings.providerRouting.preferLowCost || /\b(cheap|free|budget)\b/.test(text)) { score += provider.models.some((model) => model.free) ? 40 : cost === undefined ? 0 : Math.max(0, 20 - cost * 1_000_000); reasons.push("cost preference") }
    if (provider.models.some((model) => model.capabilities.reasoning) && signals.requiresReasoning) { score += 20; reasons.push("reasoning capability") }
    if (health?.healthy === false) score -= 100; if (health?.latencyMs !== undefined) { score += Math.max(0, 20 - health.latencyMs / 100); reasons.push(`${Math.round(health.latencyMs)}ms health sample`) }
    if (signals.maxCostUsd !== undefined && cost !== undefined && cost > signals.maxCostUsd) score -= 80
    if (signals.maxLatencyMs !== undefined && health?.latencyMs !== undefined && health.latencyMs > signals.maxLatencyMs) score -= 80
    return { provider, score, rationale: reasons.length ? reasons : ["default provider capability match"], estimatedCostUsd: cost, estimatedLatencyMs: health?.latencyMs }
  }).sort((a, b) => b.score - a.score || a.provider.id.localeCompare(b.provider.id))
}

export function routeProviderWithRationale(prompt: string, settings: Pick<NimblSettings, "providerRouting"> & Partial<Pick<NimblSettings, "providerAllowlist" | "providerDenylist">>, signals: RoutingSignals = {}) { return rankProviders(prompt, settings, signals)[0] }
export function routeProvider(prompt: string, settings: Pick<NimblSettings, "providerRouting">) { const route = routeProviderWithRationale(prompt, settings); return route && !route.rationale.includes("default provider capability match") ? route.provider : undefined }

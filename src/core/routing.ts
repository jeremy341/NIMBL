import { PROVIDERS, type ProviderDefinition } from "./providers"
import type { NimblSettings } from "./settings"

export function routeProvider(prompt: string, settings: Pick<NimblSettings, "providerRouting">): ProviderDefinition | undefined {
  const request = prompt.toLowerCase()
  const local = PROVIDERS.filter((provider) => provider.local)
  if (settings.providerRouting.preferLocal || /\b(private|offline|local|secret)\b/.test(request)) return local[0]
  if (settings.providerRouting.preferFast || /\b(quick|fast|brief)\b/.test(request)) return PROVIDERS.find((provider) => provider.id === "groq") || PROVIDERS.find((provider) => provider.id === "openrouter")
  if (settings.providerRouting.preferLowCost || /\b(cheap|free|budget)\b/.test(request)) return PROVIDERS.find((provider) => provider.models.some((model) => model.free)) || local[0]
  return undefined
}

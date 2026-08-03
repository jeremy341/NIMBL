import type { SystemModelMessage } from "ai"
import type { SharedV4ProviderOptions } from "@ai-sdk/provider"
import { createHash } from "node:crypto"
import type { ProviderDefinition } from "./providers"

export interface CachedPrompt {
  system: string | SystemModelMessage[]
  providerOptions: SharedV4ProviderOptions
  cachedPrefix: string
  cacheKey: string
}

function hashPrefix(prefix: string) {
  return createHash("sha1").update(prefix).digest("hex").slice(0, 12)
}

export function buildCachedPrompt(fields: { provider: ProviderDefinition; stable: readonly string[]; dynamic: readonly string[] }): CachedPrompt {
  const stableText = fields.stable.filter(Boolean).join("\n\n")
  const dynamicText = fields.dynamic.filter(Boolean).join("\n\n")
  const cachedPrefix = stableText
  const cacheKey = hashPrefix(cachedPrefix)
  if (fields.provider.protocol === "anthropic") {
    return {
      system: [
        { role: "system", content: stableText, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } },
        ...(dynamicText ? [{ role: "system" as const, content: dynamicText }] : []),
      ],
      providerOptions: {},
      cachedPrefix,
      cacheKey,
    }
  }
  const system = [stableText, dynamicText].filter(Boolean).join("\n\n")
  if (fields.provider.id === "openai") return { system, providerOptions: {}, cachedPrefix, cacheKey }
  if (fields.provider.local) return { system, providerOptions: {}, cachedPrefix, cacheKey }
  return {
    system,
    providerOptions: {
      openai: {
        promptCacheKey: cacheKey,
        promptCacheOptions: { mode: "explicit" },
      },
    },
    cachedPrefix,
    cacheKey,
  }
}

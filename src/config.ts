import { defaultModelFor, getProvider, localFallbackKey, providerApiKey } from "@/core/providers"
import { loadGlobalConfig, type GlobalConfig } from "@/core/global-config"

export interface ResolvedConfig {
  provider: string
  model: string
  apiKey: string
}

export function resolveConfig(argv: string[], globalConfig: GlobalConfig = loadGlobalConfig()): ResolvedConfig {
  const argProvider = getFlag(argv, "--provider")
  const argModel = getFlag(argv, "--model")
  const argApiKey = getFlag(argv, "--api-key")

  const provider = argProvider || process.env.NIMBL_PROVIDER || globalConfig.provider || "freellmapi"
  const definition = getProvider(provider)
  const model = argModel || process.env.NIMBL_MODEL || (!argProvider && !process.env.NIMBL_PROVIDER ? globalConfig.model : undefined) || defaultModelFor(provider)
  const apiKey = argApiKey || providerApiKey(provider) || globalConfig.providerKeys?.[provider] || localFallbackKey(provider)

  if (!apiKey) {
    throw new Error(
      `No API key found for provider "${provider}". ` +
      `Set ${definition.envKey}, connect the provider in NIMBL, or pass --api-key.`
    )
  }

  return {
    provider,
    model,
    apiKey,
  }
}

function getFlag(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag)
  if (idx !== -1 && idx + 1 < argv.length) {
    return argv[idx + 1]
  }
  return undefined
}

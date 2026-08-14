import { PROVIDERS, defaultModelFor, localFallbackKey, providerApiKey } from "@/core/providers"
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

  const explicitProvider = argProvider || process.env.NIMBL_PROVIDER
  const savedProvider = globalConfig.provider && PROVIDERS.some((item) => item.id === globalConfig.provider)
    ? globalConfig.provider
    : undefined
  const provider = explicitProvider || savedProvider || "freellmapi"
  const definition = PROVIDERS.find((item) => item.id === provider)
  if (!definition) throw new Error(`Unknown provider "${provider}". Use /provider to inspect supported providers.`)
  const savedModel = !explicitProvider && globalConfig.model && definition.models.some((item) => item.id === globalConfig.model)
    ? globalConfig.model
    : undefined
  const model = argModel || process.env.NIMBL_MODEL || savedModel || defaultModelFor(provider)
  // Credential collection belongs to the interactive provider flow. Keeping an
  // empty key here lets the TUI start and show the same provider -> API key ->
  // model sequence as OpenCode instead of failing before the first frame.
  const apiKey = argApiKey || providerApiKey(provider) || globalConfig.providerKeys?.[provider] || localFallbackKey(provider) || ""

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

import { DEFAULTS } from "@/core/provider-defaults"

export interface ResolvedConfig {
  provider: string
  model: string
  apiKey: string
}

export function resolveConfig(argv: string[]): ResolvedConfig {
  const argProvider = getFlag(argv, "--provider")
  const argModel = getFlag(argv, "--model")
  const argApiKey = getFlag(argv, "--api-key")

  const active = argProvider === "openrouter" ? DEFAULTS.fallback : DEFAULTS.primary

  const provider = argProvider || active.provider
  const model = argModel || active.model
  
  const apiKey =
    argApiKey ||
    (provider === "openrouter"
      ? process.env.OPENROUTER_KEY || ""
      : process.env.FREELLMAPI_KEY || "")

  if (!apiKey) {
    throw new Error(
      `No API key found for provider "${provider}". ` +
      `Set ${provider === "openrouter" ? "OPENROUTER_KEY" : "FREELLMAPI_KEY"} environment variable.`
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

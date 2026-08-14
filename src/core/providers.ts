export type ProviderProtocol = "openai-compatible" | "anthropic"

export type TokenizerFamily = "openai:o200k_base" | "openai:cl100k_base" | "anthropic" | "gemini" | "llama" | "mistral" | "unknown"

export interface ModelCapabilities {
  tools: boolean
  reasoning: boolean
  imageInput: boolean
  streaming: boolean
  structuredOutput: boolean
}

export interface PriceVersion {
  effectiveFrom: string
  currency: "USD"
  perMillionTokens: { input: number; output: number; cacheRead?: number; cacheWrite?: number; reasoning?: number }
  source: { url: string; checkedAt: string }
}

export type ModelStatus = "alpha" | "beta" | "deprecated" | "active"

export interface ProviderModel {
  id: string
  name: string
  free?: boolean
  contextWindow: number
  maxOutputTokens: number
  tokenizer: TokenizerFamily
  capabilities: ModelCapabilities
  pricing?: readonly PriceVersion[]
  status?: ModelStatus
}

export interface ProviderDefinition {
  id: string
  name: string
  description: string
  envKey: string
  /** Secondary env var used for backward compatibility (e.g. OPENCODE_ZEN_API_KEY). */
  fallbackEnvKey?: string
  baseURL: string
  protocol: ProviderProtocol
  models: ProviderModel[]
  headers?: Record<string, string>
  local?: boolean
  health: { path: string; timeoutMs: number }
  discovery?: { path: string }
}

type ModelInput = Pick<ProviderModel, "id" | "name" | "contextWindow"> & Partial<Omit<ProviderModel, "id" | "name" | "contextWindow">>
const DEFAULT_CAPABILITIES: ModelCapabilities = { tools: true, reasoning: false, imageInput: false, streaming: true, structuredOutput: true }

function tokenizerFamily(id: string): TokenizerFamily {
  const value = id.toLowerCase()
  if (/gpt-4\.1|gpt-4o|o[134]-/.test(value)) return "openai:o200k_base"
  if (/gpt-3\.5|gpt-4(?!\.1|o)/.test(value)) return "openai:cl100k_base"
  if (value.includes("claude")) return "anthropic"
  if (value.includes("gemini")) return "gemini"
  if (/llama|nemotron|qwen|deepseek|glm|kimi|grok|minimax/.test(value)) return "llama"
  if (/mistral|codestral|mixtral/.test(value)) return "mistral"
  return "unknown"
}

function pricingFor(provider: string, id: string): readonly PriceVersion[] | undefined {
  if (provider !== "openai") return
  const rates = id === "gpt-4.1" ? { input: 2, output: 8 } : id === "gpt-4.1-mini" ? { input: 0.4, output: 1.6 } : undefined
  if (!rates) return
  return [{ effectiveFrom: "2025-04-14", currency: "USD", perMillionTokens: { ...rates, cacheRead: rates.input / 4 }, source: { url: "https://openai.com/api/pricing/", checkedAt: "2026-07-28" } }]
}

function defineModel(provider: string, input: ModelInput): ProviderModel {
  const lower = input.id.toLowerCase()
  return {
    ...input,
    maxOutputTokens: input.maxOutputTokens ?? Math.min(32_768, Math.floor(input.contextWindow / 4)),
    tokenizer: input.tokenizer ?? tokenizerFamily(input.id),
    capabilities: input.capabilities ?? {
      ...DEFAULT_CAPABILITIES,
      tools: provider !== "perplexity",
      reasoning: /claude|deepseek|grok|o[134]-/.test(lower),
      imageInput: /gpt|claude|gemini/.test(lower),
      structuredOutput: provider !== "perplexity",
    },
    pricing: input.pricing ?? pricingFor(provider, input.id),
  }
}

function compatible(
  id: string,
  name: string,
  description: string,
  envKey: string,
  baseURL: string,
  models: ModelInput[],
  options: Partial<Pick<ProviderDefinition, "headers" | "local" | "health" | "discovery" | "fallbackEnvKey">> = {},
): ProviderDefinition {
  return { id, name, description, envKey, baseURL, models: models.map((model) => defineModel(id, model)), protocol: "openai-compatible", health: options.health ?? { path: "/models", timeoutMs: 3000 }, discovery: options.discovery ?? { path: "/models" }, ...options }
}

export const PROVIDERS: ProviderDefinition[] = [
  compatible("freellmapi", "FreeLLM API", "Local auto-router", "FREELLMAPI_KEY", "http://localhost:3001/v1", [{ id: "auto", name: "Auto-router", contextWindow: 128_000 }], { local: true }),
  compatible("opencode-zen", "OpenCode Zen", "OpenCode-tested coding models", "OPENCODE_API_KEY", "https://opencode.ai/zen/v1", [
    { id: "deepseek-v4-flash-free", name: "DeepSeek V4 Flash Free", free: true, contextWindow: 200_000 },
    { id: "nemotron-3-ultra-free", name: "Nemotron 3 Ultra Free", free: true, contextWindow: 1_000_000 },
    { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", contextWindow: 1_000_000 },
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", contextWindow: 1_000_000 },
    { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", contextWindow: 1_000_000 },
    { id: "claude-opus-4-5", name: "Claude Opus 4.5", contextWindow: 200_000 },
    { id: "gpt-5", name: "GPT-5", contextWindow: 400_000 },
    { id: "gemini-3-flash", name: "Gemini 3 Flash", contextWindow: 1_048_576 },
    { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash", contextWindow: 1_048_576 },
    { id: "kimi-k3", name: "Kimi K3", contextWindow: 1_048_576 },
    { id: "grok-4.6", name: "Grok 4.6", contextWindow: 500_000 },
    { id: "glm-5.2", name: "GLM-5.2", contextWindow: 1_000_000 },
    { id: "glm-5.1", name: "GLM-5.1", contextWindow: 204_800 },
    { id: "minimax-m2.5", name: "MiniMax-M2.5", contextWindow: 204_800 },
  ], { fallbackEnvKey: "OPENCODE_ZEN_API_KEY" }),
  compatible("opencode-go", "OpenCode Go", "OpenCode Go subscription", "OPENCODE_API_KEY", "https://opencode.ai/zen/go/v1", [
    { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", contextWindow: 1_000_000 },
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", contextWindow: 1_000_000 },
    { id: "kimi-k2.7-code", name: "Kimi K2.7 Code", contextWindow: 262_144 },
    { id: "kimi-k3", name: "Kimi K3", contextWindow: 1_048_576 },
    { id: "glm-5.3", name: "GLM-5.3", contextWindow: 1_000_000 },
    { id: "glm-5.2", name: "GLM-5.2", contextWindow: 1_000_000 },
    { id: "glm-5.1", name: "GLM-5.1", contextWindow: 202_752 },
    { id: "grok-4.5", name: "Grok 4.5", contextWindow: 500_000 },
    { id: "minimax-m3", name: "MiniMax-M3", contextWindow: 1_000_000 },
    { id: "minimax-m2.7", name: "MiniMax-M2.7", contextWindow: 204_800 },
    { id: "minimax-m2.5", name: "MiniMax-M2.5", contextWindow: 204_800, status: "deprecated" },
    { id: "qwen3.8-max", name: "Qwen3.8 Max", contextWindow: 1_000_000 },
    { id: "qwen3.7-plus", name: "Qwen3.7 Plus", contextWindow: 1_000_000 },
    { id: "qwen3.6-plus", name: "Qwen3.6 Plus", contextWindow: 1_000_000 },
    { id: "mimo-v2.5", name: "MIMO-V2.5", contextWindow: 1_000_000 },
    { id: "mimo-v2.5-pro", name: "MIMO-V2.5 Pro", contextWindow: 1_048_576 },
    { id: "hy3", name: "HY3", contextWindow: 256_000 },
    { id: "kimi-k2.6", name: "Kimi K2.6", contextWindow: 262_144 },
    { id: "gpt-5.6-luna", name: "GPT-5.6 Luna", contextWindow: 1_050_000 },
  ], { fallbackEnvKey: "OPENCODE_GO_API_KEY" }),
  compatible("openai", "OpenAI", "OpenAI API", "OPENAI_API_KEY", "https://api.openai.com/v1", [{ id: "gpt-4.1-mini", name: "GPT-4.1 mini", contextWindow: 1_047_576 }, { id: "gpt-4.1", name: "GPT-4.1", contextWindow: 1_047_576 }]),
  { id: "anthropic", name: "Anthropic", description: "Claude API", envKey: "ANTHROPIC_API_KEY", baseURL: "https://api.anthropic.com/v1", protocol: "anthropic", models: [defineModel("anthropic", { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", contextWindow: 200_000 }), defineModel("anthropic", { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", contextWindow: 200_000 })], health: { path: "/models", timeoutMs: 3000 }, discovery: { path: "/models" } },
  compatible("github-models", "GitHub Models", "GitHub PAT with models scope", "GITHUB_TOKEN", "https://models.github.ai/inference", [{ id: "openai/gpt-4.1", name: "OpenAI GPT-4.1", contextWindow: 1_047_576 }, { id: "deepseek/DeepSeek-V3-0324", name: "DeepSeek V3", contextWindow: 64_000 }], { headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10" } }),
  compatible("openrouter", "OpenRouter", "Multi-provider model gateway", "OPENROUTER_KEY", "https://openrouter.ai/api/v1", [{ id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", contextWindow: 128_000 }, { id: "google/gemini-2.0-flash", name: "Gemini 2.0 Flash", contextWindow: 1_048_576 }]),
  compatible("google", "Google AI Studio", "Gemini OpenAI-compatible API", "GEMINI_API_KEY", "https://generativelanguage.googleapis.com/v1beta/openai", [{ id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", contextWindow: 1_048_576 }, { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", contextWindow: 1_048_576 }]),
  compatible("groq", "Groq", "Fast inference API", "GROQ_API_KEY", "https://api.groq.com/openai/v1", [{ id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", contextWindow: 128_000 }]),
  compatible("together", "Together AI", "Open model inference", "TOGETHER_API_KEY", "https://api.together.xyz/v1", [{ id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", name: "Llama 3.3 70B", contextWindow: 128_000 }]),
  compatible("fireworks", "Fireworks AI", "Fast open-model inference", "FIREWORKS_API_KEY", "https://api.fireworks.ai/inference/v1", [{ id: "accounts/fireworks/models/llama-v3p3-70b-instruct", name: "Llama 3.3 70B", contextWindow: 128_000 }]),
  compatible("deepinfra", "DeepInfra", "OpenAI-compatible inference", "DEEPINFRA_API_KEY", "https://api.deepinfra.com/v1/openai", [{ id: "meta-llama/Meta-Llama-3.1-70B-Instruct", name: "Llama 3.1 70B", contextWindow: 128_000 }]),
  compatible("mistral", "Mistral AI", "Mistral API", "MISTRAL_API_KEY", "https://api.mistral.ai/v1", [{ id: "mistral-large-latest", name: "Mistral Large", contextWindow: 128_000 }, { id: "codestral-latest", name: "Codestral", contextWindow: 256_000 }]),
  compatible("perplexity", "Perplexity", "Search-grounded models", "PERPLEXITY_API_KEY", "https://api.perplexity.ai", [{ id: "sonar-pro", name: "Sonar Pro", contextWindow: 200_000 }]),
  compatible("xai", "xAI", "Grok API", "XAI_API_KEY", "https://api.x.ai/v1", [{ id: "grok-3-mini", name: "Grok 3 mini", contextWindow: 131_072 }]),
  compatible("cerebras", "Cerebras", "Fast model inference", "CEREBRAS_API_KEY", "https://api.cerebras.ai/v1", [{ id: "llama-3.3-70b", name: "Llama 3.3 70B", contextWindow: 128_000 }]),
  compatible("nvidia", "NVIDIA NIM", "NVIDIA hosted models", "NVIDIA_API_KEY", "https://integrate.api.nvidia.com/v1", [{ id: "meta/llama-3.3-70b-instruct", name: "Llama 3.3 70B", contextWindow: 128_000 }]),
  compatible("ollama", "Ollama", "Local Ollama server", "OLLAMA_API_KEY", "http://localhost:11434/v1", [{ id: "llama3.2", name: "Llama 3.2", contextWindow: 128_000 }, { id: "qwen2.5-coder", name: "Qwen 2.5 Coder", contextWindow: 32_768 }], { local: true }),
  compatible("lmstudio", "LM Studio", "Local LM Studio server", "LMSTUDIO_API_KEY", "http://localhost:1234/v1", [{ id: "local-model", name: "Loaded local model", contextWindow: 128_000 }], { local: true }),
]

export function getProvider(id: string): ProviderDefinition {
  const provider = PROVIDERS.find((item) => item.id === id)
  if (!provider) throw new Error(`Unknown provider "${id}".`)
  return provider
}

export function defaultModelFor(providerID: string): string {
  const provider = getProvider(providerID)
  const active = provider.models.find((model) => model.status !== "deprecated")
  return (active ?? provider.models[0])!.id
}

export function getModel(providerID: string, modelID: string) {
  const model = getProvider(providerID).models.find((item) => item.id === modelID)
  if (!model) throw new Error(`Unknown model "${modelID}" for provider "${providerID}".`)
  return model
}

export function resolveModel(providerID: string, modelID: string, contextWindowOverride?: number): ProviderModel {
  const configured = getProvider(providerID).models.find((item) => item.id === modelID)
  if (configured) return { ...configured, contextWindow: Math.min(configured.contextWindow, contextWindowOverride || configured.contextWindow) }
  if (!contextWindowOverride || contextWindowOverride < 1_024) throw new Error(`Unknown model "${modelID}" for provider "${providerID}" requires an explicit context window.`)
  return {
    id: modelID,
    name: modelID,
    contextWindow: contextWindowOverride,
    maxOutputTokens: Math.min(8_000, Math.floor(contextWindowOverride / 4)),
    tokenizer: "unknown",
    capabilities: { tools: true, reasoning: false, imageInput: false, streaming: true, structuredOutput: false },
  }
}

export interface RequestRequirements {
  tools: boolean
  reasoning: boolean
  imageInput: boolean
  structuredOutput: boolean
  streaming: boolean
  minimumContextTokens: number
}

export function compatibilityIssues(model: ProviderModel, requirements: RequestRequirements) {
  const issues: string[] = []
  if (requirements.tools && !model.capabilities.tools) issues.push("tool calling")
  if (requirements.reasoning && !model.capabilities.reasoning) issues.push("reasoning")
  if (requirements.imageInput && !model.capabilities.imageInput) issues.push("image input")
  if (requirements.structuredOutput && !model.capabilities.structuredOutput) issues.push("structured output")
  if (requirements.streaming && !model.capabilities.streaming) issues.push("streaming")
  if (requirements.minimumContextTokens > model.contextWindow) issues.push(`context window below ${requirements.minimumContextTokens}`)
  return issues
}

export function providerApiKey(providerID: string, override?: string): string {
  if (override) return override
  const provider = getProvider(providerID)
  return process.env[provider.envKey] || (provider.fallbackEnvKey ? process.env[provider.fallbackEnvKey] : "") || ""
}

export function localFallbackKey(providerID: string): string {
  return getProvider(providerID).local ? "local" : ""
}

export function modelContextWindow(providerID: string, modelID: string) {
  const override = Number(process.env.NIMBL_CONTEXT_WINDOW)
  return resolveModel(providerID, modelID, Number.isFinite(override) ? Math.floor(override) : undefined).contextWindow
}

type LiveModelEntry = Record<string, unknown>
type LiveProviderEntry = Record<string, unknown>

function toModelStatus(value: unknown): ModelStatus | undefined {
  if (value === "alpha" || value === "beta" || value === "deprecated" || value === "active") return value
  return undefined
}

function liveToModel(providerID: string, id: string, entry: LiveModelEntry): ProviderModel {
  const cost = entry.cost as LiveModelEntry | undefined
  const limit = entry.limit as LiveModelEntry | undefined
  const modalities = entry.modalities as LiveModelEntry | undefined
  const input = typeof cost?.input === "number" ? cost.input : undefined
  const output = typeof cost?.output === "number" ? cost.output : undefined
  const context = typeof limit?.context === "number" ? limit.context : undefined
  const maxOutput = typeof limit?.output === "number" ? limit.output : undefined
  const inputModalities = Array.isArray(modalities?.input) ? (modalities!.input as unknown[]).filter((x): x is string => typeof x === "string") : []
  const lower = id.toLowerCase()
  const model: ProviderModel = {
    id,
    name: typeof entry.name === "string" ? entry.name : id,
    free: input === 0 && output === 0,
    contextWindow: context ?? 128_000,
    maxOutputTokens: maxOutput ?? Math.min(32_768, Math.floor((context ?? 128_000) / 4)),
    tokenizer: tokenizerFamily(id),
    capabilities: {
      tools: entry.tool_call !== false,
      reasoning: entry.reasoning === true || /claude|deepseek|grok|o[134]-/.test(lower),
      imageInput: inputModalities.includes("image"),
      streaming: true,
      structuredOutput: providerID !== "perplexity",
    },
    status: toModelStatus(entry.status),
    pricing: input !== undefined && output !== undefined
      ? [{
          effectiveFrom: new Date().toISOString().slice(0, 10),
          currency: "USD" as const,
          perMillionTokens: {
            input,
            output,
            cacheRead: typeof cost?.cache_read === "number" ? cost.cache_read : undefined,
            cacheWrite: typeof cost?.cache_write === "number" ? cost.cache_write : undefined,
          },
          source: { url: "https://models.dev/api.json", checkedAt: new Date().toISOString() },
        }]
      : undefined,
  }
  return model
}

/** Map a NIMBL provider id to the models.dev provider key. */
export function modelsDevKey(providerID: string): string {
  return providerID === "opencode-zen" ? "opencode" : providerID
}

/**
 * Overlay live models.dev data onto the static catalog. Every provider whose
 * key exists in `data` gets its `models` replaced with live entries (name,
 * context window, output limit, cost, capabilities, status, free flag).
 * Falls back to the static list for providers missing from the feed.
 */
export function applyLiveCatalog(data: Record<string, unknown>): void {
  for (const provider of PROVIDERS) {
    const key = modelsDevKey(provider.id)
    const live = data[key] as LiveProviderEntry | undefined
    const models = live?.models as Record<string, LiveModelEntry> | undefined
    if (!models) continue
    const next = Object.entries(models).map(([id, entry]) => liveToModel(provider.id, id, entry))
    if (next.length) provider.models = next
  }
}

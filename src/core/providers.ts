export type ProviderProtocol = "openai-compatible" | "anthropic"

export interface ProviderModel {
  id: string
  name: string
  free?: boolean
  /** Maximum supported context for this configured model, in tokens. */
  contextWindow?: number
}

export interface ProviderDefinition {
  id: string
  name: string
  description: string
  envKey: string
  baseURL: string
  protocol: ProviderProtocol
  models: ProviderModel[]
  headers?: Record<string, string>
  local?: boolean
}

function compatible(
  id: string,
  name: string,
  description: string,
  envKey: string,
  baseURL: string,
  models: ProviderModel[],
  options: Pick<ProviderDefinition, "headers" | "local"> = {},
): ProviderDefinition {
  return { id, name, description, envKey, baseURL, models, protocol: "openai-compatible", ...options }
}

export const PROVIDERS: ProviderDefinition[] = [
  compatible("freellmapi", "FreeLLM API", "Local auto-router", "FREELLMAPI_KEY", "http://localhost:3001/v1", [{ id: "auto", name: "Auto-router", contextWindow: 128_000 }], { local: true }),
  compatible("opencode-zen", "OpenCode Zen", "OpenCode-tested coding models", "OPENCODE_ZEN_API_KEY", "https://opencode.ai/zen/v1", [{ id: "deepseek-v4-flash-free", name: "DeepSeek V4 Flash Free", free: true, contextWindow: 128_000 }, { id: "nemotron-3-ultra-free", name: "Nemotron 3 Ultra Free", free: true, contextWindow: 128_000 }, { id: "minimax-m2.5", name: "MiniMax M2.5", contextWindow: 128_000 }]),
  compatible("opencode-go", "OpenCode Go", "OpenCode Go subscription", "OPENCODE_GO_API_KEY", "https://opencode.ai/zen/v1", [{ id: "minimax-m2.5", name: "MiniMax M2.5", contextWindow: 128_000 }, { id: "glm-5.1", name: "GLM 5.1", contextWindow: 128_000 }]),
  compatible("openai", "OpenAI", "OpenAI API", "OPENAI_API_KEY", "https://api.openai.com/v1", [{ id: "gpt-4.1-mini", name: "GPT-4.1 mini", contextWindow: 1_047_576 }, { id: "gpt-4.1", name: "GPT-4.1", contextWindow: 1_047_576 }]),
  { id: "anthropic", name: "Anthropic", description: "Claude API", envKey: "ANTHROPIC_API_KEY", baseURL: "https://api.anthropic.com/v1", protocol: "anthropic", models: [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", contextWindow: 200_000 }, { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", contextWindow: 200_000 }] },
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
  return getProvider(providerID).models[0]!.id
}

export function providerApiKey(providerID: string, override?: string): string {
  if (override) return override
  const provider = getProvider(providerID)
  return process.env[provider.envKey] || (provider.local ? "local" : "")
}

export function modelContextWindow(providerID: string, modelID: string) {
  const override = Number(process.env.NIMBL_CONTEXT_WINDOW)
  if (Number.isFinite(override) && override >= 1_024) return Math.floor(override)
  return getProvider(providerID).models.find((model) => model.id === modelID)?.contextWindow || 128_000
}


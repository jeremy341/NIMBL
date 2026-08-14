import { beforeEach, describe, expect, it, vi } from "vitest"
import { applyLiveCatalog, defaultModelFor, getProvider, modelsDevKey, PROVIDERS, providerApiKey, resolveModel } from "@/core/providers"

describe("opencode provider catalog fixes", () => {
  beforeEach(() => {
    delete process.env.OPENCODE_API_KEY
    delete process.env.OPENCODE_GO_API_KEY
    delete process.env.OPENCODE_ZEN_API_KEY
  })

  it("points OpenCode Go at the Go endpoint and shares OPENCODE_API_KEY", () => {
    const go = getProvider("opencode-go")
    expect(go.baseURL).toBe("https://opencode.ai/zen/go/v1")
    expect(go.envKey).toBe("OPENCODE_API_KEY")
    expect(go.fallbackEnvKey).toBe("OPENCODE_GO_API_KEY")
  })

  it("keeps OpenCode Zen on /zen/v1 with the OPENCODE_API_KEY plus legacy fallback", () => {
    const zen = getProvider("opencode-zen")
    expect(zen.baseURL).toBe("https://opencode.ai/zen/v1")
    expect(zen.envKey).toBe("OPENCODE_API_KEY")
    expect(zen.fallbackEnvKey).toBe("OPENCODE_ZEN_API_KEY")
  })

  it("resolves the API key from the shared env var and the legacy fallback", () => {
    process.env.OPENCODE_API_KEY = "shared-key"
    expect(providerApiKey("opencode-go")).toBe("shared-key")
    expect(providerApiKey("opencode-zen")).toBe("shared-key")
    delete process.env.OPENCODE_API_KEY
    process.env.OPENCODE_GO_API_KEY = "legacy-key"
    expect(providerApiKey("opencode-go")).toBe("legacy-key")
  })

  it("lists deepseek-v4-flash on the Go provider with the correct live context window", () => {
    const go = getProvider("opencode-go")
    const flash = go.models.find((model) => model.id === "deepseek-v4-flash")
    expect(flash).toBeDefined()
    expect(flash!.contextWindow).toBe(1_000_000)
  })

  it("marks the deprecated Go model and skips it for the default", () => {
    const go = getProvider("opencode-go")
    const deprecated = go.models.find((model) => model.id === "minimax-m2.5")
    expect(deprecated?.status).toBe("deprecated")
    expect(defaultModelFor("opencode-go")).not.toBe("minimax-m2.5")
  })

  it("overlays live models.dev entries onto the static catalog", () => {
    applyLiveCatalog({
      "opencode-go": {
        models: {
          "deepseek-v4-flash": {
            name: "DeepSeek V4 Flash (2x usage)",
            cost: { input: 0.07, output: 0.14, cache_read: 0.0014 },
            limit: { context: 1_000_000, output: 384_000 },
            tool_call: true,
            reasoning: true,
            modalities: { input: ["text"], output: ["text"] },
          },
          "brand-new-model": {
            name: "Brand New Model",
            cost: { input: 0, output: 0 },
            limit: { context: 512_000, output: 64_000 },
            tool_call: true,
            reasoning: false,
            modalities: { input: ["text"], output: ["text"] },
          },
        },
      },
    })
    const go = getProvider("opencode-go")
    const flash = go.models.find((model) => model.id === "deepseek-v4-flash")
    expect(flash?.name).toBe("DeepSeek V4 Flash (2x usage)")
    expect(flash?.contextWindow).toBe(1_000_000)
    expect(flash?.maxOutputTokens).toBe(384_000)
    expect(flash?.free).toBe(false)
    const fresh = go.models.find((model) => model.id === "brand-new-model")
    expect(fresh).toBeDefined()
    expect(fresh?.free).toBe(true)
    expect(fresh?.contextWindow).toBe(512_000)
  })

  it("keeps the static catalog when the live feed has no entry for a provider", () => {
    applyLiveCatalog({})
    expect(getProvider("opencode-go").models.length).toBeGreaterThan(0)
    expect(getProvider("openai").models.some((model) => model.id === "gpt-4.1")).toBe(true)
  })

  it("resolves models via the NIMBL id after a live overlay", () => {
    applyLiveCatalog({
      "opencode-go": { models: { "deepseek-v4-flash": { cost: { input: 0.07, output: 0.14 }, limit: { context: 1_000_000, output: 384_000 }, modalities: { input: ["text"], output: ["text"] } } } },
    })
    const resolved = resolveModel("opencode-go", "deepseek-v4-flash")
    expect(resolved.contextWindow).toBe(1_000_000)
    expect(resolved.tokenizer).toBe("llama")
  })

  it("maps opencode-zen to the opencode models.dev key", () => {
    expect(modelsDevKey("opencode-zen")).toBe("opencode")
    expect(modelsDevKey("opencode-go")).toBe("opencode-go")
    expect(modelsDevKey("openai")).toBe("openai")
  })

  it("merges the live feed over the static catalog instead of replacing it", () => {
    applyLiveCatalog({
      "opencode-go": {
        models: {
          "deepseek-v4-flash": { name: "Live DeepSeek V4 Flash", cost: { input: 0.07, output: 0.14 }, limit: { context: 1_000_000, output: 384_000 }, modalities: { input: ["text"], output: ["text"] } },
        },
      },
    })
    const go = getProvider("opencode-go")
    // The live entry updates the matched static model.
    const flash = go.models.find((model) => model.id === "deepseek-v4-flash")
    expect(flash?.name).toBe("Live DeepSeek V4 Flash")
    // Static models the feed omits must survive (previously they were dropped).
    const pro = go.models.find((model) => model.id === "deepseek-v4-pro")
    expect(pro).toBeDefined()
    const kimi = go.models.find((model) => model.id === "kimi-k2.7-code")
    expect(kimi).toBeDefined()
  })

  it("registers a runtime custom provider from env vars", () => {
    const previous = {
      provider: process.env.NIMBL_CUSTOM_PROVIDER,
      baseURL: process.env.NIMBL_CUSTOM_BASE_URL,
      model: process.env.NIMBL_CUSTOM_MODEL,
      key: process.env.NIMBL_CUSTOM_API_KEY,
    }
    process.env.NIMBL_CUSTOM_PROVIDER = "custom"
    process.env.NIMBL_CUSTOM_BASE_URL = "https://example.com/v1"
    process.env.NIMBL_CUSTOM_MODEL = "test-model"
    process.env.NIMBL_CUSTOM_API_KEY = "test-key"
    try {
      const provider = getProvider("custom")
      expect(provider.baseURL).toBe("https://example.com/v1")
      expect(provider.models[0]?.id).toBe("test-model")
      expect(providerApiKey("custom")).toBe("test-key")
    } finally {
      if (previous.provider === undefined) delete process.env.NIMBL_CUSTOM_PROVIDER
      else process.env.NIMBL_CUSTOM_PROVIDER = previous.provider
      if (previous.baseURL === undefined) delete process.env.NIMBL_CUSTOM_BASE_URL
      else process.env.NIMBL_CUSTOM_BASE_URL = previous.baseURL
      if (previous.model === undefined) delete process.env.NIMBL_CUSTOM_MODEL
      else process.env.NIMBL_CUSTOM_MODEL = previous.model
      if (previous.key === undefined) delete process.env.NIMBL_CUSTOM_API_KEY
      else process.env.NIMBL_CUSTOM_API_KEY = previous.key
    }
  })
})

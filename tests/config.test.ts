import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { resolveConfig } from "@/config"
import { loadGlobalConfig, saveGlobalConfig } from "@/core/global-config"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("resolveConfig", () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("uses freellmapi as default provider with env key", () => {
    process.env.FREELLMAPI_KEY = "test-key"
    const config = resolveConfig([], {})
    expect(config.provider).toBe("freellmapi")
    expect(config.model).toBe("auto")
    expect(config.apiKey).toBe("test-key")
  })

  it("switches to OpenRouter via --provider flag", () => {
    process.env.OPENROUTER_KEY = "test-key"
    const config = resolveConfig(["--provider", "openrouter"])
    expect(config.provider).toBe("openrouter")
    expect(config.model).toBe("deepseek/deepseek-v4-pro")
    expect(config.apiKey).toBe("test-key")
  })

  it("accepts --model override", () => {
    process.env.OPENROUTER_KEY = "test-key"
    const config = resolveConfig([
      "--provider",
      "openrouter",
      "--model",
      "google/gemini-2.0-flash",
    ])
    expect(config.provider).toBe("openrouter")
    expect(config.model).toBe("google/gemini-2.0-flash")
    expect(config.apiKey).toBe("test-key")
  })

  it("accepts --api-key override", () => {
    process.env.FREELLMAPI_KEY = "env-key"
    const config = resolveConfig(["--api-key", "sk-custom"], {})
    expect(config.apiKey).toBe("sk-custom")
    expect(config.provider).toBe("freellmapi")
  })

  it("starts the TUI when a hosted provider key is missing so it can be entered interactively", () => {
    process.env.FREELLMAPI_KEY = ""
    process.env.OPENROUTER_KEY = ""
    const config = resolveConfig(["--provider", "openrouter"])
    expect(config.provider).toBe("openrouter")
    expect(config.apiKey).toBe("")
  })

  it("prioritizes --api-key flag over environment variable", () => {
    process.env.OPENROUTER_KEY = "env-key"
    const config = resolveConfig([
      "--provider",
      "openrouter",
      "--api-key",
      "flag-key",
    ])
    expect(config.apiKey).toBe("flag-key")
  })

  it("ignores unknown flags", () => {
    process.env.FREELLMAPI_KEY = "test-key"
    const config = resolveConfig(["--verbose", "--debug"], {})
    expect(config.provider).toBe("freellmapi")
    expect(config.model).toBe("auto")
  })

  it("uses globally saved keys when launched outside the project", () => {
    const directory = mkdtempSync(join(tmpdir(), "nimbl-config-"))
    const file = join(directory, "config.json")
    try {
      saveGlobalConfig({ provider: "openrouter", model: "deepseek/deepseek-v4-pro", providerKeys: { openrouter: "global-key" } }, file)
      delete process.env.OPENROUTER_KEY
      const config = resolveConfig([], loadGlobalConfig(file))
      expect(config.provider).toBe("openrouter")
      expect(config.apiKey).toBe("global-key")
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("round-trips global model favorites and recents", () => {
    const directory = mkdtempSync(join(tmpdir(), "nimbl-model-history-"))
    const file = join(directory, "config.json")
    try {
      saveGlobalConfig({ favoriteModels: ["openai::gpt-4.1"], recentModels: ["anthropic::claude-sonnet-4-5"] }, file)
      expect(loadGlobalConfig(file)).toMatchObject({
        favoriteModels: ["openai::gpt-4.1"],
        recentModels: ["anthropic::claude-sonnet-4-5"],
      })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("prefers environment keys over globally saved keys", () => {
    process.env.OPENROUTER_KEY = "environment-key"
    const config = resolveConfig([], { provider: "openrouter", providerKeys: { openrouter: "global-key" } })
    expect(config.apiKey).toBe("environment-key")
  })

  it("ignores a stale saved provider and model instead of crashing before the TUI opens", () => {
    delete process.env.NIMBL_PROVIDER
    delete process.env.NIMBL_MODEL
    const config = resolveConfig([], { provider: "removed-provider", model: "removed-model" })
    expect(config).toMatchObject({ provider: "freellmapi", model: "auto", apiKey: "local" })
  })
})

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { resolveConfig } from "@/config"

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
    const config = resolveConfig([])
    expect(config.provider).toBe("freellmapi")
    expect(config.model).toBe("auto")
    expect(config.apiKey).toBe("test-key")
  })

  it("switches to OpenRouter via --provider flag", () => {
    process.env.OPENROUTER_KEY = "test-key"
    const config = resolveConfig(["--provider", "openrouter"])
    expect(config.provider).toBe("openrouter")
    expect(config.model).toBe("deepseek/deepseek-chat")
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
    const config = resolveConfig(["--api-key", "sk-custom"])
    expect(config.apiKey).toBe("sk-custom")
    expect(config.provider).toBe("freellmapi")
  })

  it("throws error when API key is missing", () => {
    process.env.FREELLMAPI_KEY = ""
    process.env.OPENROUTER_KEY = ""
    expect(() => resolveConfig([])).toThrow("No API key found")
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
    const config = resolveConfig(["--verbose", "--debug"])
    expect(config.provider).toBe("freellmapi")
    expect(config.model).toBe("auto")
  })
})


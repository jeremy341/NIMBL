import { describe, expect, it } from "bun:test"
import { opencodeCustomProviderConfig } from "../src/core/opencode-benchmark"

describe("opencodeCustomProviderConfig", () => {
  it("keys the model by everything after the first slash for namespaced routes", () => {
    const cfg = opencodeCustomProviderConfig({
      providerId: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: "test-key",
      model: "openrouter/deepseek/deepseek-v4-flash-0731:StreamLake",
    })
    const provider = (cfg.provider as Record<string, { models: Record<string, unknown>; options: Record<string, unknown> }>).openrouter
    expect(provider).toBeDefined()
    expect(Object.keys(provider.models)).toEqual(["deepseek/deepseek-v4-flash-0731:StreamLake"])
    expect((provider.models["deepseek/deepseek-v4-flash-0731:StreamLake"] as { name: string }).name).toBe("deepseek/deepseek-v4-flash-0731:StreamLake")
    expect(provider.options).toEqual({ baseURL: "https://openrouter.ai/api/v1", apiKey: "test-key" })
  })

  it("keeps single-segment model ids intact", () => {
    const cfg = opencodeCustomProviderConfig({
      providerId: "netic",
      baseURL: "https://netic.hackclub.app/v1",
      apiKey: "k",
      model: "netic/deepseek-v4-flash-free",
    })
    const provider = (cfg.provider as Record<string, { models: Record<string, unknown> }>).netic
    expect(Object.keys(provider.models)).toEqual(["deepseek-v4-flash-free"])
  })

  it("defaults the injected context window to 200k to match the NIMBL benchmark", () => {
    const cfg = opencodeCustomProviderConfig({
      providerId: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: "k",
      model: "openrouter/deepseek/deepseek-v4-flash-0731:StreamLake",
    })
    const provider = (cfg.provider as Record<string, { models: Record<string, { limit: { context: number } }> }>).openrouter
    expect(provider.models["deepseek/deepseek-v4-flash-0731:StreamLake"].limit.context).toBe(200_000)
  })
})
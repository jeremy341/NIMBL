import { describe, expect, it } from "vitest"
import { getProvider } from "@/core/providers"
import { buildCachedPrompt } from "@/core/prompt-cache"

describe("prompt caching", () => {
  const stable = ["System instructions", "Project instructions:\nAGENTS.md"]
  const dynamic = ["Relevant project context:\n# src/main.ts"]

  it("orders the stable prefix before dynamic retrieval text", () => {
    const cached = buildCachedPrompt({ provider: getProvider("openrouter"), stable, dynamic })
    expect(typeof cached.system).toBe("string")
    const system = cached.system as string
    expect(system.indexOf(stable.join("\n\n"))).toBe(0)
    expect(system.indexOf(dynamic.join("\n\n"))).toBeGreaterThan(system.indexOf(stable.join("\n\n")))
  })

  it("marks the stable prefix for Anthropic with an ephemeral cache breakpoint", () => {
    const cached = buildCachedPrompt({ provider: getProvider("anthropic"), stable, dynamic })
    expect(Array.isArray(cached.system)).toBe(true)
    const parts = cached.system as Array<{ role: string; content: string; providerOptions?: Record<string, unknown> }>
    expect(parts[0]?.content).toBe(stable.join("\n\n"))
    expect(parts[0]?.providerOptions).toEqual({ anthropic: { cacheControl: { type: "ephemeral" } } })
    expect(parts[1]?.content).toBe(dynamic.join("\n\n"))
    expect(parts[1]?.providerOptions).toBeUndefined()
  })

  it("hints OpenAI-compatible chat providers with a stable prompt cache key", () => {
    const cached = buildCachedPrompt({ provider: getProvider("openrouter"), stable, dynamic })
    expect(cached.providerOptions).toMatchObject({
      openai: { promptCacheKey: cached.cacheKey, promptCacheOptions: { mode: "explicit" } },
    })
  })

  it("does not hint the OpenAI Responses API or local providers", () => {
    expect(buildCachedPrompt({ provider: getProvider("openai"), stable, dynamic }).providerOptions).toEqual({})
    expect(buildCachedPrompt({ provider: getProvider("ollama"), stable, dynamic }).providerOptions).toEqual({})
  })

  it("derives a stable cache key that changes with the prefix", () => {
    const first = buildCachedPrompt({ provider: getProvider("openrouter"), stable, dynamic })
    const second = buildCachedPrompt({ provider: getProvider("openrouter"), stable, dynamic })
    const third = buildCachedPrompt({ provider: getProvider("openrouter"), stable: [...stable, "Extra"], dynamic })
    expect(second.cacheKey).toBe(first.cacheKey)
    expect(third.cacheKey).not.toBe(first.cacheKey)
  })

  it("caches the whole prompt when there is no dynamic content", () => {
    const cached = buildCachedPrompt({ provider: getProvider("anthropic"), stable, dynamic: [] })
    const parts = cached.system as Array<{ content: string }>
    expect(parts).toHaveLength(1)
    expect(cached.cachedPrefix).toBe(parts[0]?.content)
  })

  it("disables all cache hints when enabled: false (prompt-cache ablation)", () => {
    const openrouter = buildCachedPrompt({ provider: getProvider("openrouter"), stable, dynamic, enabled: false })
    expect(typeof openrouter.system).toBe("string")
    expect(openrouter.providerOptions).toEqual({})
    expect(openrouter.cacheKey).toBe("")
    expect(openrouter.cachedPrefix).toBe("")

    const anthropic = buildCachedPrompt({ provider: getProvider("anthropic"), stable, dynamic, enabled: false })
    expect(typeof anthropic.system).toBe("string")
    expect(anthropic.system).toBe([...stable, ...dynamic].join("\n\n"))
    expect(anthropic.providerOptions).toEqual({})
    expect(anthropic.cacheKey).toBe("")
  })

  it("enabled defaults to true so existing callers keep cache hints", () => {
    const cached = buildCachedPrompt({ provider: getProvider("openrouter"), stable, dynamic })
    expect(cached.providerOptions).toMatchObject({ openai: { promptCacheKey: cached.cacheKey } })
    expect(cached.cacheKey).not.toBe("")
  })
})

import { describe, expect, it, vi } from "vitest"
import { checkProviderHealth, clearProviderHealthCache } from "@/core/provider-health"
import { getProvider } from "@/core/providers"

describe("provider health", () => {
  it("checks model availability and caches the result", async () => {
    clearProviderHealthCache()
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "model-a" }] }), { status: 200, headers: { "content-type": "application/json" } }))
    const provider = getProvider("openrouter")
    const first = await checkProviderHealth(provider, "key", { fetcher })
    const second = await checkProviderHealth(provider, "key", { fetcher })
    expect(first).toMatchObject({ status: "healthy", discoveredModels: ["model-a"] })
    expect(second.status).toBe("healthy")
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("returns unavailable without throwing on connectivity failure", async () => {
    clearProviderHealthCache()
    const result = await checkProviderHealth(getProvider("ollama"), "local", { fetcher: async () => { throw new Error("offline") }, force: true })
    expect(result).toMatchObject({ status: "unavailable", reason: "offline" })
  })
})

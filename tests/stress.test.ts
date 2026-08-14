import { beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NimblBackend } from "@/core/backend"
import type { SessionStore, StoredSession } from "@/core/sessions"
import { runAgent } from "@/core/agent"

const streamText = vi.fn()
vi.mock("ai", () => ({
  stepCountIs: () => () => false,
  streamText,
  tool: <T>(definition: T) => definition,
}))
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: () => Object.assign(() => ({}), { chat: () => ({}), responses: () => ({}) }) }))
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: () => () => ({}) }))

beforeEach(() => streamText.mockReset())

function makeSession(seed: number): StoredSession {
  return { id: `s${seed}`, title: `Session ${seed}`, messages: [], agent: "build", created: Date.now() }
}

describe("stress: rapid TUI-style persistence", () => {
  it("survives 200 sequential single-process saves without a self-conflict", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-stress-saves-"))
    const backend = new NimblBackend(root, { watch: false })
    let store = backend.emptyStore()
    for (let i = 0; i < 200; i++) {
      const session = store.sessions[0]!
      store = backend.save({ ...store, sessions: [makeSession(i), ...store.sessions.slice(1)], activeID: `s${i}`, revision: backendRevision(backend) })
    }
    const loaded = backend.load()
    expect(loaded.store.sessions[0]!.id).toBe("s199")
  })

  it("auto-compaction keeps the session runnable with many long messages", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-stress-context-"))
    const longText = "x".repeat(2000)
    const messages = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant", text: longText + i }))
    streamText.mockImplementationOnce((config: any) => ({
      fullStream: { async *[Symbol.asyncIterator]() { yield { type: "text-delta", text: "done" } } },
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 2, totalTokens: 12 }),
    }))
    const result = await runAgent({
      root,
      provider: "openrouter",
      model: "deepseek/deepseek-v4-pro",
      apiKey: "key",
      mode: "build",
      messages,
      onEvent: () => {},
      requestApproval: async () => "once",
    })
    expect(result.text).toBe("done")
  })

  it("tool-loop context guard throws a clear error instead of hanging on overflow", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-stress-overflow-"))
    let guardError: Error | undefined
    streamText.mockImplementationOnce((config: any) => {
      // Invoke the guard directly: a huge dynamic payload over the window throws.
      try {
        config.prepareStep({ messages: [], instructions: "y".repeat(500_000) })
      } catch (error) {
        guardError = error as Error
      }
      return {
        fullStream: { async *[Symbol.asyncIterator]() { yield { type: "text-delta", text: "ok" } } },
        usage: Promise.resolve({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
      }
    })
    const result = await runAgent({
      root,
      provider: "openrouter",
      model: "deepseek/deepseek-v4-pro",
      apiKey: "key",
      mode: "build",
      messages: [{ role: "user", text: "hi" }],
      contextWindow: 1_000_000,
      onEvent: () => {},
      requestApproval: async () => "once",
    })
    expect(guardError?.message).toMatch(/context reached|window/)
    expect(result.text).toBe("ok")
  })

  it("retry backoff respects abort during the wait", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-stress-abortwait-"))
    const controller = new AbortController()
    const failure = Object.assign(new Error("rate limited"), { statusCode: 429 })
    streamText.mockReturnValueOnce({
      fullStream: { async *[Symbol.asyncIterator]() { throw failure } },
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
    })
    // Provide a fallback so any accidental 2nd attempt yields a stream too.
    streamText.mockReturnValue({
      fullStream: { async *[Symbol.asyncIterator]() { yield { type: "text-delta", text: "second" } } },
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
    })
    // Abort during the backoff wait → should reject fast with Interrupted by user.
    const start = Date.now()
    await expect(runAgent({
      root,
      provider: "openrouter",
      model: "deepseek/deepseek-v4-pro",
      apiKey: "key",
      mode: "build",
      messages: [{ role: "user", text: "hi" }],
      onEvent: () => {},
      onRetry: () => controller.abort(),
      requestApproval: async () => "once",
      abortSignal: controller.signal,
      retryDelayMs: 5000,
    })).rejects.toThrow(/Interrupted by user/)
    expect(Date.now() - start).toBeLessThan(1000)
  })
})

function backendRevision(backend: NimblBackend): number {
  // Mirror the TUI's storeRevision tracking by reading the persisted store.
  const loaded = backend.load()
  return loaded.store.revision
}

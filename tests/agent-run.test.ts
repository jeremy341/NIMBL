import { beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const streamText = vi.fn()
vi.mock("ai", () => ({
  stepCountIs: () => () => false,
  streamText,
  tool: <T>(definition: T) => definition,
}))
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: () => () => ({}) }))
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: () => () => ({}) }))

import { runAgent } from "@/core/agent"

describe("agent execution", () => {
  beforeEach(() => streamText.mockReset())

  it("retries a transient failure before producing output", async () => {
    const failure = Object.assign(new Error("rate limited"), { statusCode: 429 })
    streamText
      .mockReturnValueOnce({
        fullStream: { async *[Symbol.asyncIterator]() { throw failure } },
        usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
      })
      .mockReturnValueOnce({
        fullStream: { async *[Symbol.asyncIterator]() { yield { type: "text-delta", text: "Recovered" } } },
        usage: Promise.resolve({ inputTokens: 4, outputTokens: 2, totalTokens: 6 }),
      })
    const retries: string[] = []

    const result = await runAgent({
      root: mkdtempSync(join(tmpdir(), "nimbl-agent-")),
      provider: "openrouter",
      model: "test-model",
      apiKey: "test-key",
      mode: "build",
      messages: [{ role: "user", text: "hello" }],
      permissions: { "*": "allow" },
      requestApproval: async () => "once",
      onEvent: () => {},
      onRetry: ({ message }) => retries.push(message),
      retryDelayMs: 1,
    })

    expect(streamText).toHaveBeenCalledTimes(2)
    expect(retries).toEqual(["rate limited"])
    expect(result).toMatchObject({ text: "Recovered", usage: { totalTokens: 6 } })
  })

  it("asks before executing read tools when policy requires approval", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-agent-read-"))
    writeFileSync(join(root, "note.txt"), "approved content")
    const requestApproval = vi.fn(async () => "once" as const)
    streamText.mockImplementationOnce((config: any) => ({
      fullStream: {
        async *[Symbol.asyncIterator]() {
          const output = await config.tools.read.execute({ path: "note.txt" })
          yield { type: "text-delta", text: output }
        },
      },
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
    }))

    const result = await runAgent({
      root,
      provider: "openrouter",
      model: "test-model",
      apiKey: "test-key",
      mode: "build",
      messages: [{ role: "user", text: "read note" }],
      permissions: { read: "ask", "*": "allow" },
      requestApproval,
      onEvent: () => {},
    })

    expect(requestApproval).toHaveBeenCalledWith(expect.objectContaining({ tool: "read", target: "note.txt" }))
    expect(result.text).toContain("approved content")
  })

  it("blocks environment-file writes before requesting approval", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-agent-env-"))
    const requestApproval = vi.fn(async () => "once" as const)
    streamText.mockImplementationOnce((config: any) => ({
      fullStream: {
        async *[Symbol.asyncIterator]() {
          const output = await config.tools.write.execute({ path: ".env.local", content: "SECRET=value" })
          yield { type: "text-delta", text: output }
        },
      },
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
    }))

    const result = await runAgent({
      root,
      provider: "openrouter",
      model: "test-model",
      apiKey: "test-key",
      mode: "build",
      messages: [{ role: "user", text: "write env" }],
      permissions: { "*": "allow" },
      requestApproval,
      onEvent: () => {},
    })

    expect(requestApproval).not.toHaveBeenCalled()
    expect(result.text).toContain("Environment files are blocked")
    expect(existsSync(join(root, ".env.local"))).toBe(false)
  })

  it("does not expose modification tools outside Build mode", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-agent-plan-"))
    streamText.mockImplementationOnce((config: any) => ({
      fullStream: {
        async *[Symbol.asyncIterator]() {
          yield { type: "text-delta", text: Object.hasOwn(config.tools, "write") ? "unsafe" : "safe" }
        },
      },
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
    }))

    const result = await runAgent({
      root,
      provider: "openrouter",
      model: "test-model",
      apiKey: "test-key",
      mode: "plan",
      messages: [{ role: "user", text: "plan" }],
      permissions: { "*": "allow" },
      requestApproval: async () => "once",
      onEvent: () => {},
    })

    expect(result.text).toBe("safe")
  })
})

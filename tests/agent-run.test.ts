import { beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const streamText = vi.fn()
vi.mock("ai", () => ({
  stepCountIs: () => () => false,
  streamText,
  tool: <T>(definition: T) => definition,
}))
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: () => Object.assign(() => ({}), { chat: () => ({}), responses: () => ({}) }) }))
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
        usage: Promise.resolve({
          inputTokens: 4,
          inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 3, cacheWriteTokens: undefined },
          outputTokens: 2,
          outputTokenDetails: { textTokens: 1, reasoningTokens: 1 },
          totalTokens: 6,
        }),
        finalStep: Promise.resolve({ finishReason: "stop", rawFinishReason: "stop", callId: "call", response: { id: "response", headers: { "x-request-id": "request" } } }),
      })
    const retries: string[] = []

    const result = await runAgent({
      root: mkdtempSync(join(tmpdir(), "nimbl-agent-")),
      provider: "openrouter",
      model: "deepseek/deepseek-v4-pro",
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
    expect(streamText.mock.calls[1]?.[0]).toMatchObject({ maxOutputTokens: 8000 })
    expect(typeof streamText.mock.calls[1]?.[0].prepareStep).toBe("function")
    expect(retries).toEqual(["rate limited"])
    expect(result).toMatchObject({
      text: "Recovered",
      attempts: 2,
      finishReason: "stop",
      callId: "call",
      responseId: "response",
      requestId: "request",
      usage: { totalTokens: 6, cacheReadTokens: 3, textTokens: 1, reasoningTokens: 1 },
      budget: { fits: true, inputTotal: expect.any(Number), quality: "character-estimate" },
    })
  })

  it("stops after the maximum transient retry attempts", async () => {
    const failure = Object.assign(new Error("unavailable"), { statusCode: 503 })
    for (let attempt = 0; attempt < 3; attempt++) {
      streamText.mockReturnValueOnce({
        fullStream: { async *[Symbol.asyncIterator]() { throw failure } },
        usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
      })
    }
    const retries: number[] = []

    await expect(runAgent({
      root: mkdtempSync(join(tmpdir(), "nimbl-agent-retry-limit-")),
      provider: "openrouter",
      model: "deepseek/deepseek-v4-pro",
      apiKey: "test-key",
      mode: "build",
      messages: [{ role: "user", text: "hello" }],
      permissions: { "*": "allow" },
      requestApproval: async () => "once",
      onEvent: () => {},
      onRetry: ({ attempt }) => retries.push(attempt),
      retryDelayMs: 1,
    })).rejects.toThrow("unavailable")

    expect(streamText).toHaveBeenCalledTimes(3)
    expect(retries).toEqual([2, 3])
  })

  it("does not retry after streamed activity", async () => {
    const failure = Object.assign(new Error("connection reset"), { code: "ECONNRESET" })
    streamText.mockReturnValueOnce({
      fullStream: {
        async *[Symbol.asyncIterator]() {
          yield { type: "text-delta", text: "partial" }
          throw failure
        },
      },
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
    })

    await expect(runAgent({
      root: mkdtempSync(join(tmpdir(), "nimbl-agent-activity-")),
      provider: "openrouter",
      model: "deepseek/deepseek-v4-pro",
      apiKey: "test-key",
      mode: "build",
      messages: [{ role: "user", text: "hello" }],
      permissions: { "*": "allow" },
      requestApproval: async () => "once",
      onEvent: () => {},
      retryDelayMs: 1,
    })).rejects.toThrow("connection reset")

    expect(streamText).toHaveBeenCalledTimes(1)
  })

  it("aborts during retry backoff", async () => {
    const controller = new AbortController()
    const failure = Object.assign(new Error("rate limited"), { statusCode: 429 })
    streamText.mockReturnValueOnce({
      fullStream: { async *[Symbol.asyncIterator]() { throw failure } },
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
    })

    await expect(runAgent({
      root: mkdtempSync(join(tmpdir(), "nimbl-agent-abort-")),
      provider: "openrouter",
      model: "deepseek/deepseek-v4-pro",
      apiKey: "test-key",
      mode: "build",
      messages: [{ role: "user", text: "hello" }],
      permissions: { "*": "allow" },
      requestApproval: async () => "once",
      onEvent: () => {},
      abortSignal: controller.signal,
      onRetry: () => controller.abort(),
      retryDelayMs: 100,
    })).rejects.toThrow("Interrupted by user")

    expect(streamText).toHaveBeenCalledTimes(1)
  })

  it("does not retry malformed non-transient streams", async () => {
    streamText.mockImplementationOnce(() => { throw new SyntaxError("malformed stream") })

    await expect(runAgent({
      root: mkdtempSync(join(tmpdir(), "nimbl-agent-malformed-")),
      provider: "openrouter",
      model: "deepseek/deepseek-v4-pro",
      apiKey: "test-key",
      mode: "build",
      messages: [{ role: "user", text: "hello" }],
      permissions: { "*": "allow" },
      requestApproval: async () => "once",
      onEvent: () => {},
      retryDelayMs: 1,
    })).rejects.toThrow("malformed stream")

    expect(streamText).toHaveBeenCalledTimes(1)
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
      model: "deepseek/deepseek-v4-pro",
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
      model: "deepseek/deepseek-v4-pro",
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
      model: "deepseek/deepseek-v4-pro",
      apiKey: "test-key",
      mode: "plan",
      messages: [{ role: "user", text: "plan" }],
      permissions: { "*": "allow" },
      requestApproval: async () => "once",
      onEvent: () => {},
    })

    expect(result.text).toBe("safe")
  })

  it("blocks protected metadata and path escapes across local file tools", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-agent-protected-"))
    const outside = mkdtempSync(join(tmpdir(), "nimbl-agent-outside-"))
    mkdirSync(join(root, ".git"))
    mkdirSync(join(root, ".nimbl", "skills", "safe"), { recursive: true })
    writeFileSync(join(root, ".git", "config"), "secret-git")
    writeFileSync(join(root, ".git", "SKILL.md"), "escaped skill")
    writeFileSync(join(root, ".npmrc"), "secret-token")
    writeFileSync(join(root, "private.pem"), "private-key")
    writeFileSync(join(root, ".nimbl", "sessions.json"), "secret-session")
    writeFileSync(join(root, ".nimbl", "skills", "safe", "SKILL.md"), "safe skill")
    symlinkSync(join(root, ".git"), join(root, ".nimbl", "skills", "evil"), "junction")
    symlinkSync(outside, join(root, "linked"), "junction")
    const requestApproval = vi.fn(async () => "once" as const)
    let globOutput = ""

    streamText.mockImplementationOnce((config: any) => ({
      fullStream: {
        async *[Symbol.asyncIterator]() {
          const outputs = await Promise.all([
            config.tools.read.execute({ path: ".git/config" }),
            config.tools.write.execute({ path: ".npmrc", content: "changed" }),
            config.tools.edit.execute({ path: "private.pem", oldText: "private", newText: "public" }),
            config.tools.apply_patch.execute({ patch: "--- a/.nimbl/sessions.json\n+++ b/.nimbl/sessions.json\n@@ -1 +1 @@\n-secret-session\n+changed\n" }),
            config.tools.read.execute({ path: "linked/secret.txt" }),
            config.tools.write.execute({ path: "../escaped.txt", content: "escaped" }),
            config.tools.edit.execute({ path: "linked/secret.txt", oldText: "secret", newText: "changed" }),
            config.tools.apply_patch.execute({ patch: "--- a/../escaped.txt\n+++ b/../escaped.txt\n@@ -0,0 +1 @@\n+escaped\n" }),
            config.tools.glob.execute({ pattern: "**/*" }).then((output: string) => (globOutput = output)),
            config.tools.grep.execute({ query: "secret-token", pattern: "**/*" }),
            config.tools.skill.execute({ name: "safe" }),
            config.tools.skill.execute({ name: "evil" }),
          ])
          yield { type: "text-delta", text: outputs.join("\n---\n") }
        },
      },
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
    }))

    const result = await runAgent({
      root,
      provider: "openrouter",
      model: "deepseek/deepseek-v4-pro",
      apiKey: "test-key",
      mode: "build",
      messages: [{ role: "user", text: "inspect files" }],
      permissions: { "*": "allow" },
      requestApproval,
      onEvent: () => {},
    })

    expect(result.text).not.toContain("secret-git")
    expect(result.text).not.toContain("secret-token")
    expect(result.text).not.toContain("private-key")
    expect(result.text).not.toContain("secret-session")
    expect(globOutput).not.toContain("private.pem")
    expect(globOutput).not.toContain(".git")
    expect(globOutput).not.toContain(".nimbl")
    expect(result.text).toContain("safe skill")
    expect(result.text.match(/blocked by NIMBL's default safety policy/g)).toHaveLength(4)
    expect(result.text.match(/outside this project/g)).toHaveLength(4)
    expect(result.text).toContain("canonical project skill file")
    expect(readFileSync(join(root, ".npmrc"), "utf8")).toBe("secret-token")
    expect(existsSync(join(root, "escaped.txt"))).toBe(false)
    expect(requestApproval).not.toHaveBeenCalled()
  })
})

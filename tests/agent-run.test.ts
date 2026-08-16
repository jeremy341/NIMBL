import { beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const streamText = vi.fn()
const stepCountIs = vi.fn(() => () => false)
vi.mock("ai", () => ({
  stepCountIs,
  streamText,
  tool: <T>(definition: T) => definition,
}))
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: () => Object.assign(() => ({}), { chat: () => ({}), responses: () => ({}) }) }))
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: () => () => ({}) }))

import { runAgent, countReadsSinceEdit, pruneOldToolResults, trimMessagesToWindow } from "@/core/agent"

describe("agent execution", () => {
  beforeEach(() => {
    streamText.mockReset()
    stepCountIs.mockClear()
  })

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
      budget: { fits: true, inputTotal: expect.any(Number), quality: "family-estimate" },
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

  it("feeds a rejection message back to the model", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-agent-rejectmsg-"))
    writeFileSync(join(root, "note.txt"), "approved content")
    const requestApproval = vi.fn(async () => ({ reject: "Use a different file" }) as const)
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

    expect(result.text).toContain("Use a different file")
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
      permissions: { "*": "allow", external_directory: "deny" },
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
    expect(result.text.match(/outside this project/g)).toHaveLength(1)
    expect(result.text.match(/blocked by project policy/g)).toHaveLength(3)
    expect(result.text).toContain("canonical project skill file")
    expect(readFileSync(join(root, ".npmrc"), "utf8")).toBe("secret-token")
    expect(existsSync(join(root, "escaped.txt"))).toBe(false)
    expect(requestApproval).not.toHaveBeenCalled()
  })

  it("asks for external_directory permission before reading outside the project", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-agent-ext-"))
    const outside = mkdtempSync(join(tmpdir(), "nimbl-agent-outside-"))
    writeFileSync(join(outside, "notes.txt"), "outside content")
    const requestApproval = vi.fn(async () => "once" as const)

    streamText.mockImplementationOnce((config: any) => ({
      fullStream: {
        async *[Symbol.asyncIterator]() {
          const output = await config.tools.read.execute({ path: join(outside, "notes.txt") })
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
      messages: [{ role: "user", text: "read notes" }],
      permissions: { "*": "allow" },
      requestApproval,
      onEvent: () => {},
    })

    expect(requestApproval).toHaveBeenCalledWith(expect.objectContaining({ tool: "external_directory", target: outside }))
    expect(result.text).toContain("outside content")
  })

  it("rejects external_directory reads when the user rejects the prompt", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-agent-extrej-"))
    const outside = mkdtempSync(join(tmpdir(), "nimbl-agent-outsiderej-"))
    writeFileSync(join(outside, "notes.txt"), "outside content")
    const requestApproval = vi.fn(async () => "reject" as const)

    streamText.mockImplementationOnce((config: any) => ({
      fullStream: {
        async *[Symbol.asyncIterator]() {
          const output = await config.tools.read.execute({ path: join(outside, "notes.txt") })
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
      messages: [{ role: "user", text: "read notes" }],
      permissions: { "*": "allow" },
      requestApproval,
      onEvent: () => {},
    })

    expect(requestApproval).toHaveBeenCalledWith(expect.objectContaining({ tool: "external_directory", target: outside }))
    expect(result.text).toContain("rejected access")
  })

  it("asks the user before continuing past a repeated tool call", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-agent-doom-"))
    const requestApproval = vi.fn(async () => "once" as const)
    const taskEvents: string[] = []

    streamText.mockImplementationOnce((config: any) => ({
      fullStream: {
        async *[Symbol.asyncIterator]() {
          for (let i = 0; i < 2; i++) {
            yield { type: "tool-call", toolName: "grep", input: { query: "foo" }, toolCallId: `call-${i}` }
          }
          yield { type: "text-delta", text: "done" }
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
      permissions: { "*": "allow", doom_loop: "ask" },
      requestApproval,
      onEvent: () => {},
      onTaskEvent: (event) => taskEvents.push(`${event.type}:${event.detail}`),
      doomLoopThreshold: 2,
    })

    expect(requestApproval).toHaveBeenCalledWith(expect.objectContaining({ tool: "doom_loop", target: "grep" }))
    expect(result.text).toContain("done")
  })

  it("continues past an approved repeated tool call without hard-stopping", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-agent-doomok-"))
    const requestApproval = vi.fn(async () => "once" as const)

    streamText.mockImplementationOnce((config: any) => ({
      fullStream: {
        async *[Symbol.asyncIterator]() {
          for (let i = 0; i < 6; i++) {
            yield { type: "tool-call", toolName: "grep", input: { query: "foo" }, toolCallId: `call-${i}` }
          }
          yield { type: "text-delta", text: "done" }
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
      permissions: { "*": "allow", doom_loop: "ask" },
      requestApproval,
      onEvent: () => {},
      doomLoopThreshold: 2,
    })

    // Approval must let the run continue (previously it hard-stopped one call later).
    expect(result.text).toContain("done")
    expect(requestApproval).toHaveBeenCalledWith(expect.objectContaining({ tool: "doom_loop", target: "grep" }))
  })

  it("stops after a repeated tool call when the user does not approve", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-agent-doomrej-"))
    const requestApproval = vi.fn(async () => "reject" as const)

    streamText.mockImplementationOnce((config: any) => ({
      fullStream: {
        async *[Symbol.asyncIterator]() {
          for (let i = 0; i < 3; i++) {
            yield { type: "tool-call", toolName: "grep", input: { query: "foo" }, toolCallId: `call-${i}` }
          }
          yield { type: "text-delta", text: "done" }
        },
      },
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
    }))

    await expect(runAgent({
      root,
      provider: "openrouter",
      model: "deepseek/deepseek-v4-pro",
      apiKey: "test-key",
      mode: "build",
      messages: [{ role: "user", text: "read note" }],
      permissions: { "*": "allow", doom_loop: "ask" },
      requestApproval,
      onEvent: () => {},
      doomLoopThreshold: 2,
    })).rejects.toThrow("rejected continuing after repeated tool calls")
  })

  it("hard-rejects a doom loop when permission is deny", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-agent-doomdeny-"))
    const requestApproval = vi.fn(async () => "once" as const)

    streamText.mockImplementationOnce((config: any) => ({
      fullStream: {
        async *[Symbol.asyncIterator]() {
          for (let i = 0; i < 4; i++) {
            yield { type: "tool-call", toolName: "grep", input: { query: "foo" }, toolCallId: `call-${i}` }
          }
          yield { type: "text-delta", text: "done" }
        },
      },
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
    }))

    await expect(runAgent({
      root,
      provider: "openrouter",
      model: "deepseek/deepseek-v4-pro",
      apiKey: "test-key",
      mode: "build",
      messages: [{ role: "user", text: "read note" }],
      permissions: { "*": "allow", doom_loop: "deny" },
      requestApproval,
      onEvent: () => {},
      doomLoopThreshold: 2,
    })).rejects.toThrow("blocked by project policy")
    // No approval prompt should be issued when policy is a hard deny.
    expect(requestApproval).not.toHaveBeenCalled()
  })

  it("does not treat repeated read calls as a doom loop (read-gate is the audit guard)", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-agent-doomread-"))
    const requestApproval = vi.fn(async () => "once" as const)

    streamText.mockImplementationOnce((config: any) => ({
      fullStream: {
        async *[Symbol.asyncIterator]() {
          for (let i = 0; i < 5; i++) {
            yield { type: "tool-call", toolName: "read", input: { path: "note.txt" }, toolCallId: `call-${i}` }
          }
          yield { type: "text-delta", text: "done" }
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
      permissions: { "*": "allow", doom_loop: "deny" },
      requestApproval,
      onEvent: () => {},
      doomLoopThreshold: 2,
    })

    expect(result.text).toBe("done")
    expect(requestApproval).not.toHaveBeenCalled()
  })

  it("does not treat repeated bash verification calls as a doom loop", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-agent-doombash-"))
    const requestApproval = vi.fn(async () => "once" as const)

    streamText.mockImplementationOnce((config: any) => ({
      fullStream: {
        async *[Symbol.asyncIterator]() {
          for (let i = 0; i < 6; i++) {
            yield { type: "tool-call", toolName: "bash", input: { command: "bun test" }, toolCallId: `call-${i}` }
          }
          yield { type: "text-delta", text: "done" }
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
      messages: [{ role: "user", text: "run tests until green" }],
      permissions: { "*": "allow", doom_loop: "deny" },
      requestApproval,
      onEvent: () => {},
      doomLoopThreshold: 2,
    })

    expect(result.text).toBe("done")
    expect(requestApproval).not.toHaveBeenCalled()
  })

  it("counts reads since the last edit for the read-to-edit budget", () => {
    expect(countReadsSinceEdit([
      ["read", "grep", "glob"],
      ["read"],
      ["edit"],
      ["read", "read"],
    ])).toBe(2)
    expect(countReadsSinceEdit([
      ["read", "write"],
      ["grep", "grep"],
    ])).toBe(2)
    expect(countReadsSinceEdit([["edit"], ["edit"]])).toBe(0)
    expect(countReadsSinceEdit([])).toBe(0)
  })

  it("hard-blocks reads once the investigation budget is exhausted", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-agent-gate-"))
    writeFileSync(join(root, "note.txt"), "content")
    writeFileSync(join(root, "note2.txt"), "content2")
    let readOutput = ""

    streamText.mockImplementationOnce((config: any) => ({
      fullStream: {
        async *[Symbol.asyncIterator]() {
          const outputs = []
          for (let i = 0; i < 14; i++) {
            // Sequential calls (a new step each) let the counter accumulate; a
            // real audit loop reads across steps, not within one parallel burst.
            outputs.push(await config.tools.read.execute({ path: i % 2 ? "note2.txt" : "note.txt" }))
          }
          readOutput = outputs.join("\n")
          yield { type: "text-delta", text: "done" }
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
      messages: [{ role: "user", text: "read files" }],
      permissions: { "*": "allow" },
      requestApproval: async () => "once",
      onEvent: () => {},
      readBudget: 10,
    })

    // Reads 1-2 of each file return content; reads 3+ return the repeated-read
    // nudge; reads 11-14 are blocked by the investigation budget gate.
    expect(readOutput.match(/Investigation budget reached/g)).toHaveLength(4)
    expect(readOutput.match(/content2/g)).toHaveLength(2)
    expect(readOutput.match(/was already read/g)).toHaveLength(6)
  })

  it("nudges instead of re-dumping content on repeated identical reads", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-agent-reread-"))
    writeFileSync(join(root, "note.txt"), "content")
    let readOutput = ""

    streamText.mockImplementationOnce((config: any) => ({
      fullStream: {
        async *[Symbol.asyncIterator]() {
          const outputs = []
          for (let i = 0; i < 5; i++) {
            outputs.push(await config.tools.read.execute({ path: "note.txt" }))
          }
          readOutput = outputs.join("\n")
          yield { type: "text-delta", text: "done" }
        },
      },
      usage: Promise.resolve({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
    }))

    await runAgent({
      root,
      provider: "openrouter",
      model: "deepseek/deepseek-v4-pro",
      apiKey: "test-key",
      mode: "build",
      messages: [{ role: "user", text: "read note" }],
      permissions: { "*": "allow" },
      requestApproval: async () => "once",
      onEvent: () => {},
    })

    // Reads 1-2 return content; reads 3-5 return the repeated-read directive.
    expect(readOutput.match(/was already read/g)).toHaveLength(3)
    expect(readOutput.match(/content/g)).toHaveLength(2)
  })

  it("does not hard-block reads outside Build mode", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-agent-gate-plan-"))
    writeFileSync(join(root, "note.txt"), "content")
    let readOutput = ""

    streamText.mockImplementationOnce((config: any) => ({
      fullStream: {
        async *[Symbol.asyncIterator]() {
          const outputs = await Promise.all([
            config.tools.read.execute({ path: "note.txt" }),
            config.tools.read.execute({ path: "note.txt" }),
            config.tools.read.execute({ path: "note.txt" }),
            config.tools.read.execute({ path: "note.txt" }),
            config.tools.read.execute({ path: "note.txt" }),
            config.tools.read.execute({ path: "note.txt" }),
            config.tools.read.execute({ path: "note.txt" }),
            config.tools.read.execute({ path: "note.txt" }),
            config.tools.read.execute({ path: "note.txt" }),
            config.tools.read.execute({ path: "note.txt" }),
            config.tools.read.execute({ path: "note.txt" }),
            config.tools.read.execute({ path: "note.txt" }),
            config.tools.read.execute({ path: "note.txt" }),
            config.tools.read.execute({ path: "note.txt" }),
          ])
          readOutput = outputs.join("\n")
          yield { type: "text-delta", text: "done" }
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
      messages: [{ role: "user", text: "plan reads" }],
      permissions: { "*": "allow" },
      requestApproval: async () => "once",
      onEvent: () => {},
      readBudget: 10,
    })

    expect(readOutput).not.toMatch(/Investigation budget reached/)
    expect(readOutput).toContain("content")
  })

  it("retries a step-cap cut-off mid-work with a continuation prompt", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-agent-steplimit-"))
    streamText
      .mockReturnValueOnce({
        fullStream: {
          async *[Symbol.asyncIterator]() {
            yield { type: "reasoning-delta", text: "thinking" }
            yield { type: "tool-call", toolName: "read", input: { path: "note.txt" }, toolCallId: "call-1" }
          },
        },
        usage: Promise.resolve({ inputTokens: 5, outputTokens: 1, totalTokens: 6 }),
        finalStep: Promise.resolve({ finishReason: "tool-calls", rawFinishReason: "tool-calls", callId: "call", response: { id: "response", headers: { "x-request-id": "request" } } }),
        responseMessages: Promise.resolve([
          { role: "assistant", content: [{ type: "text", text: "I was mid-work" }] },
          { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", output: "file content" }] },
        ]),
      })
      .mockReturnValueOnce({
        fullStream: { async *[Symbol.asyncIterator]() { yield { type: "text-delta", text: "Finished the fix." } } },
        usage: Promise.resolve({ inputTokens: 6, outputTokens: 2, totalTokens: 8 }),
        finalStep: Promise.resolve({ finishReason: "stop", rawFinishReason: "stop", callId: "call", response: { id: "response", headers: { "x-request-id": "request" } } }),
      })

    const result = await runAgent({
      root,
      provider: "openrouter",
      model: "deepseek/deepseek-v4-pro",
      apiKey: "test-key",
      mode: "build",
      messages: [{ role: "user", text: "fix the bug" }],
      permissions: { "*": "allow" },
      requestApproval: async () => "once",
      onEvent: () => {},
      maxAttempts: 2,
    })

    expect(streamText).toHaveBeenCalledTimes(2)
    // The second call must include the continuation prompt.
    const secondMessages = streamText.mock.calls[1]?.[0]?.messages ?? []
    const continuation = secondMessages.find((m: any) => typeof m === "object" && m?.role === "user" && /ran out of tool steps/.test(m?.content ?? ""))
    expect(continuation).toBeTruthy()
    // The accumulated tool messages from attempt 1 must carry into attempt 2.
    expect(secondMessages.some((m: any) => m?.role === "tool")).toBe(true)
    expect(result).toMatchObject({ text: "Finished the fix.", attempts: 2, finishReason: "stop" })
  })

  it("does not retry a clean stop at the step cap", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-agent-steplimit-clean-"))
    streamText.mockReturnValueOnce({
      fullStream: { async *[Symbol.asyncIterator]() { yield { type: "text-delta", text: "Done cleanly." } } },
      usage: Promise.resolve({ inputTokens: 5, outputTokens: 1, totalTokens: 6 }),
      finalStep: Promise.resolve({ finishReason: "stop", rawFinishReason: "stop", callId: "call", response: { id: "response", headers: { "x-request-id": "request" } } }),
    })

    const result = await runAgent({
      root,
      provider: "openrouter",
      model: "deepseek/deepseek-v4-pro",
      apiKey: "test-key",
      mode: "build",
      messages: [{ role: "user", text: "do a thing" }],
      permissions: { "*": "allow" },
      requestApproval: async () => "once",
      onEvent: () => {},
      maxAttempts: 2,
    })

    expect(streamText).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ text: "Done cleanly.", attempts: 1 })
  })

  it("prunes old long tool results but keeps the tail, diffs, and errors", () => {
    const tool = (callId: string, output: unknown, toolName = "read") => ({ role: "tool", content: [{ type: "tool-result", toolCallId: callId, toolName, output }] })
    const messages = [
      { role: "user", content: "start" },
      tool("c1", "x".repeat(500)),
      tool("c2", "y".repeat(500)),
      tool("c3", "z".repeat(500)),
      tool("c4", "--- a/x\n+++ b/x\n", "edit"),
      tool("c5", "Error: boom"),
      tool("c6", "tail-short"),
      tool("c7", "tail-long".repeat(100)),
    ]

    const pruned = pruneOldToolResults(messages, 2, 200) as Array<{ content: Array<{ type: string; output?: string | { type: string; value: string }; toolName?: string }> }>
    // Old read outputs are stubbed; the tool message itself is preserved. The
    // stub keeps the AI SDK v7 structured output shape ({type:"text",value}).
    const stubOf = (index: number) => {
      const output = pruned[index]!.content[0]!.output ?? ""
      return typeof output === "string" ? output : output.value
    }
    expect(stubOf(1)).toContain("[Old read output cleared")
    expect(stubOf(2)).toContain("[Old read output cleared")
    expect(stubOf(3)).toContain("[Old read output cleared")
    // The last 2 tool messages are the protected tail.
    expect(pruned[6]!.content[0]!.output).toBe("tail-short")
    expect(pruned[7]!.content[0]!.output).toBe("tail-long".repeat(100))
    // Diffs and errors are never stubbed.
    expect(pruned[4]!.content[0]!.output).toContain("--- a/x")
    expect(pruned[5]!.content[0]!.output).toBe("Error: boom")
  })

  it("returns the same array when nothing is pruned", () => {
    const messages = [
      { role: "user", content: "start" },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "c1", toolName: "read", output: "short" }] },
    ]
    expect(pruneOldToolResults(messages, 6, 200)).toBe(messages)
  })

  describe("A.1 graceful context overflow (trimMessagesToWindow)", () => {
    const chars = (text: string) => text.length

    it("keeps a short history unchanged", () => {
      const messages = [{ role: "user", content: "hi" }, { role: "assistant", content: "ok" }]
      expect(trimMessagesToWindow(messages, 1_000_000, chars)).toBe(messages)
    })

    it("drops the oldest messages while keeping the first user goal and a recent tail", () => {
      const messages = Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `message ${i} `.repeat(50),
      }))
      const budget = chars(JSON.stringify([messages[0], messages[19]])) + 10
      const trimmed = trimMessagesToWindow(messages, budget, chars) as Array<{ role: string; content: string }>
      expect(trimmed.length).toBeLessThan(messages.length)
      expect(trimmed[0]).toBe(messages[0])
      expect(trimmed[trimmed.length - 1]).toBe(messages[messages.length - 1])
    })

    it("returns the input unchanged when even the irreducible core cannot fit", () => {
      const messages = [{ role: "user", content: "only" }, { role: "assistant", content: "two" }]
      expect(trimMessagesToWindow(messages, 1, chars)).toBe(messages)
    })
  })

  describe("Sprint C per-class step budgets", () => {
    const base = {
      root: mkdtempSync(join(tmpdir(), "nimbl-agent-budget-")),
      provider: "openrouter",
      model: "deepseek/deepseek-v4-pro",
      apiKey: "test-key",
      mode: "build" as const,
      permissions: { "*": "allow" } as const,
      requestApproval: async () => "once" as const,
      onEvent: () => {},
    }
    const done = (text: string) => ({
      fullStream: { async *[Symbol.asyncIterator]() { yield { type: "text-delta", text } } },
      usage: Promise.resolve({ inputTokens: 5, outputTokens: 1, totalTokens: 6 }),
      finalStep: Promise.resolve({ finishReason: "stop", rawFinishReason: "stop", callId: "call", response: { id: "response", headers: { "x-request-id": "request" } } }),
    })

    it("gives a long-horizon prompt the family budget and guidance", async () => {
      const prompt = "The storefront has several subtle bugs (subtotal math, reservation oversell). Work top-down: audit the domains, fix all of them so the hidden suites pass."
      streamText.mockReturnValueOnce(done("done"))
      const result = await runAgent({ ...base, messages: [{ role: "user", text: prompt }] })

      expect(stepCountIs).toHaveBeenLastCalledWith(100)
      expect(JSON.stringify(streamText.mock.calls[0]?.[0]?.system)).toContain("long-horizon task")
      expect(result).toMatchObject({ family: "long-horizon", maxToolSteps: 100 })
    })

    it("caps a classified budget by an explicit maxToolSteps ceiling", async () => {
      const prompt = "The storefront has several subtle bugs (subtotal math, reservation oversell). Work top-down: audit the domains, fix all of them so the hidden suites pass."
      streamText.mockReturnValueOnce(done("done"))
      const result = await runAgent({ ...base, messages: [{ role: "user", text: prompt }], maxToolSteps: 20 })

      expect(stepCountIs).toHaveBeenLastCalledWith(20)
      expect(result).toMatchObject({ family: "long-horizon", maxToolSteps: 20 })
    })

    it("keeps easy-family prompts cheap and guidance-free", async () => {
      const prompt = "applyDiscount in src/domains/pricing/discount.ts divides by 1000 instead of 100. Fix the math so a 10% discount on 100 yields 90."
      streamText.mockReturnValueOnce(done("done"))
      await runAgent({ ...base, messages: [{ role: "user", text: prompt }] })

      expect(stepCountIs).toHaveBeenLastCalledWith(12)
      const system = JSON.stringify(streamText.mock.calls[0]?.[0]?.system)
      expect(system).not.toContain("long-horizon task")
      expect(system).not.toContain("This task is driven by running tests")
    })

    it("honors benchmark ground-truth tags over the prompt text", async () => {
      streamText.mockReturnValueOnce(done("done"))
      await runAgent({ ...base, messages: [{ role: "user", text: "fix the math" }], taskTags: ["shell-loop", "bug-fix"] })

      expect(stepCountIs).toHaveBeenLastCalledWith(50)
    })

    it("shares the classified budget across a step-cap continuation (not a fresh budget)", async () => {
      const prompt = "There is no unit coverage for money rounding in tests/unit. Write tests/unit/money.test.ts asserting round(2.567, 2) === 2.57, then run the suite."
      streamText
        .mockReturnValueOnce({
          fullStream: {
            async *[Symbol.asyncIterator]() {
              yield { type: "reasoning-delta", text: "thinking" }
              yield { type: "tool-call", toolName: "read", input: { path: "note.txt" }, toolCallId: "call-1" }
            },
          },
          usage: Promise.resolve({ inputTokens: 5, outputTokens: 1, totalTokens: 6 }),
          finalStep: Promise.resolve({ finishReason: "tool-calls", rawFinishReason: "tool-calls", callId: "call", response: { id: "response", headers: { "x-request-id": "request" } } }),
          responseMessages: Promise.resolve([
            { role: "assistant", content: [{ type: "text", text: "I was mid-work" }] },
            { role: "tool", content: [{ type: "tool-result", toolCallId: "call-1", output: "file content" }] },
          ]),
        })
        .mockReturnValueOnce(done("Finished the fix."))

      const result = await runAgent({ ...base, messages: [{ role: "user", text: prompt }], maxAttempts: 2 })

      // Test-writing family = 16 steps total; attempt 1 consumed 1 tool step, so
      // attempt 2 is bounded to the remaining 15, not a fresh 16.
      expect((stepCountIs.mock.calls as unknown as Array<[number]>).map(([budget]) => budget)).toEqual([16, 15])
      expect(result).toMatchObject({ text: "Finished the fix.", attempts: 2, family: "test-writing", maxToolSteps: 16 })
    })
  })
})

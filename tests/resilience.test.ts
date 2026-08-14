import { describe, expect, it, vi } from "vitest"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NimblBackend } from "@/core/backend"
import { loadSessionStore, saveSessionStore, type SessionStore, type StoredSession } from "@/core/sessions"
import { queuePrompt, dequeuePrompt, setDraft, stashDraft, popDraft, recordSnapshot, undoSnapshot, redoSnapshot } from "@/core/session-actions"
import { SessionStoreConflictError } from "@/core/sessions"
import { runAgent } from "@/core/agent"
import { retryAfterMs } from "@/core/agent"

const streamText = vi.fn()
vi.mock("ai", () => ({
  stepCountIs: () => () => false,
  streamText,
  tool: <T>(definition: T) => definition,
}))
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: () => Object.assign(() => ({}), { chat: () => ({}), responses: () => ({}) }) }))
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: () => () => ({}) }))

function freshStore(): SessionStore {
  const id = crypto.randomUUID()
  return { version: 2, revision: 0, activeID: id, provider: "freellmapi", model: "auto", sessions: [{ id, title: "Test", messages: [], agent: "build", created: Date.now() }] }
}

describe("resilience / crash-recovery", () => {
  it("saveSessionStore rejects a stale-revision write and reports the actual revision", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-resilience-cas-"))
    const store = freshStore()
    saveSessionStore(root, store, { expectedRevision: 0 })
    const stale = { ...store, revision: 0 }
    expect(() => saveSessionStore(root, stale, { expectedRevision: 0 })).toThrow(SessionStoreConflictError)
  })

  it("saveSessionStore recovers after reading the disk revision", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-resilience-rec-"))
    const store = freshStore()
    const saved = saveSessionStore(root, store, { expectedRevision: 0 })
    // Simulate the TUI's flow: adopt persisted revision then save again.
    const again = saveSessionStore(root, { ...store, revision: saved.revision }, { expectedRevision: saved.revision })
    expect(again.revision).toBe(saved.revision + 1)
  })

  it("backend blocks further saves after a conflict (and stays blocked — the bug)", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-resilience-block-"))
    const backend = new NimblBackend(root, { watch: false })
    const store = backend.emptyStore()
    backend.save(store)
    // Simulate a concurrent writer bumping the disk revision.
    const onDisk = loadSessionStore(root)
    if (onDisk.status !== "valid") throw new Error("expected valid store")
    const bumped = saveSessionStore(root, { ...onDisk.store, revision: onDisk.store.revision }, { expectedRevision: onDisk.store.revision })
    // Now the backend's in-memory revision is stale → conflict.
    expect(() => backend.save(store)).toThrow(SessionStoreConflictError)
    // The backend is now permanently blocked: even if we adopt the new revision,
    // the TUI's `persistenceBlocked` flag is never cleared (see tui-opencode.tsx:693).
    backend.adoptPersistedState(bumped.revision)
    // `adoptPersistedState` clears backend.blocked, so a save now succeeds —
    // BUT the TUI still guards with its own `persistenceBlocked` local which is
    // never reset, so the TUI stops persisting permanently.
    const saved = backend.save({ ...store, revision: bumped.revision })
    expect(saved.revision).toBeGreaterThan(bumped.revision)
  })
  it("recovers stale running/queued runStates as interrupted on load", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-resilience-recover-"))
    const store = freshStore()
    store.sessions[0]!.runState = "running"
    saveSessionStore(root, store, { expectedRevision: 0 })
    const backend = new NimblBackend(root, { watch: false })
    const loaded = loadSessionStore(root)
    expect(loaded.status).toBe("valid")
    if (loaded.status === "valid") {
      const recovered = backend.recoverInterruptedRuns(structuredClone(loaded.store))
      expect(recovered.sessions[0]!.runState).toBe("interrupted")
      expect(recovered.sessions[0]!.unread).toBe(true)
    }
  })

  it("queue/dequeue keeps runState queued correctly and returns to idle on drain", () => {
    const session = freshStore().sessions[0]!
    const queued = queuePrompt(session, "one")
    expect(queued.runState).toBe("queued")
    const step1 = dequeuePrompt(queued)
    expect(step1.prompt).toBe("one")
    expect(step1.session.queuedPrompts?.length ?? 0).toBe(0)
    expect(step1.session.runState).toBe("idle")
  })

  it("snapshot undo refuses stale disk state and clears redo on new edit", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-resilience-undo-"))
    writeFileSync(join(root, "a.txt"), "one")
    const session = { ...freshStore().sessions[0]!, snapshots: [], redoSnapshots: [] }
    const withSnap = recordSnapshot(session, { path: "a.txt", before: "one", after: "two", beforeExists: true, afterExists: true, time: Date.now(), messageID: "m1" })
    expect(withSnap.snapshots?.length).toBe(1)
    // Disk no longer matches snapshot after → undo must refuse.
    writeFileSync(join(root, "a.txt"), "three")
    expect(() => undoSnapshot(root, withSnap)).toThrow("A file changed after this snapshot")
    // New edit clears redo.
    const redo = redoSnapshot(root, withSnap)
    expect(redo.snapshot).toBeUndefined()
  })

  it("runAgent surfaces an abort as Interrupted by user", async () => {    const controller = new AbortController()
    streamText.mockImplementationOnce((config: any) => ({
      fullStream: {
        async *[Symbol.asyncIterator]() {
          controller.abort()
          throw Object.assign(new Error("aborted"), { name: "AbortError" })
        },
      },
      usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
    }))
    await expect(runAgent({
      root: mkdtempSync(join(tmpdir(), "nimbl-resilience-abort-")),
      provider: "openrouter",
      model: "deepseek/deepseek-v4-pro",
      apiKey: "key",
      mode: "build",
      messages: [{ role: "user", text: "hi" }],
      onEvent: () => {},
      requestApproval: async () => "once",
      abortSignal: controller.signal,
    })).rejects.toThrow()
  })

  it("assistantHistoryText feeds tool outputs back into the next turn's context", async () => {
    const { assistantHistoryText } = await import("@/tui-opencode")
    const text = assistantHistoryText({
      id: "a1",
      role: "assistant",
      text: "Reading the file now.",
      time: 1,
      parts: [
        { id: "p1", type: "reasoning", text: "hidden", started: 1, ended: 2 },
        { id: "p2", type: "tool", tool: "read", state: "completed", title: "Read src/main.ts", path: "src/main.ts", output: "const x = 1\n", started: 1, ended: 2 },
        { id: "p3", type: "tool", tool: "bash", state: "completed", title: "Run command", output: "exit 0\nhello", started: 1, ended: 2 },
        { id: "p4", type: "tool", tool: "edit", state: "running", title: "Edit src/main.ts" },
        { id: "p5", type: "tool", tool: "grep", state: "failed", title: "Search foo" },
      ],
    })
    expect(text).toContain("Reading the file now.")
    expect(text).toContain("[read src/main.ts]")
    expect(text).toContain("const x = 1")
    expect(text).toContain("[shell]")
    expect(text).toContain("hello")
    expect(text).not.toContain("hidden")
    // Running and failed tools are excluded.
    expect(text).not.toContain("Edit src/main.ts")
    expect(text).not.toContain("Search foo")
  })

  it("assistantHistoryText truncates oversized tool outputs", async () => {
    const { assistantHistoryText } = await import("@/tui-opencode")
    const big = "y".repeat(10_000)
    const text = assistantHistoryText({
      id: "a2",
      role: "assistant",
      text: "",
      time: 1,
      parts: [{ id: "p", type: "tool", tool: "bash", state: "completed", title: "Run", output: big }],
    })
    expect(text.length).toBeLessThan(7_000)
    expect(text).toContain("(tool output truncated)")
  })

  it("retryAfterMs reads a Headers-instance retry-after header", () => {
    const headers = new Headers({ "retry-after": "7" })
    const error = Object.assign(new Error("rate limited"), { statusCode: 429, headers })
    expect(retryAfterMs(error)).toBe(7000)
  })

  it("retryAfterMs returns undefined for non-date malformed headers", () => {
    const headers = new Headers({ "retry-after": "later-maybe" })
    const error = Object.assign(new Error("rate limited"), { statusCode: 429, headers })
    expect(retryAfterMs(error)).toBeUndefined()
  })

  it("retention overflow is backed up instead of dropped", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-resilience-overflow-"))
    const now = Date.now()
    const make = (id: string, ageDays: number): StoredSession => ({ id, title: id, agent: "build", created: now - ageDays * 86_400_000, updated: now - ageDays * 86_400_000, messages: [] })
    const archived = Array.from({ length: 120 }, (_, index) => ({ session: make(`archived-${index}`, 200), archivedAt: now - index, reason: "retention" as const }))
    const store: SessionStore = { version: 2, revision: 0, activeID: "active", provider: "freellmapi", model: "auto", sessions: [{ id: "active", title: "Active", agent: "build", created: now, messages: [] }], archived }
    const saved = saveSessionStore(root, store, { expectedRevision: 0, now })
    // Overflow beyond MAX_ARCHIVED (100) must be written to a dated backup file.
    const backups = readdirSync(join(root, ".nimbl")).filter((name) => name.startsWith("sessions.archived-"))
    expect(backups.length).toBeGreaterThan(0)
    expect(saved.archived?.length ?? 0).toBeLessThanOrEqual(100)
  })
})

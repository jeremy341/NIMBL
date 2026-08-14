import { describe, expect, it } from "vitest"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { mkdtempSync } from "node:fs"
import { applySessionRetention, backupInvalidSessionStore, lastRequestUsage, loadSessionStore, saveSessionStore, sessionUsage, SessionStoreConflictError, SessionStoreLockedError, type SessionStore, type StoredSession } from "@/core/sessions"

describe("session persistence", () => {
  it("migrates legacy flat reasoning and tool messages into assistant parts", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-sessions-"))
    try {
      mkdirSync(join(root, ".nimbl"))
      writeFileSync(join(root, ".nimbl", "sessions.json"), JSON.stringify({
        version: 1,
        activeID: "session",
        provider: "freellmapi",
        model: "auto",
        sessions: [{
          id: "session",
          title: "Legacy",
          agent: "build",
          created: 1,
          contextTokens: 9,
          contextWindow: 100,
          tokens: 12,
          cost: 0.25,
          messages: [
            { id: "assistant", role: "assistant", text: "Answer", time: 2 },
            { id: "reasoning", role: "reasoning", text: "Thought", time: 3 },
            { id: "tool", role: "tool", text: "Read file", time: 4, tool: "read", state: "completed", output: "contents" },
          ],
        }],
      }), "utf8")

      const result = loadSessionStore(root)
      expect(result.status).toBe("valid")
      if (result.status !== "valid") throw new Error("Expected a valid session store")
      expect(result.store).toMatchObject({ version: 2, revision: 0 })
      expect(result.store.sessions[0]?.messages).toHaveLength(1)
      expect(result.store.sessions[0]?.messages[0]?.parts?.map((part) => part.type)).toEqual(["text", "reasoning", "tool"])
      expect(result.store.sessions[0]?.legacyUsage).toEqual({ totalTokens: 12, referenceCostUsd: 0.25, lastRequestTokens: 9, contextWindow: 100 })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("writes the store atomically without leaving a temporary file", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-sessions-"))
    try {
      const store: SessionStore = {
        version: 2,
        revision: 0,
        activeID: "session",
        provider: "freellmapi",
        model: "auto",
        sessions: [{ id: "session", title: "Test", agent: "build", created: 1, messages: [{ id: "assistant", role: "assistant", text: "answer", time: 1, usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3, referenceCostUsd: 0.01, contextWindow: 100, attempts: 1, latencyMs: 5 } }] }],
      }
      const saved = saveSessionStore(root, store, { expectedRevision: 0 })

      expect(existsSync(join(root, ".nimbl", "sessions.json.tmp"))).toBe(false)
      expect(readdirSync(join(root, ".nimbl")).some((name) => name.startsWith("sessions.json.tmp-"))).toBe(false)
      expect(saved.revision).toBe(1)
      expect(JSON.parse(readFileSync(join(root, ".nimbl", "sessions.json"), "utf8")).revision).toBe(1)
      const loaded = loadSessionStore(root)
      expect(loaded.status === "valid" && loaded.store.sessions[0]?.messages[0]?.usage?.totalTokens).toBe(3)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("distinguishes a missing store from invalid data", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-sessions-"))
    try {
      expect(loadSessionStore(root)).toEqual({ status: "missing" })
      mkdirSync(join(root, ".nimbl"))
      writeFileSync(join(root, ".nimbl", "sessions.json"), "{broken", "utf8")
      const result = loadSessionStore(root)
      expect(result).toMatchObject({ status: "invalid", file: join(root, ".nimbl", "sessions.json") })
      expect(readFileSync(join(root, ".nimbl", "sessions.json"), "utf8")).toBe("{broken")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("backs up invalid bytes before a recovery store can be written", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-sessions-"))
    try {
      mkdirSync(join(root, ".nimbl"))
      const file = join(root, ".nimbl", "sessions.json")
      writeFileSync(file, "{broken", "utf8")
      const result = loadSessionStore(root)
      if (result.status !== "invalid") throw new Error("Expected invalid session data")

      const backup = backupInvalidSessionStore(result, 1234)
      expect(backup).toBe(join(root, ".nimbl", "sessions.corrupt-1234.json"))
      expect(readFileSync(backup, "utf8")).toBe("{broken")
      expect(readFileSync(file, "utf8")).toBe("{broken")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("rejects unsupported and structurally invalid stores", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-sessions-"))
    try {
      mkdirSync(join(root, ".nimbl"))
      const file = join(root, ".nimbl", "sessions.json")
      for (const value of [
        { version: 2, sessions: [] },
        { version: 1, sessions: "invalid" },
        { version: 1, activeID: "id", provider: "provider", model: "model", sessions: [{ id: "id", title: "Bad", agent: "build", created: 1, messages: [{ id: "message", role: "assistant", text: "", time: 1, parts: [{ type: "tool" }] }] }] },
      ]) {
        writeFileSync(file, JSON.stringify(value), "utf8")
        expect(loadSessionStore(root).status).toBe("invalid")
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("rejects a stale writer instead of overwriting a newer revision", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-sessions-cas-"))
    try {
      const draft: SessionStore = { version: 2, revision: 0, activeID: "session", provider: "freellmapi", model: "auto", sessions: [{ id: "session", title: "Test", agent: "build", created: 1, messages: [] }] }
      const first = saveSessionStore(root, draft, { expectedRevision: 0 })
      expect(first.revision).toBe(1)
      expect(() => saveSessionStore(root, { ...draft, sessions: [{ ...draft.sessions[0]!, title: "Stale" }] }, { expectedRevision: 0 })).toThrow(SessionStoreConflictError)
      const loaded = loadSessionStore(root)
      expect(loaded.status === "valid" && loaded.store.sessions[0]?.title).toBe("Test")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("rotates valid backups before replacing the primary store", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-sessions-backup-"))
    try {
      const base: SessionStore = { version: 2, revision: 0, activeID: "session", provider: "freellmapi", model: "auto", sessions: [{ id: "session", title: "One", agent: "build", created: 1, messages: [] }] }
      const one = saveSessionStore(root, base, { expectedRevision: 0 })
      const two = saveSessionStore(root, { ...one, sessions: [{ ...one.sessions[0]!, title: "Two" }] }, { expectedRevision: 1 })
      saveSessionStore(root, { ...two, sessions: [{ ...two.sessions[0]!, title: "Three" }] }, { expectedRevision: 2 })
      expect(JSON.parse(readFileSync(join(root, ".nimbl", "sessions.json.bak.1"), "utf8")).sessions[0].title).toBe("Two")
      expect(JSON.parse(readFileSync(join(root, ".nimbl", "sessions.json.bak.2"), "utf8")).sessions[0].title).toBe("One")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("archives old excess sessions while retaining active and pinned sessions", () => {
    const now = 100 * 24 * 60 * 60 * 1000
    const sessions = Array.from({ length: 55 }, (_, index) => ({ id: `old-${index}`, title: `Old ${index}`, agent: "build" as const, created: index, updated: index, messages: [] }))
    const store: SessionStore = {
      version: 2,
      revision: 1,
      activeID: "active",
      provider: "freellmapi",
      model: "auto",
      sessions: [
        { id: "active", title: "Active", agent: "build", created: 1, messages: [] },
        { id: "pinned", title: "Pinned", agent: "build", created: 1, pinned: true, messages: [] },
        ...sessions,
      ],
    }
    const retained = applySessionRetention(store, now)
    expect(retained.sessions.some((session) => session.id === "active")).toBe(true)
    expect(retained.sessions.some((session) => session.id === "pinned")).toBe(true)
    expect(retained.sessions.length).toBeLessThan(store.sessions.length)
    expect(retained.archived?.length).toBeGreaterThan(0)
  })

  it("times out on a live lock without modifying the store", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-sessions-lock-"))
    try {
      mkdirSync(join(root, ".nimbl", "sessions.lock"), { recursive: true })
      writeFileSync(join(root, ".nimbl", "sessions.lock", "owner.json"), JSON.stringify({ token: "other", pid: process.pid, created: Date.now() }))
      const draft: SessionStore = { version: 2, revision: 0, activeID: "session", provider: "freellmapi", model: "auto", sessions: [{ id: "session", title: "Test", agent: "build", created: 1, messages: [] }] }
      expect(() => saveSessionStore(root, draft, { expectedRevision: 0, lockTimeoutMs: 20 })).toThrow(SessionStoreLockedError)
      expect(existsSync(join(root, ".nimbl", "sessions.json"))).toBe(false)
      expect(existsSync(join(root, ".nimbl", "sessions.lock"))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("refuses recovery when invalid bytes change after backup", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-sessions-recovery-"))
    try {
      mkdirSync(join(root, ".nimbl"))
      const file = join(root, ".nimbl", "sessions.json")
      writeFileSync(file, "{broken", "utf8")
      const loaded = loadSessionStore(root)
      if (loaded.status !== "invalid") throw new Error("Expected invalid data")
      backupInvalidSessionStore(loaded, 1)
      writeFileSync(file, "{changed", "utf8")
      const draft: SessionStore = { version: 2, revision: 0, activeID: "session", provider: "freellmapi", model: "auto", sessions: [{ id: "session", title: "Test", agent: "build", created: 1, messages: [] }] }
      expect(() => saveSessionStore(root, draft, { expectedRevision: 0, recoveryFingerprint: loaded.fingerprint })).toThrow("changed after recovery")
      expect(readFileSync(file, "utf8")).toBe("{changed")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("recovers an ownerless stale lock", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-sessions-stale-lock-"))
    try {
      const lock = join(root, ".nimbl", "sessions.lock")
      mkdirSync(lock, { recursive: true })
      const old = new Date(Date.now() - 60_000)
      utimesSync(lock, old, old)
      const draft: SessionStore = { version: 2, revision: 0, activeID: "session", provider: "freellmapi", model: "auto", sessions: [{ id: "session", title: "Test", agent: "build", created: 1, messages: [] }] }
      expect(saveSessionStore(root, draft, { expectedRevision: 0 }).revision).toBe(1)
      expect(existsSync(lock)).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("derives cumulative and latest usage from request records", () => {
    const request = { inputTokens: 20, outputTokens: 5, totalTokens: 25, referenceCostUsd: 0.001, providerCostUsd: 0.0005, contextWindow: 1000, attempts: 1, latencyMs: 10 }
    const stored = {
      id: "session",
      title: "Usage",
      agent: "build" as const,
      created: 1,
      legacyUsage: { totalTokens: 10, referenceCostUsd: 0.002 },
      messages: [
        { id: "user", role: "user" as const, text: "question", time: 1 },
        { id: "assistant", role: "assistant" as const, text: "answer", time: 2, usage: request },
      ],
    }
    expect(lastRequestUsage(stored)).toEqual(request)
    expect(sessionUsage(stored)).toEqual({ inputTokens: 20, outputTokens: 5, totalTokens: 35, referenceCostUsd: 0.003, providerCostUsd: 0.0005, providerCostKnown: true })
  })

  it("keeps an explicit zero provider cost distinct from an unknown price", () => {
    const session: StoredSession = {
      id: "free-model",
      title: "Free model",
      agent: "build" as const,
      created: 1,
      messages: [],
    }
    session.messages = [{
      id: "free-request",
      role: "assistant",
      text: "ok",
      time: 1,
      usage: {
        inputTokens: 22_000,
        outputTokens: 0,
        totalTokens: 22_000,
        referenceCostUsd: 0.26,
        providerCostUsd: 0,
        contextWindow: 128_000,
        attempts: 1,
        latencyMs: 1,
      },
    }]
    expect(sessionUsage(session)).toMatchObject({
      totalTokens: 22_000,
      referenceCostUsd: 0.26,
      providerCostUsd: 0,
      providerCostKnown: true,
    })
  })
})

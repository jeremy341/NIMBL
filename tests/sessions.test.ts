import { describe, expect, it } from "vitest"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { mkdtempSync } from "node:fs"
import { backupInvalidSessionStore, loadSessionStore, saveSessionStore, type SessionStore } from "@/core/sessions"

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
      expect(result.store.sessions[0]?.messages).toHaveLength(1)
      expect(result.store.sessions[0]?.messages[0]?.parts?.map((part) => part.type)).toEqual(["text", "reasoning", "tool"])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("writes the store atomically without leaving a temporary file", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-sessions-"))
    try {
      const store: SessionStore = {
        version: 1,
        activeID: "session",
        provider: "freellmapi",
        model: "auto",
        sessions: [{ id: "session", title: "Test", agent: "build", created: 1, messages: [] }],
      }
      saveSessionStore(root, store)

      expect(existsSync(join(root, ".nimbl", "sessions.json.tmp"))).toBe(false)
      expect(JSON.parse(readFileSync(join(root, ".nimbl", "sessions.json"), "utf8"))).toEqual(store)
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
})

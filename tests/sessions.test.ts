import { describe, expect, it } from "vitest"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { mkdtempSync } from "node:fs"
import { loadSessionStore, saveSessionStore, type SessionStore } from "@/core/sessions"

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

      const store = loadSessionStore(root)
      expect(store?.sessions[0]?.messages).toHaveLength(1)
      expect(store?.sessions[0]?.messages[0]?.parts?.map((part) => part.type)).toEqual(["text", "reasoning", "tool"])
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
})

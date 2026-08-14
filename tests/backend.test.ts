import { describe, expect, test } from "vitest"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NimblBackend } from "../src/core/backend"

function workspace() {
  const root = mkdtempSync(join(tmpdir(), "nimbl-backend-"))
  mkdirSync(join(root, ".git"))
  writeFileSync(join(root, "NIMBL.md"), "# instructions\n")
  return root
}

describe("custom NIMBL backend", () => {
  test("loads a durable workspace and creates sessions", () => {
    const backend = new NimblBackend(workspace(), { watch: false })
    const loaded = backend.load()
    expect(backend.workspace.hasGit).toBe(true)
    expect(backend.workspace.hasInstructions).toBe(true)
    const created = backend.createSession(loaded.store, "plan")
    expect(created.agent).toBe("plan")
    expect(loaded.store.activeID).toBe(created.id)
    backend.close()
  })

  test("searches session titles and recent prompts", () => {
    const backend = new NimblBackend(workspace(), { watch: false })
    const loaded = backend.load()
    loaded.store.sessions[0]!.title = "Fix parser regression"
    loaded.store.sessions[0]!.messages.push({ id: "m1", role: "user", text: "repair the parser", time: Date.now() })
    expect(backend.searchSessions(loaded.store.sessions, "parser")).toHaveLength(1)
    backend.close()
  })

  test("creates child sessions with parent linkage", () => {
    const backend = new NimblBackend(workspace(), { watch: false })
    const loaded = backend.load()
    const parent = loaded.store.sessions[0]!
    const child = backend.createChildSession(loaded.store, parent.id, "explain")
    expect(child.parentID).toBe(parent.id)
    expect(backend.children(loaded.store, parent.id).map((session) => session.id)).toContain(child.id)
    backend.close()
  })
})

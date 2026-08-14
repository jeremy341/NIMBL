import { describe, expect, it } from "vitest"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { dequeuePrompt, navigateDraft, queuePrompt, setDraft } from "@/core/session-actions"
import { loadFrecency, rankFiles, recordFrecency, frecencyScore } from "@/core/frecency"
import { resolveEditorCommand } from "@/core/editor"
import type { StoredSession } from "@/core/sessions"

const base: StoredSession = { id: "s1", title: "T", agent: "build", created: 1, messages: [] }

describe("prompt queue", () => {
  it("queues prompts and marks the session queued", () => {
    const queued = queuePrompt(base, "first")
    expect(queued.queuedPrompts).toHaveLength(1)
    expect(queued.queuedPrompts![0]!.text).toBe("first")
    expect(queued.runState).toBe("queued")
  })

  it("dequeues in order and clears the queued prompts", () => {
    const queued = queuePrompt(queuePrompt(base, "first"), "second")
    const one = dequeuePrompt(queued)
    expect(one.prompt).toBe("first")
    expect(one.session.queuedPrompts).toHaveLength(1)
    expect(one.session.runState).toBe("queued")
    const two = dequeuePrompt(one.session)
    expect(two.prompt).toBe("second")
    expect(two.session.queuedPrompts).toHaveLength(0)
    // After draining the last prompt, the session returns to idle (not stuck queued).
    expect(two.session.runState).toBe("idle")
  })

  it("ignores empty prompts", () => {
    expect(queuePrompt(base, "   ").queuedPrompts).toBeUndefined()
  })
})

describe("prompt draft history", () => {
  it("records draft history on setDraft and navigates it", () => {
    const first = setDraft(base, "one")
    const second = setDraft(first, "two")
    const third = setDraft(second, "three")
    expect(third.draftHistory).toContain("one")
    expect(third.draftHistory).toContain("two")

    const previous = navigateDraft(third, "previous")
    expect(previous.draft).toBe("two")
    const older = navigateDraft(previous, "previous")
    expect(older.draft).toBe("one")
    const next = navigateDraft(older, "next")
    expect(next.draft).toBe("two")
  })

  it("returns the session unchanged when history is empty", () => {
    expect(navigateDraft(base, "previous")).toBe(base)
  })

  it("returns to the unsaved live draft after navigating past the newest history entry", () => {
    const first = setDraft(base, "one")
    const second = setDraft(first, "two")
    // Mirror the TUI's onHistory: record the live draft into history before
    // navigating so "next" past the newest entry recovers it.
    const withLive = second.draft !== (second.draftHistory || []).at(-1)
      ? { ...second, draftHistory: [...(second.draftHistory || []), second.draft!].filter(Boolean) }
      : second
    const oldest = navigateDraft(withLive, "previous")
    expect(oldest.draft).toBe("one")
    const oneForward = navigateDraft(oldest, "next")
    expect(oneForward.draft).toBe("two")
    const pastNewest = navigateDraft(oneForward, "next")
    expect(pastNewest.draft).toBe("two")
  })
})

describe("frecency", () => {
  it("records and ranks files by recency-weighted frequency", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-frecency-"))
    recordFrecency(root, "src/main.ts", 1000)
    recordFrecency(root, "src/main.ts", 2000)
    recordFrecency(root, "src/utils.ts", 3000)
    const data = loadFrecency(root)
    expect(frecencyScore(data.get("src/main.ts")!, 3000)).toBeGreaterThan(frecencyScore(data.get("src/utils.ts")!, 3000))
    const ranked = rankFiles(["src/utils.ts", "src/main.ts", "src/other.ts"], data, 3000)
    expect(ranked[0]).toBe("src/main.ts")
    expect(ranked[1]).toBe("src/utils.ts")
  })
})

describe("editor", () => {
  it("resolves the editor command from configured value, VISUAL, then EDITOR", () => {
    const originalVisual = process.env.VISUAL
    const originalEditor = process.env.EDITOR
    try {
      delete process.env.VISUAL
      delete process.env.EDITOR
      expect(resolveEditorCommand("nvim")).toBe("nvim")
      process.env.VISUAL = "code --wait"
      expect(resolveEditorCommand(undefined)).toBe("code --wait")
      delete process.env.VISUAL
      process.env.EDITOR = "vim"
      expect(resolveEditorCommand(undefined)).toBe("vim")
      delete process.env.EDITOR
      expect(resolveEditorCommand(undefined)).toBeUndefined()
    } finally {
      if (originalVisual !== undefined) process.env.VISUAL = originalVisual
      else delete process.env.VISUAL
      if (originalEditor !== undefined) process.env.EDITOR = originalEditor
      else delete process.env.EDITOR
    }
  })
})

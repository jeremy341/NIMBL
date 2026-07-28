import { describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { compactSession, forkSession, recordSnapshot, recordSnapshotGroup, redoSnapshot, renameSession, shouldCompactSession, undoSnapshot } from "@/core/session-actions"
import { getModel } from "@/core/providers"
import type { SessionWithSnapshots } from "@/core/session-actions"

const session: SessionWithSnapshots = {
  id: "session-a",
  title: "Original",
  agent: "build" as const,
  created: 1,
  messages: [
    { id: "one", role: "user" as const, text: "first request", time: 1 },
    { id: "two", role: "assistant" as const, text: "first answer", time: 2 },
    { id: "three", role: "user" as const, text: "latest request", time: 3 },
  ],
}

describe("session actions", () => {
  it("renames sessions with a compact human-readable title", () => {
    expect(renameSession(session, "  Fix   provider  flow  ").title).toBe("Fix provider flow")
  })

  it("forks history without retaining the source session id", () => {
    const fork = forkSession(session, "session-b")
    expect(fork.id).toBe("session-b")
    expect(fork.parentID).toBe("session-a")
    expect(fork.messages[0]?.id).toContain("session-b-")
  })

  it("records snapshots and clears the redo queue", () => {
    const recorded = recordSnapshot({ ...session, redoSnapshots: [{ path: "old.ts", before: "a", after: "b", time: 1 }] }, { path: "new.ts", before: "a", after: "b", time: 2 })
    expect(recorded.snapshots).toHaveLength(1)
    expect(recorded.redoSnapshots).toEqual([])
  })

  it("compacts old transcript entries into a summary", () => {
    const result = compactSession(session, { keep: 1, now: 10 })
    expect(result.messages).toHaveLength(1)
    expect(result.compaction?.narrative).toContain("first request")
    expect(result.compaction).toMatchObject({ version: 1, sourceMessageCount: 2, compactedAt: 10 })
    expect(result.archivedMessages).toHaveLength(2)
  })

  it("preserves structured decisions, constraints, errors, and usage across repeated compaction", () => {
    const usage = { inputTokens: 2, outputTokens: 1, totalTokens: 3, referenceCostUsd: 0.01, contextWindow: 100, attempts: 1, latencyMs: 1 }
    const source: SessionWithSnapshots = {
      ...session,
      messages: [
        { id: "u1", role: "user", text: "We must preserve API compatibility", time: 1 },
        { id: "a1", role: "assistant", text: "Decision: use schema version two", time: 2, usage },
        { id: "e1", role: "error", text: "Migration failed once", time: 3 },
        { id: "u2", role: "user", text: "Continue the migration", time: 4 },
        { id: "a2", role: "assistant", text: "Working", time: 5, usage },
      ],
    }
    const first = compactSession(source, { keep: 2, now: 10 })
    const second = compactSession({ ...first, messages: [...first.messages, { id: "u3", role: "user", text: "Next", time: 6 }, { id: "a3", role: "assistant", text: "Done", time: 7 }] }, { keep: 2, now: 20 })
    expect(first.compaction?.constraints).toContain("We must preserve API compatibility")
    expect(first.compaction?.decisions).toContain("Decision: use schema version two")
    expect(first.compaction?.relevantErrors).toContain("Migration failed once")
    expect(second.compaction?.sourceMessageIds).toEqual(expect.arrayContaining(["u1", "a1", "e1", "u2", "a2"]))
    expect(second.archivedMessages?.filter((message) => message.id === "a1")).toHaveLength(1)
  })

  it("detects when active history crosses the automatic compaction threshold", () => {
    const model = { ...getModel("openai", "gpt-4.1"), contextWindow: 50 }
    const large = { ...session, messages: [{ id: "large", role: "user" as const, text: "token ".repeat(100), time: 1 }] }
    expect(shouldCompactSession(large, model, 0.8)).toBe(true)
    expect(shouldCompactSession(session, model, 0.8)).toBe(false)
  })

  it("deletes a newly created file on undo and recreates it on redo", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-snapshot-"))
    const file = join(root, "created.txt")
    writeFileSync(file, "created")
    const recorded = recordSnapshot(session, { path: "created.txt", before: "", after: "created", beforeExists: false, afterExists: true, time: 2 })

    const undone = undoSnapshot(root, recorded)
    expect(existsSync(file)).toBe(false)
    redoSnapshot(root, undone.session)
    expect(readFileSync(file, "utf8")).toBe("created")
  })

  it("undoes a multi-file operation as one transaction", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-snapshot-group-"))
    writeFileSync(join(root, "a.txt"), "after-a")
    writeFileSync(join(root, "b.txt"), "after-b")
    const recorded = recordSnapshotGroup(session, [
      { path: "a.txt", before: "before-a", after: "after-a", beforeExists: true, afterExists: true },
      { path: "b.txt", before: "before-b", after: "after-b", beforeExists: true, afterExists: true },
    ], 2)

    const undone = undoSnapshot(root, recorded)
    expect(readFileSync(join(root, "a.txt"), "utf8")).toBe("before-a")
    expect(readFileSync(join(root, "b.txt"), "utf8")).toBe("before-b")
    expect(undone.session.snapshots).toHaveLength(0)
  })

  it("refuses to restore protected or symlink-escaping snapshot paths", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-snapshot-safe-"))
    const outside = mkdtempSync(join(tmpdir(), "nimbl-snapshot-outside-"))
    writeFileSync(join(root, ".npmrc"), "after")
    writeFileSync(join(outside, "outside.txt"), "after")
    symlinkSync(outside, join(root, "linked"), "junction")
    const protectedSession = recordSnapshot(session, { path: ".npmrc", before: "before", after: "after", time: 2 })
    const escapedSession = recordSnapshot(session, { path: "linked/outside.txt", before: "before", after: "after", time: 2 })

    expect(() => undoSnapshot(root, protectedSession)).toThrow("blocked by NIMBL's default safety policy")
    expect(() => undoSnapshot(root, escapedSession)).toThrow("outside this project")
    expect(readFileSync(join(root, ".npmrc"), "utf8")).toBe("after")
    expect(readFileSync(join(outside, "outside.txt"), "utf8")).toBe("after")
  })
})

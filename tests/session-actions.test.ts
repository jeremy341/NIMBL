import { describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { compactSession, forkSession, recordSnapshot, recordSnapshotGroup, redoSnapshot, renameSession, undoSnapshot } from "@/core/session-actions"
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
    const result = compactSession(session, 1)
    expect(result.messages).toHaveLength(1)
    expect(result.summary).toContain("first request")
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
})

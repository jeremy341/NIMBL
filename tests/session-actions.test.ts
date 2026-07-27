import { describe, expect, it } from "vitest"
import { compactSession, forkSession, recordSnapshot, renameSession } from "@/core/session-actions"
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
})

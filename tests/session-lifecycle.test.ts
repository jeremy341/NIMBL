import { describe, expect, it } from "vitest"
import { findSession, latestSession, sessionEpilogue } from "@/core/session-lifecycle"
import type { StoredSession } from "@/core/sessions"

const sessions: StoredSession[] = [
  { id: "ses_old_123", title: "Old", messages: [], agent: "build", created: 10, updated: 20 },
  { id: "ses_new_456", title: "New", messages: [], agent: "plan", created: 30, updated: 40 },
]

describe("session lifecycle", () => {
  it("resolves full and unique partial session IDs", () => {
    expect(findSession(sessions, "ses_old_123")?.title).toBe("Old")
    expect(findSession(sessions, "ses_new")?.title).toBe("New")
    expect(findSession(sessions, "ses_")).toBeUndefined()
  })

  it("continues the most recently updated session", () => {
    expect(latestSession(sessions)?.id).toBe("ses_new_456")
  })

  it("prints a continuation command after exit", () => {
    const output = sessionEpilogue(sessions[1]!)
    expect(output).toContain("Session")
    expect(output).toContain("nimbl -s ses_new_456")
  })
})

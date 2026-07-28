import { describe, expect, it } from "vitest"
import { registerExitPress } from "@/core/exit-guard"
import { ctrlCAction } from "@/core/ctrl-c"

describe("Ctrl+C exit guard", () => {
  it("requires a second press inside the confirmation window", () => {
    const first = registerExitPress(undefined, 1_000)
    expect(first).toEqual({ armedAt: 1_000, exit: false })
    expect(registerExitPress(first.armedAt, 2_500)).toEqual({ armedAt: undefined, exit: true })
  })

  it("re-arms after the confirmation window expires", () => {
    expect(registerExitPress(1_000, 3_001)).toEqual({ armedAt: 3_001, exit: false })
  })

  it("does not accept a clock value before the armed press", () => {
    expect(registerExitPress(2_000, 1_999)).toEqual({ armedAt: 1_999, exit: false })
  })
})

describe("Ctrl+C action priority", () => {
  it("selects exactly one higher-priority action before exit", () => {
    expect(ctrlCAction({ selection: true, dialog: true, approval: true, question: true, running: true, draft: true })).toBe("copy")
    expect(ctrlCAction({ selection: false, dialog: true, approval: true, question: true, running: true, draft: true })).toBe("close-dialog")
    expect(ctrlCAction({ selection: false, dialog: false, approval: true, question: true, running: true, draft: true })).toBe("reject-approval")
    expect(ctrlCAction({ selection: false, dialog: false, approval: false, question: true, running: true, draft: true })).toBe("cancel-question")
    expect(ctrlCAction({ selection: false, dialog: false, approval: false, question: false, running: true, draft: true })).toBe("abort-run")
    expect(ctrlCAction({ selection: false, dialog: false, approval: false, question: false, running: false, draft: true })).toBe("clear-draft")
    expect(ctrlCAction({ selection: false, dialog: false, approval: false, question: false, running: false, draft: false })).toBe("exit")
  })
})

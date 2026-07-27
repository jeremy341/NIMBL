import { describe, expect, it } from "vitest"
import { observeLearning, teachingPrompt } from "@/core/learning"

describe("learning state", () => {
  it("records repeated concepts without storing conversation text", () => {
    const state = observeLearning({ concepts: {} }, "Explain TypeScript async testing")
    expect(state.concepts.typescript?.encounters).toBe(1)
    expect(teachingPrompt(state)).toContain("typescript")
  })
})

import { describe, expect, it } from "vitest"
import { leakageLabel, leakageScore, observeLearning, teachingPrompt } from "@/core/learning"

describe("learning state", () => {
  it("records repeated concepts without storing conversation text", () => {
    const state = observeLearning({ concepts: {} }, "Explain TypeScript async testing")
    expect(state.concepts.typescript?.encounters).toBe(1)
    expect(teachingPrompt(state)).toContain("typescript")
  })

  it("scores answer-revealing tutor responses higher than guided ones", () => {
    expect(leakageScore("The answer is 42 and the solution is exactly this")).toBeGreaterThan(leakageScore("What happens if you trace the loop on paper? Try it with a small input."))
    expect(leakageScore("Let's think step by step: what does this function return when the input is empty?")).toBeLessThan(0.5)
    expect(leakageLabel(leakageScore("The answer is 42"))).toBe("medium")
    expect(leakageLabel(leakageScore("Try it yourself"))).toBe("none")
  })
})

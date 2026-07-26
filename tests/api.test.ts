import { describe, it, expect } from "vitest"
import { estimateSavings } from "@/core/api"

describe("estimateSavings", () => {
  it("calculates correct cost for prompt tokens", () => {
    const result = estimateSavings(1_000_000, 0)
    expect(parseFloat(result)).toBeCloseTo(2.5, 2)
  })

  it("calculates correct cost for completion tokens", () => {
    const result = estimateSavings(0, 1_000_000)
    expect(parseFloat(result)).toBeCloseTo(10.0, 2)
  })

  it("returns zero for zero tokens", () => {
    const result = estimateSavings(0, 0)
    expect(result).toBe("0.0000")
  })

  it("scales with prompt tokens", () => {
    const small = parseFloat(estimateSavings(100, 0))
    const large = parseFloat(estimateSavings(10000, 0))
    expect(large).toBeGreaterThan(small)
  })

  it("weights output tokens higher than input tokens", () => {
    const promptOnly = parseFloat(estimateSavings(1000, 0))
    const outputOnly = parseFloat(estimateSavings(0, 1000))
    expect(outputOnly).toBeGreaterThan(promptOnly)
  })

  it("combines prompt and completion tokens correctly", () => {
    const combined = parseFloat(estimateSavings(100_000, 50_000))
    const prompt = parseFloat(estimateSavings(100_000, 0))
    const output = parseFloat(estimateSavings(0, 50_000))
    expect(combined).toBeCloseTo(prompt + output, 4)
  })
})


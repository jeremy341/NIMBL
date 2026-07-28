import { describe, it, expect } from "vitest"
import { estimateReferenceCost } from "@/core/api"

describe("estimateReferenceCost", () => {
  it("calculates correct cost for prompt tokens", () => {
    const result = estimateReferenceCost(1_000_000, 0)
    expect(result).toBeCloseTo(2.5, 2)
  })

  it("calculates correct cost for completion tokens", () => {
    const result = estimateReferenceCost(0, 1_000_000)
    expect(result).toBeCloseTo(10.0, 2)
  })

  it("returns zero for zero tokens", () => {
    const result = estimateReferenceCost(0, 0)
    expect(result).toBe(0)
  })

  it("scales with prompt tokens", () => {
    const small = estimateReferenceCost(100, 0)
    const large = estimateReferenceCost(10000, 0)
    expect(large).toBeGreaterThan(small)
  })

  it("weights output tokens higher than input tokens", () => {
    const promptOnly = estimateReferenceCost(1000, 0)
    const outputOnly = estimateReferenceCost(0, 1000)
    expect(outputOnly).toBeGreaterThan(promptOnly)
  })

  it("combines prompt and completion tokens correctly", () => {
    const combined = estimateReferenceCost(100_000, 50_000)
    const prompt = estimateReferenceCost(100_000, 0)
    const output = estimateReferenceCost(0, 50_000)
    expect(combined).toBeCloseTo(prompt + output, 4)
  })
})

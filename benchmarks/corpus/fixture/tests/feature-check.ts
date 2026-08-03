import { describe, it, expect } from "bun:test"
import { feature } from "../src/features/feature"

describe("feature", () => {
  it("formats a feature with the configured theme", () => {
    expect(feature("core")).toContain("dark")
  })
})

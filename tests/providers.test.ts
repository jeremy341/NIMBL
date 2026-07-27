import { describe, expect, it } from "vitest"
import { modelContextWindow } from "@/core/providers"

describe("model context windows", () => {
  it("uses the selected model's configured window instead of one global cap", () => {
    expect(modelContextWindow("openai", "gpt-4.1")).toBe(1_047_576)
    expect(modelContextWindow("ollama", "qwen2.5-coder")).toBe(32_768)
  })
})

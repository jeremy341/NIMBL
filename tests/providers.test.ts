import { describe, expect, it } from "vitest"
import { compatibilityIssues, getModel, modelContextWindow } from "@/core/providers"
import { estimateProviderCost } from "@/core/pricing"

describe("model context windows", () => {
  it("uses the selected model's configured window instead of one global cap", () => {
    expect(modelContextWindow("openai", "gpt-4.1")).toBe(1_047_576)
    expect(modelContextWindow("ollama", "qwen2.5-coder")).toBe(32_768)
  })

  it("declares capabilities, tokenizer family, output limit, and dated pricing", () => {
    const model = getModel("openai", "gpt-4.1")
    expect(model.capabilities).toMatchObject({ tools: true, streaming: true, structuredOutput: true })
    expect(model.tokenizer).toBe("openai:o200k_base")
    expect(model.maxOutputTokens).toBeGreaterThan(0)
    expect(model.pricing?.[0]).toMatchObject({ effectiveFrom: "2025-04-14", currency: "USD" })
  })

  it("rejects unknown model limits unless an explicit override is configured", () => {
    const previous = process.env.NIMBL_CONTEXT_WINDOW
    delete process.env.NIMBL_CONTEXT_WINDOW
    expect(() => modelContextWindow("openai", "unknown")).toThrow("Unknown model")
    process.env.NIMBL_CONTEXT_WINDOW = "64000"
    expect(modelContextWindow("openai", "unknown")).toBe(64_000)
    if (previous === undefined) delete process.env.NIMBL_CONTEXT_WINDOW
    else process.env.NIMBL_CONTEXT_WINDOW = previous
  })

  it("reports model compatibility issues before execution", () => {
    const model = { ...getModel("openai", "gpt-4.1"), capabilities: { ...getModel("openai", "gpt-4.1").capabilities, tools: false } }
    expect(compatibilityIssues(model, { tools: true, reasoning: false, imageInput: false, structuredOutput: false, streaming: true, minimumContextTokens: 1000 })).toContain("tool calling")
  })

  it("estimates provider cost from versioned model pricing", () => {
    const price = getModel("openai", "gpt-4.1").pricing?.[0]
    if (!price) throw new Error("Expected pricing")
    expect(estimateProviderCost(price, { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toMatchObject({ usd: 10, estimated: true, effectiveFrom: "2025-04-14" })
  })
})

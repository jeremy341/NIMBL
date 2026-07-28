import { describe, expect, it } from "vitest"
import { getModel } from "@/core/providers"
import { countTextTokens } from "@/core/tokenizers"

describe("model tokenizers", () => {
  it("uses the configured OpenAI tokenizer exactly", () => {
    expect(countTextTokens("hello world", getModel("openai", "gpt-4.1"))).toEqual({ tokens: 2, quality: "exact", tokenizer: "openai:o200k_base" })
  })

  it("labels non-OpenAI family counts as conservative estimates", () => {
    const count = countTextTokens("hello world from NIMBL", getModel("anthropic", "claude-sonnet-4-5"))
    expect(count.quality).toBe("family-estimate")
    expect(count.tokenizer).toBe("anthropic")
    expect(count.tokens).toBeGreaterThan(0)
  })
})

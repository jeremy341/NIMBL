import { getEncoding, type Tiktoken } from "js-tiktoken"
import type { ProviderModel, TokenizerFamily } from "./providers"

export interface TokenCount {
  tokens: number
  quality: "exact" | "family-estimate" | "character-estimate"
  tokenizer: TokenizerFamily
}

const encodings = new Map<string, Tiktoken>()

function openAIEncoding(name: "o200k_base" | "cl100k_base") {
  let encoding = encodings.get(name)
  if (!encoding) {
    encoding = getEncoding(name)
    encodings.set(name, encoding)
  }
  return encoding
}

export function countTextTokens(text: string, model: Pick<ProviderModel, "tokenizer">): TokenCount {
  if (model.tokenizer === "openai:o200k_base") return { tokens: openAIEncoding("o200k_base").encode(text).length, quality: "exact", tokenizer: model.tokenizer }
  if (model.tokenizer === "openai:cl100k_base") return { tokens: openAIEncoding("cl100k_base").encode(text).length, quality: "exact", tokenizer: model.tokenizer }
  const ratio = model.tokenizer === "anthropic" ? 3.5
    : model.tokenizer === "gemini" ? 3.7
      : model.tokenizer === "llama" ? 3.2
        : model.tokenizer === "mistral" ? 3.3
          : 3
  return {
    tokens: Math.ceil(text.length / ratio * 1.15),
    quality: model.tokenizer === "unknown" ? "character-estimate" : "family-estimate",
    tokenizer: model.tokenizer,
  }
}

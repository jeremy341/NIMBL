import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"
import { getProvider } from "./providers"
import { ASSISTANT_RESPONSE_STYLE, stripEmojis } from "./response-style"

export interface ChatResult {
  text: string
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
}

export async function sendChat(text: string, config: { provider: string; model: string; apiKey: string }): Promise<ChatResult> {
  if (!text.trim()) throw new Error("Chat text cannot be empty")
  const provider = getProvider(config.provider)
  const model = provider.protocol === "anthropic"
    ? createAnthropic({ apiKey: config.apiKey, baseURL: provider.baseURL })(config.model)
    : createOpenAI({ baseURL: provider.baseURL, apiKey: config.apiKey, headers: provider.headers })(config.model)

  try {
    const result = await generateText({ model, system: ASSISTANT_RESPONSE_STYLE, prompt: text })
    return { text: stripEmojis(result.text), usage: { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0, totalTokens: result.usage.totalTokens ?? 0 } }
  } catch (error) {
    if (error instanceof Error) throw new Error(`Failed to send chat to ${provider.name}: ${error.message}`)
    throw error
  }
}

/** DeepSeek-V4-Flash-0731 reference baseline: $0.14/M input (cache miss), $0.28/M output. */
const REF_COST = { input: 0.14e-6, output: 0.28e-6 }

export function estimateReferenceCost(prompt: number, completion: number): number {
  return prompt * REF_COST.input + completion * REF_COST.output
}

/** @deprecated Use estimateReferenceCost; this value is not measured savings. */
export const estimateSavings = estimateReferenceCost

export function formatSavings(value: number): string {
  return value.toFixed(4)
}

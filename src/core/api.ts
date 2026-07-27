import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"
import { getProvider } from "./providers"

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
    const result = await generateText({ model, prompt: text })
    return { text: result.text, usage: { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0, totalTokens: result.usage.totalTokens ?? 0 } }
  } catch (error) {
    if (error instanceof Error) throw new Error(`Failed to send chat to ${provider.name}: ${error.message}`)
    throw error
  }
}

const REF_COST = { input: 2.5e-6, output: 1e-5 }

export function estimateSavings(prompt: number, completion: number): number {
  return prompt * REF_COST.input + completion * REF_COST.output
}

export function formatSavings(value: number): string {
  return value.toFixed(4)
}

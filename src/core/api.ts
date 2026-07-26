import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"

export interface ChatResult {
  text: string
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
}

export async function sendChat(
  text: string,
  config: { provider: string; model: string; apiKey: string }
): Promise<ChatResult> {
  if (!text.trim()) {
    throw new Error("Chat text cannot be empty")
  }

  const client = createOpenAI({
    baseURL: providerToBaseURL(config.provider),
    apiKey: config.apiKey,
  })

  try {
    const result = await generateText({
      model: client(config.model),
      prompt: text,
    })

    return {
      text: result.text,
      usage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        totalTokens: result.usage.totalTokens ?? 0,
      },
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to send chat to ${config.provider}: ${error.message}`)
    }
    throw error
  }
}

function providerToBaseURL(p: string): string {
  switch (p) {
    case "freellmapi":
      return "http://localhost:3001/v1"
    case "openrouter":
      return "https://openrouter.ai/api/v1"
    default:
      return "https://api.openai.com/v1"
  }
}

const REF_COST = { input: 2.5e-6, output: 1e-5 }

export function estimateSavings(prompt: number, completion: number): string {
  const costUsd = prompt * REF_COST.input + completion * REF_COST.output
  return costUsd.toFixed(4)
}

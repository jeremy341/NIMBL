export type Role = "user" | "assistant"

export interface Message {
  role: Role
  content: string
}

export interface ChatRequest {
  messages: Message[]
  model?: string
  provider?: string
  temperature?: number
  maxTokens?: number
}

export interface ChatResponse {
  content: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface EstimatedSavings {
  tokensRequested: number
  tokensSaved: number
  percentageSaved: number
  estimatedCost: number
  savedCost: number
}

export type AgentMode = "build" | "plan" | "explain" | "learn"

export type AssistantPart =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "reasoning"; text: string; started: number; ended?: number }
  | {
      id: string
      type: "tool"
      tool: string
      state: "running" | "completed" | "rejected" | "failed"
      title: string
      detail?: string
      output?: string
      diff?: string
      path?: string
      started?: number
      ended?: number
    }

export interface ChatMessage {
  id: string
  role: "user" | "assistant" | "error" | "system"
  text: string
  time: number
  agent?: AgentMode
  agentText?: string
  attachments?: string[]
  provider?: string
  model?: string
  completed?: number
  error?: string
  parts?: AssistantPart[]
  hidden?: boolean
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  agent: AgentMode
  created: number
  updated?: number
  contextTokens?: number
  contextWindow?: number
  snapshots?: Array<{ path: string; before: string; after: string; time: number }>
  parentID?: string
  runState?: "idle" | "running" | "failed" | "interrupted" | "queued"
}

export interface CommandOption {
  value: string
  title: string
  description?: string
  category?: string
  current?: boolean
  connected?: boolean
  disabled?: boolean
  footer?: string
  details?: string[]
  gutter?: string
  titleWidth?: number
  truncateTitle?: boolean | "left"
  suggested?: boolean
  aliases?: string[]
  /** Built-ins execute immediately; prompt commands insert text so arguments can be added. */
  autocomplete?: "execute" | "insert"
}

export interface SessionPromptRef {
  focus(): void
  blur(): void
  set(value: string): void
}

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export type StoredRole = "user" | "assistant" | "error" | "system" | "tool" | "reasoning"
export type StoredAgentMode = "build" | "plan" | "explain" | "learn"

export type StoredAssistantPart =
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
    }

export interface StoredMessage {
  id: string
  role: StoredRole
  text: string
  time: number
  tool?: string
  state?: "running" | "completed" | "rejected" | "failed"
  detail?: string
  output?: string
  diff?: string
  path?: string
  hidden?: boolean
  agentText?: string
  agent?: StoredAgentMode
  attachments?: string[]
  provider?: string
  model?: string
  completed?: number
  error?: string
  parts?: StoredAssistantPart[]
}

export interface StoredSession {
  id: string
  title: string
  messages: StoredMessage[]
  agent: StoredAgentMode
  created: number
  summary?: string
  pinned?: boolean
  parentID?: string
  updated?: number
  reasoningVisible?: boolean
  contextTokens?: number
  contextWindow?: number
  tokens?: number
  cost?: number
  snapshots?: import("./session-actions").FileSnapshot[]
  redoSnapshots?: import("./session-actions").FileSnapshot[]
}

export interface SessionStore {
  version: 1
  activeID: string
  provider: string
  model: string
  sessions: StoredSession[]
}

function fileFor(directory: string) { return join(directory, ".nimbl", "sessions.json") }

function normalizeMessages(messages: StoredMessage[]): StoredMessage[] {
  const result: StoredMessage[] = []
  for (const message of messages) {
    if (message.role !== "tool" && message.role !== "reasoning") {
      result.push(message)
      continue
    }

    let assistant = result.at(-1)?.role === "assistant" ? result.at(-1) : undefined
    if (!assistant) {
      assistant = {
        id: `${message.id}-assistant`,
        role: "assistant",
        text: "",
        time: message.time,
        parts: [],
      }
      result.push(assistant)
    }
    const parts = assistant.parts ?? (assistant.text
      ? [{ id: `${assistant.id}-text`, type: "text" as const, text: assistant.text }]
      : [])
    assistant.parts = [
      ...parts,
      message.role === "reasoning"
        ? {
            id: message.id,
            type: "reasoning" as const,
            text: message.text,
            started: message.time,
            ended: message.state === "running" ? undefined : message.time,
          }
        : {
            id: message.id,
            type: "tool" as const,
            tool: message.tool || "tool",
            state: message.state || "completed",
            title: message.text,
            detail: message.detail,
            output: message.output,
            diff: message.diff,
            path: message.path,
          },
    ]
  }
  return result
}

export function loadSessionStore(directory: string): SessionStore | undefined {
  const file = fileFor(directory)
  if (!existsSync(file)) return
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as SessionStore
    if (value?.version !== 1 || !Array.isArray(value.sessions)) return
    return {
      ...value,
      sessions: value.sessions.map((session) => ({
        ...session,
        messages: normalizeMessages(Array.isArray(session.messages) ? session.messages : []),
      })),
    }
  } catch {
    return
  }
}

export function saveSessionStore(directory: string, store: SessionStore) {
  const folder = join(directory, ".nimbl")
  mkdirSync(folder, { recursive: true })
  const file = fileFor(directory)
  const temporary = file + ".tmp"
  writeFileSync(temporary, JSON.stringify(store, null, 2) + "\n", "utf8")
  renameSync(temporary, file)
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export type StoredRole = "user" | "assistant" | "error" | "system" | "tool" | "reasoning"

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
}

export interface StoredSession {
  id: string
  title: string
  messages: StoredMessage[]
  agent: "build" | "plan" | "explain" | "learn"
  created: number
  summary?: string
  pinned?: boolean
  parentID?: string
  updated?: number
  reasoningVisible?: boolean
  contextTokens?: number
  contextWindow?: number
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

export function loadSessionStore(directory: string): SessionStore | undefined {
  const file = fileFor(directory)
  if (!existsSync(file)) return
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as SessionStore
    if (value?.version !== 1 || !Array.isArray(value.sessions)) return
    return value
  } catch {
    return
  }
}

export function saveSessionStore(directory: string, store: SessionStore) {
  const folder = join(directory, ".nimbl")
  mkdirSync(folder, { recursive: true })
  writeFileSync(fileFor(directory), JSON.stringify(store, null, 2) + "\n", "utf8")
}

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

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

export type SessionStoreLoadResult =
  | { status: "missing" }
  | { status: "valid"; store: SessionStore }
  | { status: "invalid"; file: string; error: string }

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function optionalString(value: unknown) {
  return value === undefined || typeof value === "string"
}

function validPart(value: unknown) {
  if (!isRecord(value) || typeof value.id !== "string") return false
  if (value.type === "text") return typeof value.text === "string"
  if (value.type === "reasoning") return typeof value.text === "string" && typeof value.started === "number" && (value.ended === undefined || typeof value.ended === "number")
  return value.type === "tool"
    && typeof value.tool === "string"
    && ["running", "completed", "rejected", "failed"].includes(String(value.state))
    && typeof value.title === "string"
    && optionalString(value.detail)
    && optionalString(value.output)
    && optionalString(value.diff)
    && optionalString(value.path)
}

function validMessage(value: unknown) {
  if (!isRecord(value)) return false
  return typeof value.id === "string"
    && ["user", "assistant", "error", "system", "tool", "reasoning"].includes(String(value.role))
    && typeof value.text === "string"
    && typeof value.time === "number"
    && optionalString(value.agentText)
    && optionalString(value.provider)
    && optionalString(value.model)
    && optionalString(value.error)
    && (value.attachments === undefined || (Array.isArray(value.attachments) && value.attachments.every((item) => typeof item === "string")))
    && (value.parts === undefined || (Array.isArray(value.parts) && value.parts.every(validPart)))
}

function validSession(value: unknown) {
  if (!isRecord(value)) return false
  return typeof value.id === "string"
    && typeof value.title === "string"
    && ["build", "plan", "explain", "learn"].includes(String(value.agent))
    && typeof value.created === "number"
    && Array.isArray(value.messages)
    && value.messages.every(validMessage)
}

function parseSessionStore(value: unknown): SessionStore {
  if (!isRecord(value) || value.version !== 1) throw new Error("Unsupported session store version.")
  if (typeof value.activeID !== "string" || typeof value.provider !== "string" || typeof value.model !== "string") {
    throw new Error("Session store metadata is invalid.")
  }
  if (!Array.isArray(value.sessions) || !value.sessions.every(validSession)) throw new Error("Session store sessions are invalid.")
  const store = value as unknown as SessionStore
  return {
    ...store,
    sessions: store.sessions.map((session) => ({ ...session, messages: normalizeMessages(session.messages) })),
  }
}

export function loadSessionStore(directory: string): SessionStoreLoadResult {
  const file = fileFor(directory)
  if (!existsSync(file)) return { status: "missing" }
  try {
    return { status: "valid", store: parseSessionStore(JSON.parse(readFileSync(file, "utf8"))) }
  } catch (error) {
    return { status: "invalid", file, error: error instanceof Error ? error.message : String(error) }
  }
}

export function backupInvalidSessionStore(result: Extract<SessionStoreLoadResult, { status: "invalid" }>, now = Date.now()) {
  const stem = join(dirname(result.file), `sessions.corrupt-${now}`)
  let backup = stem + ".json"
  let suffix = 1
  while (existsSync(backup)) backup = `${stem}-${suffix++}.json`
  copyFileSync(result.file, backup)
  return backup
}

export function saveSessionStore(directory: string, store: SessionStore) {
  const folder = join(directory, ".nimbl")
  mkdirSync(folder, { recursive: true })
  const file = fileFor(directory)
  const temporary = file + ".tmp"
  writeFileSync(temporary, JSON.stringify(store, null, 2) + "\n", "utf8")
  renameSync(temporary, file)
}

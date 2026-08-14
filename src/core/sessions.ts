import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import { dirname, join } from "node:path"
import type { RequestBudgetBreakdown } from "./request-budget"
import type { ContextRetrievalTelemetry } from "./context"

export type StoredRole = "user" | "assistant" | "error" | "system" | "tool" | "reasoning"
export type StoredAgentMode = "build" | "plan" | "explain" | "learn"

export interface StoredRequestUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  noCacheTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  textTokens?: number
  reasoningTokens?: number
  referenceCostUsd: number
  providerCostUsd?: number
  pricingEffectiveFrom?: string
  contextWindow: number
  inputContextTokens?: number
  attempts: number
  latencyMs: number
  finishReason?: string
  rawFinishReason?: string
  callId?: string
  responseId?: string
  requestId?: string
  budget?: RequestBudgetBreakdown
  retrieval?: ContextRetrievalTelemetry
}

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
      started?: number
      ended?: number
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
  usage?: StoredRequestUsage
}

export interface StoredCompaction {
  version: 1
  narrative: string
  decisions: string[]
  constraints: string[]
  modifiedFiles: string[]
  unresolvedTasks: string[]
  relevantErrors: string[]
  learningState: string[]
  sourceMessageIds: string[]
  sourceMessageCount: number
  compactedAt: number
}

export interface LegacySessionUsage {
  totalTokens: number
  referenceCostUsd: number
  lastRequestTokens?: number
  contextWindow?: number
}

export interface StoredUsageTotals {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  referenceCostUsd: number
  providerCostUsd: number
  providerCostKnown: boolean
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
  compaction?: StoredCompaction
  archivedMessages?: StoredMessage[]
  legacyUsage?: LegacySessionUsage
  snapshots?: import("./session-actions").FileSnapshot[]
  redoSnapshots?: import("./session-actions").FileSnapshot[]
  draft?: string
  draftHistory?: string[]
  stashes?: { id: string; text: string; created: number }[]
  queuedPrompts?: { id: string; text: string; created: number; priority?: number }[]
  runState?: "idle" | "running" | "failed" | "interrupted" | "queued"
  todos?: { id: string; content: string; status: "pending" | "in_progress" | "completed" }[]
  unread?: boolean
  tags?: string[]
  share?: import("./share").HostedShare
}

export interface SessionStore {
  version: 2
  revision: number
  activeID: string
  provider: string
  model: string
  sessions: StoredSession[]
  archived?: ArchivedSession[]
  /** Transient overflow from applySessionRetention, backed up on save. */
  archivedOverflow?: ArchivedSession[]
}

export interface ArchivedSession {
  session: StoredSession
  archivedAt: number
  reason: "retention"
}

export type SessionStoreLoadResult =
  | { status: "missing" }
  | { status: "valid"; store: SessionStore }
  | { status: "invalid"; file: string; error: string; fingerprint: string }

export class SessionStoreConflictError extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(`Session store changed in another process (expected revision ${expected}, found ${actual}).`)
    this.name = "SessionStoreConflictError"
  }
}

export class SessionStoreLockedError extends Error {
  constructor() {
    super("Session store is locked by another NIMBL process.")
    this.name = "SessionStoreLockedError"
  }
}

function fileFor(directory: string) { return join(directory, ".nimbl", "sessions.json") }

function fingerprint(text: string) { return createHash("sha256").update(text).digest("hex") }

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

function nonnegative(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value >= 0 }

function validUsage(value: unknown) {
  if (!isRecord(value)) return false
  return nonnegative(value.inputTokens)
    && nonnegative(value.outputTokens)
    && nonnegative(value.totalTokens)
    && nonnegative(value.referenceCostUsd)
    && nonnegative(value.contextWindow)
    && nonnegative(value.attempts)
    && nonnegative(value.latencyMs)
    && (value.providerCostUsd === undefined || nonnegative(value.providerCostUsd))
}

function validCompaction(value: unknown) {
  if (!isRecord(value) || value.version !== 1 || typeof value.narrative !== "string" || !nonnegative(value.sourceMessageCount) || !nonnegative(value.compactedAt)) return false
  return ["decisions", "constraints", "modifiedFiles", "unresolvedTasks", "relevantErrors", "learningState", "sourceMessageIds"]
    .every((key) => Array.isArray(value[key]) && (value[key] as unknown[]).every((item) => typeof item === "string"))
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
    && (value.usage === undefined || validUsage(value.usage))
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
    && (value.archivedMessages === undefined || (Array.isArray(value.archivedMessages) && value.archivedMessages.every(validMessage)))
    && (value.compaction === undefined || validCompaction(value.compaction))
    && optionalString(value.draft)
    && (value.draftHistory === undefined || (Array.isArray(value.draftHistory) && value.draftHistory.every((item) => typeof item === "string")))
    && (value.stashes === undefined || (Array.isArray(value.stashes) && value.stashes.every((item) => isRecord(item) && typeof item.id === "string" && typeof item.text === "string" && typeof item.created === "number")))
    && (value.queuedPrompts === undefined || (Array.isArray(value.queuedPrompts) && value.queuedPrompts.every((item) => isRecord(item) && typeof item.id === "string" && typeof item.text === "string" && typeof item.created === "number")))
    && (value.runState === undefined || ["idle", "running", "failed", "interrupted", "queued"].includes(String(value.runState)))
    && (value.todos === undefined || (Array.isArray(value.todos) && value.todos.every((item) => isRecord(item) && typeof item.id === "string" && typeof item.content === "string" && ["pending", "in_progress", "completed"].includes(String(item.status)))))
    && (value.tags === undefined || (Array.isArray(value.tags) && value.tags.every((item) => typeof item === "string")))
}

export function migrateSessionStoreV1(value: Record<string, unknown>): SessionStore {
  const legacy = value as unknown as Omit<SessionStore, "version" | "revision" | "archived">
  return {
    ...legacy,
    version: 2,
    revision: 0,
    sessions: legacy.sessions.map(normalizeSession),
  }
}

function normalizeSession(session: StoredSession): StoredSession {
  const { tokens, cost, contextTokens, contextWindow, ...current } = session
  const legacyUsage = session.legacyUsage ?? (tokens || cost || contextTokens || contextWindow
    ? { totalTokens: tokens || 0, referenceCostUsd: cost || 0, lastRequestTokens: contextTokens, contextWindow }
    : undefined)
  return { ...current, legacyUsage, messages: normalizeMessages(session.messages) }
}

export function sessionUsage(session: StoredSession): StoredUsageTotals {
  const totals: StoredUsageTotals = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: session.legacyUsage?.totalTokens || 0,
    referenceCostUsd: session.legacyUsage?.referenceCostUsd || 0,
    providerCostUsd: 0,
    providerCostKnown: false,
  }
  for (const message of [...(session.archivedMessages || []), ...session.messages]) {
    if (!message.usage) continue
    totals.inputTokens += message.usage.inputTokens
    totals.outputTokens += message.usage.outputTokens
    totals.totalTokens += message.usage.totalTokens
    totals.referenceCostUsd += message.usage.referenceCostUsd
    if (message.usage.providerCostUsd !== undefined) {
      totals.providerCostKnown = true
      totals.providerCostUsd += message.usage.providerCostUsd
    }
  }
  return totals
}

export function lastRequestUsage(session: StoredSession) {
  return session.messages.findLast((message) => Boolean(message.usage))?.usage
}

export function sessionSummary(session: StoredSession) {
  return session.compaction?.narrative || session.summary
}

export function parseSessionStore(value: unknown): SessionStore {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2)) throw new Error("Unsupported session store version.")
  if (typeof value.activeID !== "string" || typeof value.provider !== "string" || typeof value.model !== "string") {
    throw new Error("Session store metadata is invalid.")
  }
  if (!Array.isArray(value.sessions) || !value.sessions.every(validSession)) throw new Error("Session store sessions are invalid.")
  if (value.version === 1) return migrateSessionStoreV1(value)
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0) throw new Error("Session store revision is invalid.")
  if (value.archived !== undefined && !Array.isArray(value.archived)) throw new Error("Session archive is invalid.")
  const store = value as unknown as SessionStore
  if (!store.sessions.some((session) => session.id === store.activeID)) throw new Error("Active session is missing from the session store.")
  if (new Set(store.sessions.map((session) => session.id)).size !== store.sessions.length) throw new Error("Session IDs must be unique.")
  for (const session of store.sessions) {
    const messageIDs = [...(session.archivedMessages || []), ...session.messages].map((message) => message.id)
    if (new Set(messageIDs).size !== messageIDs.length) throw new Error(`Message IDs in session "${session.id}" must be unique.`)
  }
  return {
    ...store,
    sessions: store.sessions.map(normalizeSession),
  }
}

export function loadSessionStore(directory: string): SessionStoreLoadResult {
  const file = fileFor(directory)
  if (!existsSync(file)) return { status: "missing" }
  try {
    const text = readFileSync(file, "utf8")
    return { status: "valid", store: parseSessionStore(JSON.parse(text)) }
  } catch (error) {
    const text = readFileSync(file, "utf8")
    return { status: "invalid", file, error: error instanceof Error ? error.message : String(error), fingerprint: fingerprint(text) }
  }
}

export function backupInvalidSessionStore(result: Extract<SessionStoreLoadResult, { status: "invalid" }>, now = Date.now()) {
  const stem = join(dirname(result.file), `sessions.corrupt-${now}`)
  let backup = stem + ".json"
  let suffix = 1
  while (existsSync(backup)) backup = `${stem}-${suffix++}.json`
  copyFileSync(result.file, backup)
  const corrupt = readdirSync(dirname(result.file))
    .filter((name) => /^sessions\.corrupt-.*\.json$/.test(name))
    .sort()
  for (const name of corrupt.slice(0, -3)) rmSync(join(dirname(result.file), name), { force: true })
  return backup
}

const RETENTION_AGE_MS = 90 * 24 * 60 * 60 * 1000
const MAX_ACTIVE_UNPINNED = 50
const MAX_ARCHIVED = 100

export function applySessionRetention(store: SessionStore, now = Date.now()): SessionStore {
  const protectedIDs = new Set([store.activeID, ...store.sessions.filter((session) => session.pinned).map((session) => session.id)])
  const eligible = store.sessions
    .filter((session) => !protectedIDs.has(session.id))
    .sort((left, right) => (right.updated || right.created) - (left.updated || left.created))
  const keep = new Set(eligible.slice(0, MAX_ACTIVE_UNPINNED).filter((session) => now - (session.updated || session.created) <= RETENTION_AGE_MS).map((session) => session.id))
  const archivedNow = eligible.filter((session) => !keep.has(session.id)).map((session) => ({ session, archivedAt: now, reason: "retention" as const }))
  const merged = [...(store.archived || []), ...archivedNow].sort((left, right) => right.archivedAt - left.archivedAt)
  const overflow = merged.slice(MAX_ARCHIVED)
  return {
    ...store,
    sessions: store.sessions.filter((session) => protectedIDs.has(session.id) || keep.has(session.id)),
    archived: merged.slice(0, MAX_ARCHIVED),
    archivedOverflow: overflow,
  }
}

/**
 * Overflow beyond MAX_ARCHIVED is persisted to a dated backup file instead of
 * being dropped, so old sessions are never silently lost. Only writes when the
 * overflow set changes (avoids a growing backup file on every save).
 */
const overflowBackupCache = new Map<string, string>()

export function backupArchivedOverflow(store: SessionStore, directory: string): number {
  const overflow = store.archivedOverflow || []
  if (!overflow.length) return 0
  const fingerprint = overflow.map((entry) => entry.session.id).join(",")
  const cached = overflowBackupCache.get(directory)
  if (cached === fingerprint) return 0
  const folder = join(directory, ".nimbl")
  mkdirSync(folder, { recursive: true })
  const file = join(folder, `sessions.archived-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)
  writeFileSync(file, JSON.stringify({ version: 1, archivedAt: Date.now(), sessions: overflow }, null, 2) + "\n", "utf8")
  overflowBackupCache.set(directory, fingerprint)
  return overflow.length
}

function processAlive(pid: number) {
  try { process.kill(pid, 0); return true } catch { return false }
}

function sleepSync(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function acquireLock(folder: string, timeoutMs: number) {
  const lock = join(folder, "sessions.lock")
  const token = randomUUID()
  const deadline = Date.now() + timeoutMs
  while (true) {
    try {
      mkdirSync(lock)
      writeFileSync(join(lock, "owner.json"), JSON.stringify({ token, pid: process.pid, created: Date.now() }), "utf8")
      return { lock, token }
    } catch (error) {
      const code = isRecord(error) ? String(error.code || "") : ""
      if (code !== "EEXIST") throw error
      try {
        const owner = JSON.parse(readFileSync(join(lock, "owner.json"), "utf8")) as { pid?: number }
        if (Date.now() - statSync(lock).mtimeMs > 30_000 && (!owner.pid || !processAlive(owner.pid))) {
          rmSync(lock, { recursive: true, force: true })
          continue
        }
      } catch {
        if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > 30_000) {
          rmSync(lock, { recursive: true, force: true })
          continue
        }
      }
      if (Date.now() >= deadline) throw new SessionStoreLockedError()
      sleepSync(10)
    }
  }
}

function releaseLock(lock: string, token: string) {
  try {
    const owner = JSON.parse(readFileSync(join(lock, "owner.json"), "utf8")) as { token?: string }
    if (owner.token === token) rmSync(lock, { recursive: true, force: true })
  } catch { /* Never remove a lock whose ownership cannot be verified. */ }
}

function rotateBackups(file: string) {
  rmSync(file + ".bak.3", { force: true })
  if (existsSync(file + ".bak.2")) renameSync(file + ".bak.2", file + ".bak.3")
  if (existsSync(file + ".bak.1")) renameSync(file + ".bak.1", file + ".bak.2")
  if (existsSync(file)) copyFileSync(file, file + ".bak.1")
}

export interface SaveSessionStoreOptions {
  expectedRevision?: number
  recoveryFingerprint?: string
  now?: number
  lockTimeoutMs?: number
}

export function saveSessionStore(directory: string, store: SessionStore, options: SaveSessionStoreOptions = {}) {
  const folder = join(directory, ".nimbl")
  mkdirSync(folder, { recursive: true })
  const file = fileFor(directory)
  const owner = acquireLock(folder, options.lockTimeoutMs ?? 250)
  try {
    let actualRevision = 0
    let currentValid = false
    if (existsSync(file)) {
      const currentText = readFileSync(file, "utf8")
      try { actualRevision = parseSessionStore(JSON.parse(currentText)).revision; currentValid = true }
      catch {
        if (!options.recoveryFingerprint || fingerprint(currentText) !== options.recoveryFingerprint) {
          throw new Error("Invalid session data changed after recovery started; refusing to overwrite it.")
        }
      }
    }
    const expected = options.expectedRevision ?? store.revision
    if (actualRevision !== expected) throw new SessionStoreConflictError(expected, actualRevision)
    const retained = applySessionRetention({ ...store, version: 2, revision: actualRevision + 1 }, options.now)
    // Persist any archived-session overflow to a dated backup instead of
    // silently dropping sessions older than the archived cap.
    backupArchivedOverflow(retained, directory)
    if (currentValid) rotateBackups(file)
    const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`
    writeFileSync(temporary, JSON.stringify(retained, null, 2) + "\n", "utf8")
    const descriptor = openSync(temporary, "r")
    try { try { fsyncSync(descriptor) } catch { /* Windows may reject fsync on a read handle. */ } } finally { closeSync(descriptor) }
    renameSync(temporary, file)
    return retained
  } finally {
    releaseLock(owner.lock, owner.token)
  }
}

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type { StoredSession } from "./sessions"
import { resolveUnprotectedProjectPath } from "./project-path"
import type { ProviderModel } from "./providers"
import { countTextTokens } from "./tokenizers"

export interface SnapshotFileChange {
  path: string
  before: string
  after: string
  beforeExists?: boolean
  afterExists?: boolean
}

export interface FileSnapshot extends SnapshotFileChange {
  time: number
  changes?: SnapshotFileChange[]
  /** User message whose agent run produced this filesystem change. */
  messageID?: string
}

export interface SessionWithSnapshots extends StoredSession {
  snapshots?: FileSnapshot[]
  redoSnapshots?: FileSnapshot[]
}

export function setDraft<T extends StoredSession>(session: T, draft: string): T {
  const history = draft === session.draft ? session.draftHistory || [] : [...(session.draftHistory || []), ...(session.draft ? [session.draft] : [])].filter(Boolean).slice(-50)
  return { ...session, draft, draftHistory: history, updated: Date.now() }
}

export function navigateDraft<T extends StoredSession>(session: T, direction: "previous" | "next"): T {
  const history = session.draftHistory || []; if (!history.length) return session
  const found = session.draft ? history.lastIndexOf(session.draft) : -1
  const current = found >= 0 ? found : direction === "previous" ? history.length : -1
  const index = direction === "previous" ? Math.max(0, current - 1) : Math.min(history.length - 1, current + 1)
  return { ...session, draft: history[index] || "" }
}

export function stashDraft<T extends StoredSession>(session: T, text = session.draft || ""): T {
  if (!text.trim()) return session
  return { ...session, draft: "", stashes: [...(session.stashes || []), { id: crypto.randomUUID(), text, created: Date.now() }].slice(-20), updated: Date.now() }
}

export function popDraft<T extends StoredSession>(session: T): T {
  const stashes = [...(session.stashes || [])]; const item = stashes.pop(); return item ? { ...session, draft: item.text, stashes, updated: Date.now() } : session
}

export function queuePrompt<T extends StoredSession>(session: T, text: string, limit = 20): T {
  if (!text.trim()) return session
  return { ...session, queuedPrompts: [...(session.queuedPrompts || []), { id: crypto.randomUUID(), text, created: Date.now() }].slice(-limit), runState: "queued", updated: Date.now() }
}

export function dequeuePrompt<T extends StoredSession>(session: T): { session: T; prompt?: string } {
  const [item, ...rest] = session.queuedPrompts || []; return { session: { ...session, queuedPrompts: rest, runState: rest.length ? "queued" : session.runState }, prompt: item?.text }
}

export function setTodos<T extends StoredSession>(session: T, todos: NonNullable<StoredSession["todos"]>): T { return { ...session, todos: todos.slice(0, 100), updated: Date.now() } }

export function renameSession<T extends StoredSession>(session: T, title: string): T {
  const next = title.trim().replace(/\s+/g, " ").slice(0, 80)
  return { ...session, title: next || session.title, updated: Date.now() }
}

export function forkSession<T extends StoredSession>(session: T, id: string): T {
  return {
    ...session,
    id,
    title: `${session.title} (fork)`,
    parentID: session.id,
    created: Date.now(),
    updated: Date.now(),
    messages: session.messages.map((message) => ({
      ...message,
      id: `${id}-${message.id}`,
      parts: message.parts?.map((part) => ({ ...part, id: `${id}-${part.id}` })),
    })),
  }
}

export function recordSnapshot<T extends SessionWithSnapshots>(session: T, snapshot: FileSnapshot): T {
  const snapshots = [...(session.snapshots || []), snapshot].slice(-40)
  return { ...session, snapshots, redoSnapshots: [], updated: Date.now() }
}

export function recordSnapshotGroup<T extends SessionWithSnapshots>(session: T, changes: SnapshotFileChange[], time: number, messageID?: string): T {
  if (!changes.length) return session
  const first = changes[0]!
  return recordSnapshot(session, {
    ...first,
    path: changes.map((change) => change.path).join(", "),
    changes,
    time,
    messageID,
  })
}

function safeProjectPath(root: string, path: string) {
  return resolveUnprotectedProjectPath(root, path).full
}

function snapshotChanges(snapshot: FileSnapshot) {
  return snapshot.changes?.length ? snapshot.changes : [snapshot]
}

function assertCurrent(root: string, changes: SnapshotFileChange[], side: "before" | "after", message: string) {
  return changes.map((change) => {
    const file = safeProjectPath(root, change.path)
    const expectedExists = change[`${side}Exists`] ?? true
    const exists = existsSync(file)
    const content = exists ? readFileSync(file, "utf8") : ""
    if (exists !== expectedExists || (exists && content !== change[side])) throw new Error(message)
    return { change, file }
  })
}

function restore(files: ReturnType<typeof assertCurrent>, side: "before" | "after") {
  for (const { change, file } of files) {
    const shouldExist = change[`${side}Exists`] ?? true
    if (!shouldExist) {
      if (existsSync(file)) rmSync(file)
      continue
    }
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, change[side], "utf8")
  }
}

export function undoSnapshot<T extends SessionWithSnapshots>(root: string, session: T): { session: T; snapshot?: FileSnapshot } {
  const snapshot = session.snapshots?.at(-1)
  if (!snapshot) return { session }
  const files = assertCurrent(root, snapshotChanges(snapshot), "after", "A file changed after this snapshot; undo was not applied.")
  restore(files, "before")
  return {
    snapshot,
    session: { ...session, snapshots: session.snapshots!.slice(0, -1), redoSnapshots: [...(session.redoSnapshots || []), snapshot], updated: Date.now() },
  }
}

export function redoSnapshot<T extends SessionWithSnapshots>(root: string, session: T): { session: T; snapshot?: FileSnapshot } {
  const snapshot = session.redoSnapshots?.at(-1)
  if (!snapshot) return { session }
  const files = assertCurrent(root, snapshotChanges(snapshot), "before", "A file changed after undo; redo was not applied.")
  restore(files, "after")
  return {
    snapshot,
    session: { ...session, snapshots: [...(session.snapshots || []), snapshot], redoSnapshots: session.redoSnapshots!.slice(0, -1), updated: Date.now() },
  }
}

function diffLines(value: string) {
  const lines = value.replace(/\r\n/g, "\n").split("\n")
  if (lines.at(-1) === "") lines.pop()
  return lines
}

/** Render a valid unified diff for OpenTUI's native diff component. */
export function snapshotUnifiedDiff(snapshot: FileSnapshot): string {
  return snapshotChanges(snapshot).map((change) => {
    const before = diffLines(change.before)
    const after = diffLines(change.after)
    const oldPath = change.beforeExists === false ? "/dev/null" : `a/${change.path.replace(/\\/g, "/")}`
    const newPath = change.afterExists === false ? "/dev/null" : `b/${change.path.replace(/\\/g, "/")}`
    return [
      `--- ${oldPath}`,
      `+++ ${newPath}`,
      `@@ -1,${before.length} +1,${after.length} @@`,
      ...before.map((line) => `-${line}`),
      ...after.map((line) => `+${line}`),
    ].join("\n")
  }).join("\n")
}

/** OpenCode-style message revert: restore files, trim the turn, restore the prompt. */
export function revertToMessage<T extends SessionWithSnapshots>(root: string, session: T, messageID: string): { session: T; reverted: FileSnapshot[] } {
  const messageIndex = session.messages.findIndex((message) => message.id === messageID)
  const message = session.messages[messageIndex]
  if (messageIndex < 0 || !message || message.role !== "user") throw new Error("Only a user prompt can be reverted.")
  const messageOrder = new Map(session.messages.map((item, index) => [item.id, index]))
  let current = session
  const reverted: FileSnapshot[] = []
  while (current.snapshots?.length) {
    const snapshot = current.snapshots.at(-1)!
    const linkedIndex = snapshot.messageID ? messageOrder.get(snapshot.messageID) : undefined
    const belongsToTurn = linkedIndex !== undefined ? linkedIndex >= messageIndex : snapshot.time >= message.time
    if (!belongsToTurn) break
    const result = undoSnapshot(root, current)
    if (!result.snapshot) break
    current = result.session
    reverted.push(result.snapshot)
  }
  return {
    reverted,
    session: {
      ...current,
      messages: current.messages.slice(0, messageIndex),
      draft: message.text,
      updated: Date.now(),
    },
  }
}

function unique(values: string[]) { return [...new Set(values.filter(Boolean))] }

export function shouldCompactSession(session: StoredSession, model: ProviderModel, threshold = 0.82) {
  const text = [session.compaction?.narrative, ...session.messages.map((message) => message.agentText || message.text)].filter(Boolean).join("\n")
  return countTextTokens(text, model).tokens >= model.contextWindow * threshold
}

export function compactSession<T extends StoredSession>(session: T, options: number | { keep?: number; now?: number; learningState?: string[] } = {}): T {
  const keep = typeof options === "number" ? options : options.keep ?? 12
  const now = typeof options === "number" ? Date.now() : options.now ?? Date.now()
  const learningState = typeof options === "number" ? [] : options.learningState || []
  if (keep < 1) throw new Error("Compaction must retain at least one recent message.")
  if (session.messages.length <= keep) return session
  let recentStart = Math.max(0, session.messages.length - keep)
  const nextUser = session.messages.findIndex((message, index) => index >= recentStart && message.role === "user")
  if (nextUser >= 0) recentStart = nextUser
  const older = session.messages.slice(0, recentStart)
  if (!older.length) return session
  const previous = session.compaction
  const excerpts = older
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => `${message.role}: ${message.text.replace(/\s+/g, " ").slice(0, 320)}`)
  const decisions = older.filter((message) => /\b(decision|decided|choose|chose|will use)\b/i.test(message.text)).map((message) => message.text.trim())
  const constraints = older.filter((message) => /\b(must|never|required?|constraint|do not|don't)\b/i.test(message.text)).map((message) => message.text.trim())
  const errors = older.filter((message) => message.role === "error" || message.error || message.parts?.some((part) => part.type === "tool" && part.state === "failed")).map((message) => message.error || message.text).filter(Boolean)
  const unresolvedTasks = older.flatMap((message) => message.parts?.filter((part) => part.type === "tool" && part.tool === "todowrite").flatMap((part) => part.type === "tool" ? (part.output || "").split("\n").filter((line) => line.startsWith("[ ]") || line.startsWith("[>]")) : []) || [])
  const modifiedFiles = unique([...(previous?.modifiedFiles || []), ...(session.snapshots || []).flatMap((snapshot) => snapshot.changes?.map((change) => change.path) || [snapshot.path])])
  const archivedMessages = [...(session.archivedMessages || []), ...older].filter((message, index, all) => all.findIndex((item) => item.id === message.id) === index)
  const narrative = [previous?.narrative, ...excerpts].filter(Boolean).join("\n").slice(0, 12_000)
  return {
    ...session,
    summary: undefined,
    compaction: {
      version: 1,
      narrative,
      decisions: unique([...(previous?.decisions || []), ...decisions]),
      constraints: unique([...(previous?.constraints || []), ...constraints]),
      modifiedFiles,
      unresolvedTasks: unique([...(previous?.unresolvedTasks || []), ...unresolvedTasks]),
      relevantErrors: unique([...(previous?.relevantErrors || []), ...errors]),
      learningState: unique([...(previous?.learningState || []), ...learningState]),
      sourceMessageIds: unique([...(previous?.sourceMessageIds || []), ...older.map((message) => message.id)]),
      sourceMessageCount: (previous?.sourceMessageCount || 0) + older.length,
      compactedAt: now,
    },
    archivedMessages,
    messages: session.messages.slice(recentStart),
    updated: now,
  }
}

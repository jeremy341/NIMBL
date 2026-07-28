import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import type { StoredSession } from "./sessions"

export interface FileSnapshot {
  path: string
  before: string
  after: string
  time: number
}

export interface SessionWithSnapshots extends StoredSession {
  snapshots?: FileSnapshot[]
  redoSnapshots?: FileSnapshot[]
}

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

function safeProjectPath(root: string, path: string) {
  const target = resolve(root, path)
  const rel = relative(resolve(root), target)
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("Snapshot path is outside the project.")
  return target
}

export function undoSnapshot<T extends SessionWithSnapshots>(root: string, session: T): { session: T; snapshot?: FileSnapshot } {
  const snapshot = session.snapshots?.at(-1)
  if (!snapshot) return { session }
  const file = safeProjectPath(root, snapshot.path)
  if (!existsSync(dirname(file))) throw new Error("Snapshot target directory no longer exists.")
  const current = existsSync(file) ? readFileSync(file, "utf8") : ""
  if (current !== snapshot.after) throw new Error("The file changed after this snapshot; undo was not applied.")
  writeFileSync(file, snapshot.before, "utf8")
  return {
    snapshot,
    session: { ...session, snapshots: session.snapshots!.slice(0, -1), redoSnapshots: [...(session.redoSnapshots || []), snapshot], updated: Date.now() },
  }
}

export function redoSnapshot<T extends SessionWithSnapshots>(root: string, session: T): { session: T; snapshot?: FileSnapshot } {
  const snapshot = session.redoSnapshots?.at(-1)
  if (!snapshot) return { session }
  const file = safeProjectPath(root, snapshot.path)
  if (!existsSync(dirname(file))) throw new Error("Snapshot target directory no longer exists.")
  const current = existsSync(file) ? readFileSync(file, "utf8") : ""
  if (current !== snapshot.before) throw new Error("The file changed after undo; redo was not applied.")
  writeFileSync(file, snapshot.after, "utf8")
  return {
    snapshot,
    session: { ...session, snapshots: [...(session.snapshots || []), snapshot], redoSnapshots: session.redoSnapshots!.slice(0, -1), updated: Date.now() },
  }
}

export function compactSession<T extends StoredSession>(session: T, keep = 12): T {
  const older = session.messages.slice(0, -keep)
  const summary = older
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => `${message.role}: ${message.text.replace(/\s+/g, " ").slice(0, 240)}`)
    .join("\n")
  return {
    ...session,
    summary: [session.summary, summary].filter(Boolean).join("\n").slice(-8000),
    messages: session.messages.slice(-keep),
    updated: Date.now(),
  }
}

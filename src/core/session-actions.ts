import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type { StoredSession } from "./sessions"
import { resolveUnprotectedProjectPath } from "./project-path"

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

export function recordSnapshotGroup<T extends SessionWithSnapshots>(session: T, changes: SnapshotFileChange[], time: number): T {
  if (!changes.length) return session
  const first = changes[0]!
  return recordSnapshot(session, {
    ...first,
    path: changes.map((change) => change.path).join(", "),
    changes,
    time,
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

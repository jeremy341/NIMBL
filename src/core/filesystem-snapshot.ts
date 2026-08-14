import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { resolveUnprotectedProjectPath } from "./project-path"

export interface FilesystemEntry { path: string; kind: "file" | "directory"; mode: number; contentBase64?: string }
export interface FilesystemSnapshot { version: 1; created: number; entries: FilesystemEntry[] }
function collect(root: string, full: string, output: FilesystemEntry[]) { const stat = lstatSync(full); const rel = relative(root, full).replaceAll("\\", "/"); if (stat.isSymbolicLink()) throw new Error(`Symbolic links cannot be snapshotted: ${rel}`); if (stat.isDirectory()) { output.push({ path: rel, kind: "directory", mode: stat.mode }); for (const name of readdirSync(full)) collect(root, join(full, name), output) } else if (stat.isFile()) output.push({ path: rel, kind: "file", mode: stat.mode, contentBase64: readFileSync(full).toString("base64") }); else throw new Error(`Unsupported filesystem entry: ${rel}`) }
export function captureFilesystemSnapshot(root: string, paths: string[]): FilesystemSnapshot { const entries: FilesystemEntry[] = []; for (const path of paths) { const target = resolveUnprotectedProjectPath(root, path).full; if (existsSync(target)) collect(resolve(root), target, entries) } return { version: 1, created: Date.now(), entries: entries.filter((entry, index, all) => all.findIndex((candidate) => candidate.path === entry.path) === index) } }
export function restoreFilesystemSnapshot(root: string, snapshot: FilesystemSnapshot, options: { removeUnlisted?: string[] } = {}) {
  const canonicalRoot = resolve(root)
  const id = crypto.randomUUID()
  const temporary = join(canonicalRoot, ".nimbl", `restore-${id}`)
  const backupRoot = join(canonicalRoot, ".nimbl", `restore-old-${id}`)
  mkdirSync(temporary, { recursive: true })
  const movedBackups: Array<{ backup: string; target: string }> = []
  const movedTargets: string[] = []
  try {
    // Phase 1: stage every entry into a temporary tree.
    for (const entry of snapshot.entries) {
      const target = resolveUnprotectedProjectPath(canonicalRoot, entry.path).full
      const staged = join(temporary, entry.path)
      if (entry.kind === "directory") mkdirSync(staged, { recursive: true })
      else {
        mkdirSync(dirname(staged), { recursive: true })
        writeFileSync(staged, Buffer.from(entry.contentBase64 || "", "base64"))
      }
      chmodSync(staged, entry.mode & 0o7777)
    }

    // Phase 2: move current targets aside (keep the backups) and install the
    // staged versions. Every backup is retained until ALL entries succeed, so
    // a failure can roll back cleanly.
    const install = (entry: FilesystemEntry) => {
      const target = resolveUnprotectedProjectPath(canonicalRoot, entry.path).full
      const staged = join(temporary, entry.path)
      if (entry.kind === "directory") {
        mkdirSync(target, { recursive: true })
        return
      }
      mkdirSync(dirname(target), { recursive: true })
      if (existsSync(target)) {
        const backup = join(backupRoot, entry.path)
        mkdirSync(dirname(backup), { recursive: true })
        renameSync(target, backup)
        movedBackups.push({ backup, target })
      }
      renameSync(staged, target)
      movedTargets.push(target)
    }
    for (const entry of snapshot.entries) install(entry)
    for (const path of options.removeUnlisted || []) {
      const target = resolveUnprotectedProjectPath(canonicalRoot, path).full
      if (existsSync(target)) rmSync(target, { recursive: true, force: true })
    }

    // Phase 3: all entries installed successfully — delete the backups.
    for (const { backup } of movedBackups) rmSync(backup, { recursive: true, force: true })
  } catch (error) {
    // Roll back: remove any newly installed targets and restore the backups.
    for (const target of movedTargets) { try { rmSync(target, { recursive: true, force: true }) } catch { /* best effort */ } }
    for (const { backup, target } of movedBackups.reverse()) {
      try {
        mkdirSync(dirname(target), { recursive: true })
        renameSync(backup, target)
      } catch { /* best effort */ }
    }
    throw error
  } finally {
    rmSync(temporary, { recursive: true, force: true })
    rmSync(backupRoot, { recursive: true, force: true })
  }
}

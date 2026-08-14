import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export interface FrecencyEntry {
  path: string
  frequency: number
  lastOpen: number
}

const MAX_FRECENCY_ENTRIES = 1000

function fileFor(root: string) { return join(root, ".nimbl", "frecency.jsonl") }

export function loadFrecency(root: string): Map<string, FrecencyEntry> {
  const result = new Map<string, FrecencyEntry>()
  try {
    const lines = readFileSync(fileFor(root), "utf8").split("\n").filter(Boolean)
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as FrecencyEntry
        if (entry && typeof entry.path === "string" && typeof entry.frequency === "number" && typeof entry.lastOpen === "number") {
          result.set(entry.path, entry)
        }
      } catch { /* Skip malformed lines and self-heal on save. */ }
    }
  } catch { /* Missing file is an empty store. */ }
  return result
}

export function recordFrecency(root: string, filePath: string, now = Date.now()) {
  const data = loadFrecency(root)
  const prior = data.get(filePath)
  data.set(filePath, { path: filePath, frequency: (prior?.frequency || 0) + 1, lastOpen: now })
  const sorted = [...data.values()].sort((left, right) => right.lastOpen - left.lastOpen).slice(0, MAX_FRECENCY_ENTRIES)
  const folder = join(root, ".nimbl")
  mkdirSync(folder, { recursive: true })
  writeFileSync(fileFor(root), sorted.map((entry) => JSON.stringify(entry)).join("\n") + (sorted.length ? "\n" : ""), "utf8")
}

export function frecencyScore(entry: FrecencyEntry | undefined, now = Date.now()) {
  if (!entry) return 0
  return entry.frequency / (1 + (now - entry.lastOpen) / 86_400_000)
}

export function rankFiles(files: string[], data: Map<string, FrecencyEntry>, now = Date.now()) {
  const withScore = files.map((file) => ({ file, score: frecencyScore(data.get(file), now) }))
  return withScore.sort((left, right) => right.score - left.score || left.file.localeCompare(right.file)).map((item) => item.file)
}

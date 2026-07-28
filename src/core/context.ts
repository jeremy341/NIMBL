import ignore, { type Ignore } from "ignore"
import { existsSync, readFileSync, watch, type FSWatcher } from "node:fs"
import { dirname, relative } from "node:path"
import { resolveUnprotectedProjectPath } from "./project-path"
import { structuralChunks, type StructuralChunk } from "./structural-context"

export interface ContextCandidate {
  path: string
  score: number
  excerpt: string
  reason: string
}

export interface ContextRetrievalTelemetry {
  cacheHit: boolean
  indexGeneration: number
  scannedFiles: number
  indexedFiles: number
  ignoredFiles: number
  blockedFiles: number
  unreadableFiles: number
  matchedFiles: number
  selectedFiles: number
  candidates: Array<{ path: string; score: number; reason: string; selected: boolean }>
  elapsedMs: number
}

export interface ContextSelection {
  items: ContextCandidate[]
  estimatedTokens: number
  cacheHit: boolean
  telemetry: ContextRetrievalTelemetry
}

export interface ProjectContextIndex {
  select(prompt: string, limit?: number, budgetChars?: number): Promise<ContextSelection>
  invalidate(path?: string): void
  close(): void
}

interface IndexedFile {
  path: string
  content: string
  lower: string
  chunks?: StructuralChunk[]
}

interface IgnoreRule {
  directory: string
  matcher: Ignore
}

const STOP_WORDS = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "what", "when", "where", "about", "please", "need", "want", "help", "code"])
const CACHE_TTL_MS = 60_000
const MAX_FILE_BYTES = 256_000
const SUPPORTED = new Set(["ts", "tsx", "js", "jsx", "json", "md", "py", "go", "rs"])
const defaultIndexes = new Map<string, ProjectContextIndex>()

function terms(input: string) {
  return [...new Set(input.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g)?.filter((word) => !STOP_WORDS.has(word)) || [])]
}

function extension(path: string) { return path.split(".").at(-1)?.toLowerCase() || "" }
function hardExcluded(path: string) { return path.split("/").some((part) => ["node_modules", ".git", ".nimbl", "dist"].includes(part)) }
function isBinary(text: string) { return text.includes("\0") }

export function compressCode(text: string, maxLines = 80) {
  const lines = text.split("\n")
  const kept = lines.filter((line) => /^(export |import |class |interface |type |function |const \w+\s*=\s*(async )?\(|\s{0,2}(public |private |async )?\w+\()/u.test(line.trim()) || line.trim().startsWith("//") || line.trim() === "")
  const result = kept.slice(0, maxLines).join("\n")
  return result || lines.slice(0, maxLines).join("\n")
}

function emptyTelemetry(generation: number, started: number): ContextRetrievalTelemetry {
  return { cacheHit: false, indexGeneration: generation, scannedFiles: 0, indexedFiles: 0, ignoredFiles: 0, blockedFiles: 0, unreadableFiles: 0, matchedFiles: 0, selectedFiles: 0, candidates: [], elapsedMs: Date.now() - started }
}

class IndexedProjectContext implements ProjectContextIndex {
  private files = new Map<string, IndexedFile>()
  private queryCache = new Map<string, { expires: number; selection: ContextSelection }>()
  private rules: IgnoreRule[] = []
  private watcher: FSWatcher | undefined
  private ready: Promise<void> | undefined
  private generation = 0
  private dirty = true
  private lastBuildTelemetry = emptyTelemetry(0, Date.now())

  constructor(private readonly root: string, private readonly extensions: ReadonlySet<string>, watchProject = false) {
    if (watchProject) {
      this.watcher = watch(root, { recursive: true }, (_event, filename) => this.invalidate(filename?.toString()))
      this.watcher.unref()
    }
  }

  invalidate(_path?: string) {
    this.dirty = true
    this.generation++
    this.queryCache.clear()
  }

  close() {
    this.watcher?.close()
    this.watcher = undefined
    this.queryCache.clear()
  }

  private async rebuild() {
    if (!this.dirty) return
    if (this.ready) return this.ready
    this.ready = this.build()
    try { await this.ready } finally { this.ready = undefined }
  }

  private async loadIgnoreRules() {
    const rules: IgnoreRule[] = []
    const candidates = [".gitignore"]
    for await (const path of new Bun.Glob("**/.gitignore").scan({ cwd: this.root, onlyFiles: true, dot: true })) candidates.push(path.replaceAll("\\", "/"))
    for (const path of [...new Set(candidates)]) {
      try {
        const target = resolveUnprotectedProjectPath(this.root, path === ".gitignore" ? ".gitignore" : path)
        rules.push({ directory: dirname(target.rel).replaceAll("\\", "/").replace(/^\.$/, ""), matcher: ignore().add(readFileSync(target.full, "utf8")) })
      } catch { /* A protected or malformed ignore file cannot expand retrieval scope. */ }
    }
    this.rules = rules.sort((left, right) => left.directory.length - right.directory.length)
  }

  private ignored(path: string) {
    for (const rule of this.rules) {
      const relativePath = rule.directory ? relative(rule.directory, path).replaceAll("\\", "/") : path
      if (!relativePath.startsWith("..") && rule.matcher.ignores(relativePath)) return true
    }
    return false
  }

  private async build() {
    const started = Date.now()
    const telemetry = emptyTelemetry(this.generation, started)
    const files = new Map<string, IndexedFile>()
    await this.loadIgnoreRules()
    for await (const rawPath of new Bun.Glob("**/*").scan({ cwd: this.root, onlyFiles: true, dot: true })) {
      const path = rawPath.replaceAll("\\", "/")
      telemetry.scannedFiles++
      if (!this.extensions.has(extension(path)) || hardExcluded(path)) { telemetry.ignoredFiles++; continue }
      if (this.ignored(path)) { telemetry.ignoredFiles++; continue }
      try {
        const target = resolveUnprotectedProjectPath(this.root, path)
        const content = readFileSync(target.full, "utf8")
        if (content.length > MAX_FILE_BYTES || isBinary(content)) { telemetry.unreadableFiles++; continue }
        files.set(target.rel, { path: target.rel, content, lower: content.toLowerCase(), chunks: structuralChunks(target.rel, content) })
        telemetry.indexedFiles++
      } catch { telemetry.blockedFiles++ }
    }
    this.files = files
    this.dirty = false
    this.lastBuildTelemetry = { ...telemetry, elapsedMs: Date.now() - started }
  }

  async select(prompt: string, limit = 12, budgetChars = Number.MAX_SAFE_INTEGER): Promise<ContextSelection> {
    const started = Date.now()
    await this.rebuild()
    const query = terms(prompt)
    const key = query.slice().sort().join("\0") + "\0" + limit + "\0" + budgetChars + "\0" + this.generation
    if (!query.length) return { items: [], estimatedTokens: 0, cacheHit: false, telemetry: { ...this.lastBuildTelemetry, cacheHit: false, elapsedMs: Date.now() - started } }
    const cached = this.queryCache.get(key)
    if (cached && cached.expires > Date.now()) {
      return { ...cached.selection, cacheHit: true, telemetry: { ...cached.selection.telemetry, cacheHit: true, elapsedMs: Date.now() - started } }
    }
    const matches: ContextCandidate[] = []
    let matchedFiles = 0
    for (const file of this.files.values()) {
      const hitTerms = query.filter((term) => file.lower.includes(term))
      if (!hitTerms.length) continue
      matchedFiles++
      const occurrences = hitTerms.reduce((total, term) => total + Math.min(5, file.lower.split(term).length - 1), 0)
      const lines = file.content.split("\n")
      const hitLines = lines.map((line, index) => hitTerms.some((term) => line.toLowerCase().includes(term)) ? index : -1).filter((index) => index >= 0)
      const proximity = hitLines.some((line) => hitLines.some((other) => other - line <= 5)) ? 4 : 0
      const relevantChunks = file.chunks?.filter((chunk) => hitTerms.some((term) => chunk.text.toLowerCase().includes(term))) || []
      const imports = file.chunks?.filter((chunk) => chunk.kind === "ImportDeclaration") || []
      const chunks = [...imports, ...relevantChunks.filter((chunk) => chunk.kind !== "ImportDeclaration")]
      const symbolMatches = chunks.filter((chunk) => chunk.name && hitTerms.some((term) => chunk.name!.toLowerCase().includes(term))).length
      const pathMatches = file.path.toLowerCase().split(/[/.\\_-]/).filter((part) => query.includes(part)).length
      const score = hitTerms.length * 10 + occurrences * 2 + proximity + symbolMatches * 8 + pathMatches * 6
      const hit = file.content.split("\n").findIndex((line) => hitTerms.some((term) => line.toLowerCase().includes(term)))
      const excerpt = chunks.length
        ? chunks.map((chunk) => chunk.text).join("\n\n")
        : compressCode(file.content.split("\n").slice(Math.max(0, hit - 6), hit + 24).join("\n"), 36)
      matches.push({ path: file.path, score, excerpt, reason: `${chunks.length ? "structural lexical" : "lexical"} matches ${hitTerms.join(", ")}; frequency ${occurrences}, symbols ${symbolMatches}, path ${pathMatches}` })
    }
    const items: ContextCandidate[] = []
    let used = 0
    for (const candidate of matches.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))) {
      if (items.length >= limit || used >= budgetChars) break
      const excerpt = candidate.excerpt.slice(0, Math.max(0, budgetChars - used))
      if (!excerpt) break
      items.push({ ...candidate, excerpt })
      used += excerpt.length
    }
    const telemetry = {
      ...this.lastBuildTelemetry,
      cacheHit: false,
      matchedFiles,
      selectedFiles: items.length,
      candidates: matches.map((candidate) => ({ path: candidate.path, score: candidate.score, reason: candidate.reason, selected: items.some((item) => item.path === candidate.path) })),
      elapsedMs: Date.now() - started,
    }
    const selection = { items, estimatedTokens: Math.ceil(used / 4), cacheHit: false, telemetry }
    this.queryCache.set(key, { expires: Date.now() + CACHE_TTL_MS, selection })
    if (this.queryCache.size > 80) this.queryCache.delete(this.queryCache.keys().next().value!)
    return selection
  }
}

export function createProjectContextIndex(root: string, options: { watch?: boolean; extensions?: readonly string[] } = {}): ProjectContextIndex {
  return new IndexedProjectContext(root, new Set(options.extensions || SUPPORTED), options.watch)
}

export async function selectProjectContextWithBudget(root: string, prompt: string, limit = 12, budgetChars = Number.MAX_SAFE_INTEGER, options: { index?: ProjectContextIndex } = {}): Promise<ContextSelection> {
  let index = options.index || defaultIndexes.get(root)
  if (!index) {
    index = createProjectContextIndex(root)
    defaultIndexes.set(root, index)
  }
  return index.select(prompt, limit, budgetChars)
}

export async function selectProjectContext(root: string, prompt: string, limit = 6): Promise<ContextCandidate[]> {
  return (await selectProjectContextWithBudget(root, prompt, limit)).items
}

export function clearContextCache() {
  for (const index of defaultIndexes.values()) index.close()
  defaultIndexes.clear()
}

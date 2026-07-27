import { readFileSync } from "node:fs"
import { join } from "node:path"

export interface ContextCandidate {
  path: string
  score: number
  excerpt: string
  reason: string
}

export interface ContextSelection {
  items: ContextCandidate[]
  estimatedTokens: number
  cacheHit: boolean
}

const STOP_WORDS = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "what", "when", "where", "about", "please", "need", "want", "help", "code"])
const CACHE_TTL_MS = 60_000
const contextCache = new Map<string, { expires: number; selection: ContextSelection }>()

function terms(input: string) {
  return [...new Set(input.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g)?.filter((word) => !STOP_WORDS.has(word)) || [])]
}

export function compressCode(text: string, maxLines = 80) {
  const lines = text.split("\n")
  const kept = lines.filter((line) => /^(export |import |class |interface |type |function |const \w+\s*=\s*(async )?\(|\s{0,2}(public |private |async )?\w+\()/u.test(line.trim()) || line.trim().startsWith("//") || line.trim() === "")
  const result = kept.slice(0, maxLines).join("\n")
  return result || lines.slice(0, maxLines).join("\n")
}

export async function selectProjectContextWithBudget(root: string, prompt: string, limit = 12, budgetChars = Number.MAX_SAFE_INTEGER): Promise<ContextSelection> {
  const query = terms(prompt)
  if (!query.length) return { items: [], estimatedTokens: 0, cacheHit: false }
  const key = root + "\u0000" + query.sort().join("\u0000") + "\u0000" + limit + "\u0000" + budgetChars
  const cached = contextCache.get(key)
  if (cached && cached.expires > Date.now()) return { ...cached.selection, cacheHit: true }
  const matches: ContextCandidate[] = []
  for await (const path of new Bun.Glob("**/*.{ts,tsx,js,jsx,json,md,py,go,rs}").scan({ cwd: root, onlyFiles: true })) {
    if (path.includes("node_modules/") || path.includes(".git/") || path.includes("dist/")) continue
    try {
      const content = readFileSync(join(root, path), "utf8")
      const lower = content.toLowerCase()
      const hitTerms = query.filter((term) => lower.includes(term))
      if (!hitTerms.length) continue
      const score = hitTerms.length * 10 + (path.toLowerCase().split(/[/.\\_-]/).some((part) => query.includes(part)) ? 6 : 0)
      const hit = content.split("\n").findIndex((line) => hitTerms.some((term) => line.toLowerCase().includes(term)))
      const excerpt = compressCode(content.split("\n").slice(Math.max(0, hit - 6), hit + 24).join("\n"), 36)
      matches.push({ path: path.replaceAll("\\", "/"), score, excerpt, reason: `matches ${hitTerms.join(", ")}` })
    } catch { /* Ignore unreadable or binary files. */ }
  }
  const items: ContextCandidate[] = []
  let used = 0
  for (const candidate of matches.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))) {
    if (items.length >= limit || used >= budgetChars) break
    const remaining = budgetChars - used
    const excerpt = candidate.excerpt.slice(0, Math.max(0, remaining))
    if (!excerpt) break
    items.push({ ...candidate, excerpt })
    used += excerpt.length
  }
  const selection = { items, estimatedTokens: Math.ceil(used / 4), cacheHit: false }
  contextCache.set(key, { expires: Date.now() + CACHE_TTL_MS, selection })
  if (contextCache.size > 80) contextCache.delete(contextCache.keys().next().value!)
  return selection
}

export async function selectProjectContext(root: string, prompt: string, limit = 6): Promise<ContextCandidate[]> {
  return (await selectProjectContextWithBudget(root, prompt, limit)).items
}

export function clearContextCache() {
  contextCache.clear()
}

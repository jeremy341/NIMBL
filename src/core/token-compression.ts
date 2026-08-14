import { countTextTokens } from "./tokenizers"
import type { ProviderModel } from "./providers"

export type CompressionMode = "none" | "structural" | "minified"
export interface CompressionResult { text: string; mode: CompressionMode; originalTokens: number; compressedTokens: number; reduction: number; preserved: string[]; omitted: string[] }

function lineIsDeclaration(line: string) { return /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\b/.test(line.trim()) || /^(?:export\s+)?(?:public|private|protected|static|async)?\s*[A-Za-z_$][\w$]*\s*\([^)]*\)\s*[:{]/.test(line.trim()) }
function structural(source: string) {
  const lines = source.split(/\r?\n/); const kept: string[] = []; let inBlock = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("/*")) inBlock = true
    if (!inBlock && (trimmed.startsWith("import ") || trimmed.startsWith("export ") || lineIsDeclaration(line) || trimmed.startsWith("//"))) kept.push(line)
    if (trimmed.includes("*/")) inBlock = false
  }
  return kept.join("\n").replace(/\s+/g, " ").replace(/\s*([{}();,:])\s*/g, "$1").trim()
}
function minified(source: string) { return source.replace(/\/\*[\s\S]*?\*\/|(^|\s)\/\/.*$/gm, "$1").replace(/\s+/g, " ").replace(/\s*([{}();,:])\s*/g, "$1").trim() }

export function compressSource(source: string, model: ProviderModel, mode: CompressionMode = "structural"): CompressionResult {
  const originalTokens = countTextTokens(source, model).tokens; const text = mode === "none" ? source : mode === "minified" ? minified(source) : structural(source); const compressedTokens = countTextTokens(text, model).tokens
  const reduction = originalTokens ? Math.max(0, 1 - compressedTokens / originalTokens) : 0
  return { text, mode, originalTokens, compressedTokens, reduction, preserved: mode === "structural" ? ["imports", "exports", "declarations"] : ["source text"], omitted: mode === "none" ? [] : ["comments", "implementation whitespace"] }
}

export function compressContext(items: { path: string; excerpt: string; reason?: string }[], model: ProviderModel, budget: number, mode: CompressionMode = "structural") {
  const selected: CompressionResult[] = []; let used = 0
  for (const item of items) { const result = compressSource(item.excerpt, model, mode); if (used + result.compressedTokens > budget && selected.length) continue; selected.push(result); used += result.compressedTokens }
  return { items: selected, usedTokens: used, originalTokens: selected.reduce((sum, item) => sum + item.originalTokens, 0), reduction: selected.reduce((sum, item) => sum + item.originalTokens, 0) ? 1 - used / selected.reduce((sum, item) => sum + item.originalTokens, 0) : 0 }
}

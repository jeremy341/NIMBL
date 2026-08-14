import { parse } from "@babel/parser"
import { dirname } from "node:path"
import { structuralChunks } from "./structural-context"

export type EdgeKind = "import" | "export" | "references" | "inherits" | "calls" | "tests"

export interface FileSource {
  path: string
  source: string
}

export interface GraphSymbol {
  id: string
  file: string
  name: string
  kind: string
  startLine: number
}

export interface GraphExpansionEntry {
  path: string
  hop: number
  reason: string
  excerpt: string
}

interface ParsedFile {
  path: string
  symbols: GraphSymbol[]
  imports: Array<{ imported: string; source: string }>
  exports: string[]
  refs: string[]
  calls: string[]
  inherits: string[]
  isTest: boolean
}

interface FrontierItem {
  node: string
  hop: number
  reason: string
}

const SUPPORTED_SOURCE = /\.(ts|tsx|js|jsx|json)$/i
const TEST_FILE = /\.(test|spec)\./i
const TEST_FRAMEWORKS = new Set(["vitest", "@vitest/runner", "jest", "@jest/globals", "node:test", "bun:test", "@testing-library/react"])
const EXTENSION_CANDIDATES = ["", ".ts", ".tsx", ".js", ".jsx", ".json", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"]

export function fileId(path: string) { return `file:${path}` }
export function symbolId(path: string, name: string) { return `${path}#${name}` }

function fileOf(node: string) { return node.startsWith("file:") ? node.slice(5) : node.slice(0, node.indexOf("#")) }
function symbolName(node: string) { return node.slice(node.indexOf("#") + 1) }

function nodeName(node: any): string | undefined {
  if (node?.id?.name) return node.id.name
  if (node?.type === "VariableDeclaration") return node.declarations?.map((declaration: any) => declaration?.id?.name).filter(Boolean).join(", ")
  return undefined
}

function walk(node: any, parent: any, visit: (node: any, parent: any) => void) {
  if (!node || typeof node !== "object") return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, parent, visit)
    return
  }
  if (typeof node.type === "string") visit(node, parent)
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end" || key === "leadingComments" || key === "trailingComments" || key === "innerComments" || key === "extra") continue
    const value = node[key]
    if (value && typeof value === "object") walk(value, node, visit)
  }
}

function isMemberProperty(node: any, parent: any) {
  return parent?.type === "MemberExpression" && parent.property === node && parent.computed === false
    || parent?.type === "ObjectProperty" && parent.key === node && parent.computed === false
    || parent?.type === "Property" && parent.key === node && parent.computed === false
    || parent?.type === "ObjectMethod" && parent.key === node
    || parent?.type === "ClassMethod" && parent.key === node
}

function resolveRelative(base: string, specifier: string) {
  const parts: string[] = []
  for (const segment of (specifier.startsWith("/") ? specifier.slice(1) : specifier).split("/")) {
    if (segment === "." || segment === "") continue
    if (segment === "..") parts.pop()
    else parts.push(segment)
  }
  const prefix = specifier.startsWith("/") ? [] : base.split("/").filter(Boolean)
  return [...prefix, ...parts].join("/")
}

function resolveModuleSpecifier(file: string, specifier: string, files: Set<string>): string | undefined {
  const base = dirname(file).replaceAll("\\", "/")
  const candidates = specifier.startsWith(".")
    ? EXTENSION_CANDIDATES.map((extension) => resolveRelative(base, specifier + extension))
    : [specifier, ...EXTENSION_CANDIDATES.map((extension) => specifier + extension)]
  for (const candidate of candidates) if (files.has(candidate)) return candidate
  return undefined
}

function parseFile(source: FileSource): ParsedFile | undefined {
  if (!SUPPORTED_SOURCE.test(source.path)) return undefined
  const parsed: ParsedFile = { path: source.path, symbols: [], imports: [], exports: [], refs: [], calls: [], inherits: [], isTest: TEST_FILE.test(source.path) }
  try {
    if (/\.json$/i.test(source.path)) return parsed
    const ast = parse(source.source, { sourceType: "unambiguous", plugins: ["typescript", "jsx"], errorRecovery: false })
    const body = ast.program.body as any[]
    for (const entry of body) {
      const node = entry.type === "ExportNamedDeclaration" || entry.type === "ExportDefaultDeclaration" ? entry.declaration : entry
      const exported = entry.type === "ExportNamedDeclaration" || entry.type === "ExportDefaultDeclaration"
      if (node && (node.type === "ImportDeclaration")) {
        const moduleSource = node.source?.value
        if (typeof moduleSource !== "string") continue
        if (TEST_FRAMEWORKS.has(moduleSource)) parsed.isTest = true
        for (const specifier of node.specifiers || []) {
          const imported = specifier?.local?.name || specifier?.imported?.name || specifier?.imported
          if (imported) parsed.imports.push({ imported, source: moduleSource })
        }
        continue
      }
      if (!node || node.type === "ExportNamedDeclaration") continue
      const name = nodeName(node)
      if (!name) continue
      if (exported) parsed.exports.push(name)
      if (["FunctionDeclaration", "ClassDeclaration", "TSInterfaceDeclaration", "TSTypeAliasDeclaration", "TSEnumDeclaration", "VariableDeclaration"].includes(node.type)) {
        parsed.symbols.push({ id: symbolId(source.path, name), file: source.path, name, kind: node.type, startLine: node.loc?.start?.line ?? 0 })
      }
    }
    walk(ast, undefined, (node, parent) => {
      if (node.type === "Identifier" && !isMemberProperty(node, parent)) {
        if (!parsed.refs.includes(node.name)) parsed.refs.push(node.name)
        return
      }
      if (node.type === "CallExpression" && node.callee?.type === "Identifier") {
        if (!parsed.calls.includes(node.callee.name)) parsed.calls.push(node.callee.name)
        return
      }
      if (node.type === "ClassDeclaration" && (node.superClass || node.implements?.length)) {
        if (node.superClass?.type === "Identifier" && !parsed.inherits.includes(node.superClass.name)) parsed.inherits.push(node.superClass.name)
        for (const implementation of node.implements || []) if (implementation?.expression?.name && !parsed.inherits.includes(implementation.expression.name)) parsed.inherits.push(implementation.expression.name)
        return
      }
      if (node.type === "TSInterfaceDeclaration" && node.extends?.length) {
        for (const extension of node.extends) if (extension?.expression?.name && !parsed.inherits.includes(extension.expression.name)) parsed.inherits.push(extension.expression.name)
      }
    })
    return parsed
  } catch {
    return parsed
  }
}

export class DependencyGraph {
  private readonly sources = new Map<string, FileSource>()
  private readonly parsed = new Map<string, ParsedFile>()
  private fileset = new Set<string>()
  private readonly outgoing = new Map<string, Map<string, Set<EdgeKind>>>()
  private readonly incoming = new Map<string, Map<string, Set<EdgeKind>>>()
  private symbolByName = new Map<string, GraphSymbol[]>()

  constructor(sources: FileSource[]) {
    for (const source of sources) this.sources.set(source.path, source)
    this.fileset = new Set(this.sources.keys())
    for (const source of sources) this.parsed.set(source.path, parseFile(source) ?? { path: source.path, symbols: [], imports: [], exports: [], refs: [], calls: [], inherits: [], isTest: false })
    this.reindexSymbols()
    for (const file of this.sources.keys()) this.recomputeEdges(file)
  }

  /**
   * Build the dependency graph cooperatively, yielding to the event loop every
   * `yieldEvery` files so long first-time builds never block the UI spinner or
   * input. Produces the same graph as `new DependencyGraph(sources)`.
   */
  static async buildCooperative(
    sources: FileSource[],
    yieldFn: () => Promise<void>,
    yieldEvery = 16,
  ): Promise<DependencyGraph> {
    const graph = new DependencyGraph([])
    let processed = 0
    for (const source of sources) {
      graph.sources.set(source.path, source)
      graph.fileset = new Set(graph.sources.keys())
      graph.parsed.set(source.path, parseFile(source) ?? { path: source.path, symbols: [], imports: [], exports: [], refs: [], calls: [], inherits: [], isTest: false })
      if (++processed % yieldEvery === 0) await yieldFn()
    }
    graph.reindexSymbols()
    processed = 0
    for (const file of graph.sources.keys()) {
      graph.recomputeEdges(file)
      if (++processed % yieldEvery === 0) await yieldFn()
    }
    return graph
  }

  private reindexSymbols() {
    const byName = new Map<string, GraphSymbol[]>()
    for (const file of this.parsed.values()) {
      for (const symbol of file.symbols) {
        const bucket = byName.get(symbol.name)
        if (bucket) bucket.push(symbol)
        else byName.set(symbol.name, [symbol])
      }
    }
    this.symbolByName = byName
  }

  private setEdge(from: string, to: string, kind: EdgeKind) {
    if (from === to) return
    let targets = this.outgoing.get(from)
    if (!targets) { targets = new Map(); this.outgoing.set(from, targets) }
    let kinds = targets.get(to)
    if (!kinds) { kinds = new Set(); targets.set(to, kinds) }
    kinds.add(kind)
    let sources = this.incoming.get(to)
    if (!sources) { sources = new Map(); this.incoming.set(to, sources) }
    let reverse = sources.get(from)
    if (!reverse) { reverse = new Set(); sources.set(from, reverse) }
    reverse.add(kind)
  }

  private removeEdgesFrom(owner: string) {
    for (const from of [...this.outgoing.keys()]) {
      if (from === owner) this.outgoing.delete(from)
    }
    for (const [target, sources] of [...this.incoming.entries()]) {
      sources.delete(owner)
      if (sources.size === 0) this.incoming.delete(target)
    }
  }

  private resolveSymbol(name: string): GraphSymbol | undefined {
    const bucket = this.symbolByName.get(name)
    return bucket?.length === 1 ? bucket[0] : undefined
  }

  private recomputeEdges(path: string) {
    const file = this.parsed.get(path)
    if (!file) return
    this.removeEdgesFrom(fileId(path))
    for (const symbol of file.symbols) this.removeEdgesFrom(symbol.id)
    const fileNode = fileId(path)
    for (const importEntry of file.imports) {
      const target = resolveModuleSpecifier(path, importEntry.source, this.fileset)
      if (target) this.setEdge(fileNode, fileId(target), "import")
    }
    for (const symbol of file.symbols) {
      this.setEdge(fileNode, symbol.id, "export")
      if (file.isTest) this.setEdge(fileNode, symbol.id, "tests")
    }
    if (file.isTest) {
      for (const importEntry of file.imports) {
        const target = resolveModuleSpecifier(path, importEntry.source, this.fileset)
        if (target) this.setEdge(fileNode, fileId(target), "tests")
      }
    }
    for (const name of file.refs) {
      const symbol = this.resolveSymbol(name)
      if (symbol && symbol.file !== path) this.setEdge(fileNode, symbol.id, "references")
    }
    for (const name of file.calls) {
      const symbol = this.resolveSymbol(name)
      if (symbol && symbol.file !== path) this.setEdge(fileNode, symbol.id, "calls")
    }
    for (const name of file.inherits) {
      const symbol = this.resolveSymbol(name)
      if (symbol && symbol.file !== path) this.setEdge(fileNode, symbol.id, "inherits")
    }
  }

  invalidate(path: string, source?: string) {
    if (source !== undefined) {
      this.sources.set(path, { path, source })
      this.fileset = new Set(this.sources.keys())
      this.parsed.set(path, parseFile({ path, source }) ?? { path, symbols: [], imports: [], exports: [], refs: [], calls: [], inherits: [], isTest: false })
      this.reindexSymbols()
    }
    for (const file of this.sources.keys()) this.recomputeEdges(file)
  }

  fileCount() { return this.fileset.size }
  symbolCount() { return [...this.parsed.values()].reduce((total, file) => total + file.symbols.length, 0) }
  edgeCount() { return [...this.outgoing.values()].reduce((total, targets) => total + [...targets.values()].reduce((sum, kinds) => sum + kinds.size, 0), 0) }

  symbolEdges(path: string): string[] {
    return (this.outgoing.get(fileId(path)) ?? new Map<string, Set<EdgeKind>>()).size ? this.describeEdges(fileId(path)) : []
  }

  private describeEdges(node: string): string[] {
    const descriptions: string[] = []
    for (const [target, kinds] of this.outgoing.get(node) ?? []) {
      for (const kind of kinds) descriptions.push(this.describe(node, target, kind))
    }
    return descriptions.sort()
  }

  private describe(from: string, to: string, kind: EdgeKind): string {
    switch (kind) {
      case "import": return `${fileOf(from)} imports ${fileOf(to)}`
      case "tests": return `${fileOf(from)} tests ${fileOf(to)}`
      case "references": return `${symbolName(to)} referenced in ${fileOf(from)}`
      case "calls": return `${symbolName(to)} called in ${fileOf(from)}`
      case "inherits": return `${fileOf(from)} inherits ${symbolName(to)}`
      case "export": return `${fileOf(from)} exports ${symbolName(to)}`
    }
  }

  private excerptFor(path: string, reasons: string[], maxChars: number): string | undefined {
    const source = this.sources.get(path)?.source
    if (source === undefined) return undefined
    const chunks = structuralChunks(path, source) ?? []
    const wanted = chunks.filter((chunk) => chunk.name && reasons.some((reason) => reason.includes(chunk.name!)))
    const selected = (wanted.length ? wanted : chunks.slice(0, 6)).map((chunk) => chunk.text).join("\n\n")
    if (selected) return selected.slice(0, maxChars)
    return source.split("\n").slice(0, 48).join("\n").slice(0, maxChars)
  }

  expandFrom(seeds: string[], budgetChars: number, limit = 12): GraphExpansionEntry[] {
    const seedFiles = new Set(seeds)
    const visitedNodes = new Set<string>()
    const reasonsByNode = new Map<string, string[]>()
    const hopByNode = new Map<string, number>()
    const queue: FrontierItem[] = []
    for (const seed of seeds) {
      visitedNodes.add(fileId(seed))
      for (const [neighbor, kinds] of this.outgoing.get(fileId(seed)) ?? []) {
        for (const kind of kinds) queue.push({ node: neighbor, hop: 1, reason: this.describe(fileId(seed), neighbor, kind) })
      }
      for (const [neighbor, kinds] of this.incoming.get(fileId(seed)) ?? []) {
        for (const kind of kinds) queue.push({ node: neighbor, hop: 1, reason: this.describe(neighbor, fileId(seed), kind) })
      }
    }
    queue.sort((left, right) => left.hop - right.hop || left.node.localeCompare(right.node))
    while (queue.length) {
      const item = queue.shift()!
      hopByNode.set(item.node, Math.min(hopByNode.get(item.node) ?? item.hop, item.hop))
      const accumulated = reasonsByNode.get(item.node) ?? []
      if (!accumulated.includes(item.reason)) accumulated.push(item.reason)
      reasonsByNode.set(item.node, accumulated)
      if (visitedNodes.has(item.node)) continue
      visitedNodes.add(item.node)
      for (const [neighbor, kinds] of this.outgoing.get(item.node) ?? []) {
        if (visitedNodes.has(neighbor)) continue
        for (const kind of kinds) queue.push({ node: neighbor, hop: item.hop + 1, reason: this.describe(item.node, neighbor, kind) })
      }
      for (const [neighbor, kinds] of this.incoming.get(item.node) ?? []) {
        if (visitedNodes.has(neighbor)) continue
        for (const kind of kinds) queue.push({ node: neighbor, hop: item.hop + 1, reason: this.describe(neighbor, item.node, kind) })
      }
    }
    const byFile = new Map<string, { path: string; hop: number; reasons: string[] }>()
    for (const [node, reasons] of reasonsByNode) {
      const path = node.startsWith("file:") ? node.slice(5) : fileOf(node)
      if (seedFiles.has(path)) continue
      const entry = byFile.get(path) ?? { path, hop: Number.MAX_SAFE_INTEGER, reasons: [] }
      entry.hop = Math.min(entry.hop, hopByNode.get(node) ?? Number.MAX_SAFE_INTEGER)
      for (const reason of reasons) if (!entry.reasons.includes(reason)) entry.reasons.push(reason)
      byFile.set(path, entry)
    }
    const ordered = [...byFile.values()].sort((left, right) => left.hop - right.hop || left.path.localeCompare(right.path))
    const entries: GraphExpansionEntry[] = []
    let used = 0
    for (const result of ordered) {
      if (entries.length >= limit || used >= budgetChars) break
      const excerpt = this.excerptFor(result.path, result.reasons, Math.max(0, budgetChars - used))
      if (!excerpt) continue
      entries.push({ path: result.path, hop: result.hop, reason: "graph: " + result.reasons.join("; "), excerpt })
      used += excerpt.length
    }
    return entries
  }
}

export function buildDependencyGraph(sources: FileSource[]): DependencyGraph {
  return new DependencyGraph(sources)
}

export async function buildDependencyGraphCooperative(
  sources: FileSource[],
  yieldFn: () => Promise<void>,
  yieldEvery = 16,
): Promise<DependencyGraph> {
  return DependencyGraph.buildCooperative(sources, yieldFn, yieldEvery)
}

import { parse } from "@babel/parser"

export interface StructuralChunk {
  language: "typescript" | "javascript" | "json"
  kind: string
  name?: string
  text: string
  startLine: number
  endLine: number
}

interface ParsedNode {
  type: string
  start?: number
  end?: number
  loc?: { start: { line: number }; end: { line: number } }
  id?: { name?: string }
  declarations?: Array<{ id?: { name?: string } }>
  declaration?: ParsedNode
}

function nodeName(node: ParsedNode) {
  if (node.id?.name) return node.id.name
  if (node.type === "VariableDeclaration") return node.declarations?.map((declaration) => declaration.id?.name).filter(Boolean).join(", ")
  return undefined
}

function supported(node: ParsedNode) {
  return ["FunctionDeclaration", "ClassDeclaration", "TSInterfaceDeclaration", "TSTypeAliasDeclaration", "TSEnumDeclaration", "VariableDeclaration"].includes(node.type)
    || node.type === "ImportDeclaration"
}

function jsonChunks(source: string): StructuralChunk[] | undefined {
  try {
    const object = JSON.parse(source)
    if (!object || typeof object !== "object" || Array.isArray(object)) return [{ language: "json", kind: "value", text: source, startLine: 1, endLine: source.split("\n").length }]
    return Object.entries(object).map(([name, value]) => ({ language: "json", kind: "property", name, text: JSON.stringify({ [name]: value }, null, 2), startLine: 1, endLine: source.split("\n").length }))
  } catch { return undefined }
}

export function structuralChunks(path: string, source: string): StructuralChunk[] | undefined {
  if (/\.json$/i.test(path)) return jsonChunks(source)
  if (!/\.(ts|tsx|js|jsx)$/i.test(path)) return undefined
  try {
    const ast = parse(source, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx"],
      errorRecovery: false,
    })
    const language = /\.(ts|tsx)$/i.test(path) ? "typescript" as const : "javascript" as const
    const body = ast.program.body as unknown as ParsedNode[]
    const chunks = body.flatMap((entry) => {
      const node = entry.type === "ExportNamedDeclaration" || entry.type === "ExportDefaultDeclaration" ? entry.declaration : entry
      const sourceNode = entry.declaration ? entry : node
      if (!node || !sourceNode || !supported(node)) return []
      if (sourceNode.start === undefined || sourceNode.end === undefined || !sourceNode.loc) return []
      return [{ language, kind: node.type, name: nodeName(node), text: source.slice(sourceNode.start, sourceNode.end), startLine: sourceNode.loc.start.line, endLine: sourceNode.loc.end.line }]
    })
    return chunks.length ? chunks : undefined
  } catch { return undefined }
}

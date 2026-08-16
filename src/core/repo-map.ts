import { readFileSync } from "node:fs"
import { resolveUnprotectedProjectPath } from "./project-path"
import { structuralChunks } from "./structural-context"

const MAP_EXTENSIONS = "**/*.{ts,tsx,js,jsx,json}"

/** Build a compact structural orientation map for large repositories. */
export async function buildRepositoryMap(root: string, maxChars = 6_000): Promise<string> {
  const paths: string[] = []
  for await (const match of new Bun.Glob(MAP_EXTENSIONS).scan({ cwd: root, onlyFiles: true })) {
    if (match.includes("node_modules/") || match.includes(".git/") || match.includes(".nimbl/") || match.includes("dist/")) continue
    paths.push(match.replaceAll("\\", "/"))
    if (paths.length > 500) break
  }
  if (paths.length <= 30) return ""

  const sortedPaths = paths.sort()
  const lines: string[] = [`Repository map (${sortedPaths.length} source files; orientation only, read exact lines before editing):`]
  for (const path of sortedPaths) {
    try {
      const target = resolveUnprotectedProjectPath(root, path)
      const chunks = structuralChunks(path, readFileSync(target.full, "utf8")) || []
      const names = chunks.filter((chunk) => chunk.kind !== "import").map((chunk) => `${chunk.name || chunk.kind}@${chunk.startLine}`).slice(0, 12)
      lines.push(`${path}: ${names.join(", ") || "source"}`)
      if (lines.join("\n").length >= maxChars) break
    } catch { /* Skip protected, unreadable, or parser-incompatible files. */ }
  }
  return lines.join("\n").slice(0, maxChars)
}

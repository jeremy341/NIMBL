import { existsSync, realpathSync } from "node:fs"
import { basename, dirname, isAbsolute, relative, resolve } from "node:path"

function outside(root: string, target: string) {
  const rel = relative(root, target)
  return !rel || rel.startsWith("..") || isAbsolute(rel)
}

export function isProtectedEnvironmentPath(path: string) {
  return path.replaceAll("\\", "/").split("/").some((segment) =>
    (segment === ".env" || segment.startsWith(".env.")) && segment !== ".env.example",
  )
}

export function resolveProjectPath(root: string, path: string) {
  const canonicalRoot = realpathSync(resolve(root))
  const lexicalTarget = resolve(canonicalRoot, path)
  if (outside(canonicalRoot, lexicalTarget)) throw new Error(`Path "${path}" is outside this project.`)

  let existing = lexicalTarget
  const missing: string[] = []
  while (!existsSync(existing)) {
    const parent = dirname(existing)
    if (parent === existing) throw new Error(`Path "${path}" is outside this project.`)
    missing.unshift(basename(existing))
    existing = parent
  }

  const canonicalTarget = resolve(realpathSync(existing), ...missing)
  if (outside(canonicalRoot, canonicalTarget)) throw new Error(`Path "${path}" is outside this project.`)
  return { full: canonicalTarget, rel: relative(canonicalRoot, canonicalTarget).replaceAll("\\", "/") }
}

export function resolveUnprotectedProjectPath(root: string, path: string) {
  const target = resolveProjectPath(root, path)
  if (isProtectedEnvironmentPath(target.rel)) {
    throw new Error("Environment files are blocked by NIMBL's default safety policy.")
  }
  return target
}

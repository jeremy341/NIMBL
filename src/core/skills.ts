import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import type { NimblSettings } from "./settings"
import { resolveProjectPath } from "./project-path"

export interface SkillInfo {
  name: string
  description?: string
  location: string
  directory: string
  files: string[]
  content: string
}

export interface SkillSummary {
  name: string
  description?: string
  location: string
  directory: string
  source: "project" | "global" | "config"
}

export interface SkillLoadResult {
  name: string
  directory: string
  files: string[]
  content: string
}

export function parseSkillFrontmatter(source: string): { name?: string; description?: string; body: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { body: source.trim() }
  const fields: Record<string, string> = {}
  for (const line of match[1]!.split(/\r?\n/)) {
    const separator = line.indexOf(":")
    if (separator > 0) fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")
  }
  return { name: fields.name, description: fields.description, body: match[2]!.trim() }
}

export function globalSkillsDir(): string {
  const base = process.platform === "win32"
    ? process.env.APPDATA || join(homedir(), "AppData", "Roaming")
    : process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
  return join(base, "nimbl", "skills")
}

function projectSkillsDir(root: string): string {
  return join(root, ".nimbl", "skills")
}

function configSkillDirectories(settings?: NimblSettings): string[] {
  const paths = settings?.skills?.paths ?? []
  return paths.filter((item) => typeof item === "string" && item.trim()).map((item) => resolve(item.trim()))
}

export function skillDirectories(root: string, settings?: NimblSettings): string[] {
  return [projectSkillsDir(root), globalSkillsDir(), ...configSkillDirectories(settings), remoteSkillsCacheDir()]
}

export function remoteSkillsCacheDir(): string {
  const base = process.platform === "win32"
    ? process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local")
    : process.env.XDG_CACHE_HOME || join(homedir(), ".cache")
  return join(base, "nimbl", "skills-remote")
}

interface RemoteSkillIndex {
  skills?: Array<{ name: string; files?: string[]; version?: string }>
}

function sanitizeRemoteSlug(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/[^a-z0-9._-]/gi, "_").slice(0, 80)
}

export async function syncRemoteSkills(settings?: Pick<NimblSettings, "skills">, options?: { fetcher?: typeof fetch; signal?: AbortSignal }): Promise<SkillSummary[]> {
  const urls = settings?.skills?.urls ?? []
  if (!urls.length) return []
  const fetcher = options?.fetcher ?? fetch
  const summaries: SkillSummary[] = []
  const seen = new Set<string>()
  for (const raw of urls) {
    const url = raw.trim()
    if (!/^https?:\/\//i.test(url)) continue
    const cacheRoot = join(remoteSkillsCacheDir(), sanitizeRemoteSlug(url))
    try {
      const response = await fetcher(`${url}/index.json`, { signal: options?.signal })
      if (!response.ok) continue
      const index = (await response.json()) as RemoteSkillIndex
      for (const skill of index.skills ?? []) {
        const name = skill.name
        if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name) || seen.has(name)) continue
        seen.add(name)
        const directory = join(cacheRoot, name)
        mkdirSync(directory, { recursive: true })
        const file = join(directory, "SKILL.md")
        const body = await fetcher(`${url}/${name}/SKILL.md`, { signal: options?.signal })
        if (!body.ok) continue
        writeFileSync(file, await body.text(), "utf8")
        for (const relative of skill.files ?? []) {
          const safe = relative.replace(/\\/g, "/").split("/").filter((part) => part !== ".." && part !== ".").join("/")
          if (!safe || safe === "SKILL.md") continue
          const target = join(directory, safe)
          if (!target.startsWith(directory)) continue
          mkdirSync(dirname(target), { recursive: true })
          const item = await fetcher(`${url}/${name}/${safe}`, { signal: options?.signal })
          if (item.ok) writeFileSync(target, await item.text(), "utf8")
        }
        const parsed = parseSkillFrontmatter(readFileSync(file, "utf8"))
        summaries.push({ name, description: parsed.description, location: file, directory, source: "config" })
      }
    } catch {
      // Remote skill sync failures degrade silently; local skills still work.
    }
  }
  return summaries
}

export function canonicalSkillFile(root: string, name: string, settings?: NimblSettings): { file: string; source: "project" | "global" | "config" } {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) throw new Error("Skill names may contain letters, numbers, _ and - only.")
  const projectTarget = resolveProjectPath(root, join(".nimbl", "skills", name, "SKILL.md"))
  const expected = `.nimbl/skills/${name}/SKILL.md`
  if (projectTarget.rel !== expected) throw new Error("Skill must resolve to its canonical project skill file.")
  if (existsSync(projectTarget.full)) return { file: projectTarget.full, source: "project" }
  const globalFile = join(globalSkillsDir(), name, "SKILL.md")
  if (existsSync(globalFile)) return { file: globalFile, source: "global" }
  for (const slug of readdirSyncSafe(remoteSkillsCacheDir())) {
    const remoteFile = join(remoteSkillsCacheDir(), slug, name, "SKILL.md")
    if (existsSync(remoteFile)) return { file: remoteFile, source: "config" }
  }
  for (const directory of configSkillDirectories(settings)) {
    const file = join(directory, name, "SKILL.md")
    if (existsSync(file)) return { file, source: "config" }
  }
  throw new Error(`No skill named "${name}".`)
}

export function listSkillFiles(directory: string, limit = 20): string[] {
  const files: string[] = []
  function visit(folder: string, prefix: string) {
    if (files.length >= limit) return
    let entries
    try {
      entries = readdirSync(folder, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (files.length >= limit) return
      if (entry.name === ".git" || entry.name === "node_modules") continue
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) visit(join(folder, entry.name), relative)
      else if (entry.isFile()) files.push(relative)
    }
  }
  visit(directory, "")
  return files.sort((left, right) => left.localeCompare(right))
}

export function discoverSkills(root: string, settings?: NimblSettings): SkillSummary[] {
  const result: SkillSummary[] = []
  const seen = new Set<string>()
  const remoteRoot = remoteSkillsCacheDir()
  for (const directory of skillDirectories(root, settings)) {
    const isRemoteRoot = directory === remoteRoot
    const roots = isRemoteRoot
      ? readdirSyncSafe(remoteRoot).map((slug) => join(remoteRoot, slug))
      : [directory]
    for (const rootDir of roots) {
      let entries
      try {
        entries = readdirSync(rootDir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || seen.has(entry.name)) continue
        if (!/^[a-z0-9][a-z0-9_-]*$/i.test(entry.name)) continue
        const file = join(rootDir, entry.name, "SKILL.md")
        if (!existsSync(file)) continue
        seen.add(entry.name)
        const source = isRemoteRoot
          ? "config"
          : rootDir === projectSkillsDir(root)
            ? "project"
            : rootDir === globalSkillsDir()
              ? "global"
              : "config"
        const parsed = parseSkillFrontmatter(readFileSync(file, "utf8"))
        result.push({ name: entry.name, description: parsed.description, location: file, directory: rootDir, source })
      }
    }
  }
  return result.sort((left, right) => left.name.localeCompare(right.name))
}

function readdirSyncSafe(directory: string): string[] {
  try { return readdirSync(directory) } catch { return [] }
}

export function loadSkill(root: string, name: string, settings?: NimblSettings): SkillLoadResult {
  const canonical = canonicalSkillFile(root, name)
  const parsed = parseSkillFrontmatter(readFileSync(canonical.file, "utf8"))
  return {
    name: parsed.name || name,
    directory: dirname(canonical.file),
    files: listSkillFiles(dirname(canonical.file)),
    content: parsed.body,
  }
}

export function availableSkillGuidance(skills: SkillSummary[]): string {
  const lines = [
    "Skills provide specialized instructions and workflows for specific tasks.",
    "Use the skill tool to load a skill when a task matches its description.",
  ]
  if (!skills.length) {
    lines.push("No skills are currently available.")
    return lines.join("\n")
  }
  lines.push("<available_skills>")
  for (const skill of skills) {
    lines.push("  <skill>")
    lines.push(`    <name>${skill.name}</name>`)
    lines.push(`    <description>${skill.description ?? "No description."}</description>`)
    lines.push("  </skill>")
  }
  lines.push("</available_skills>")
  return lines.join("\n")
}

/**
 * Lexical (BM25-flavoured) relevance selection for the available-skills block.
 * Scores each skill by how many prompt terms appear in its name + description,
 * keeping only the most relevant `limit` (default 6). This trims the guidance
 * block to the skills likely to match the current task instead of listing the
 * whole catalog — a pure token reduction that never hides a loaded skill.
 * When no skill matches, the first `limit` (alphabetical) are kept so the
 * guidance is never empty.
 */
export function selectRelevantSkills(skills: SkillSummary[], prompt: string, limit = 6): SkillSummary[] {
  if (!skills.length || !prompt.trim()) return skills.slice(0, limit)
  const terms = prompt.toLowerCase().split(/[^a-z0-9_]+/).filter((term) => term.length > 2)
  if (!terms.length) return skills.slice(0, limit)
  const scored = skills.map((skill) => {
    const haystack = `${skill.name} ${skill.description ?? ""}`.toLowerCase()
    const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0)
    return { skill, score }
  })
  scored.sort((left, right) => right.score - left.score || left.skill.name.localeCompare(right.skill.name))
  return scored.slice(0, limit).map(({ skill }) => skill)
}

export function ensureSkillDirectory(root: string) {
  const directory = projectSkillsDir(root)
  mkdirSync(directory, { recursive: true })
  return directory
}

export function skillNameFromFile(file: string): string {
  const name = basename(dirname(file))
  return /^[a-z0-9][a-z0-9_-]*$/i.test(name) ? name : name.toLowerCase()
}

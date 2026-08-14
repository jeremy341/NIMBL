import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs"
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
  return [projectSkillsDir(root), globalSkillsDir(), ...configSkillDirectories(settings)]
}

export function canonicalSkillFile(root: string, name: string, settings?: NimblSettings): { file: string; source: "project" | "global" | "config" } {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) throw new Error("Skill names may contain letters, numbers, _ and - only.")
  const projectTarget = resolveProjectPath(root, join(".nimbl", "skills", name, "SKILL.md"))
  const expected = `.nimbl/skills/${name}/SKILL.md`
  if (projectTarget.rel !== expected) throw new Error("Skill must resolve to its canonical project skill file.")
  if (existsSync(projectTarget.full)) return { file: projectTarget.full, source: "project" }
  const globalFile = join(globalSkillsDir(), name, "SKILL.md")
  if (existsSync(globalFile)) return { file: globalFile, source: "global" }
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
  for (const directory of skillDirectories(root, settings)) {
    let entries
    try {
      entries = readdirSync(directory, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || seen.has(entry.name)) continue
      if (!/^[a-z0-9][a-z0-9_-]*$/i.test(entry.name)) continue
      const file = join(directory, entry.name, "SKILL.md")
      if (!existsSync(file)) continue
      seen.add(entry.name)
      const source = directory === projectSkillsDir(root) ? "project" : directory === globalSkillsDir() ? "global" : "config"
      const parsed = parseSkillFrontmatter(readFileSync(file, "utf8"))
      result.push({ name: entry.name, description: parsed.description, location: file, directory, source })
    }
  }
  return result.sort((left, right) => left.name.localeCompare(right.name))
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

export function ensureSkillDirectory(root: string) {
  const directory = projectSkillsDir(root)
  mkdirSync(directory, { recursive: true })
  return directory
}

export function skillNameFromFile(file: string): string {
  const name = basename(dirname(file))
  return /^[a-z0-9][a-z0-9_-]*$/i.test(name) ? name : name.toLowerCase()
}

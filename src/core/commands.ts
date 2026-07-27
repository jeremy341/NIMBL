import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

export interface ProjectCommand {
  name: string
  description: string
  prompt: string
  agent?: "build" | "plan" | "explain" | "learn"
  model?: string
}

function parseFrontmatter(source: string) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { fields: {} as Record<string, string>, body: source.trim() }
  const fields: Record<string, string> = {}
  for (const line of match[1]!.split(/\r?\n/)) {
    const separator = line.indexOf(":")
    if (separator > 0) fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")
  }
  return { fields, body: match[2]!.trim() }
}

export function loadProjectCommands(root: string): Record<string, ProjectCommand> {
  const folder = join(root, ".nimbl", "commands")
  if (!existsSync(folder)) return {}
  const result: Record<string, ProjectCommand> = {}
  for (const file of readdirSync(folder)) {
    if (!file.endsWith(".md")) continue
    const name = file.slice(0, -3)
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) continue
    const { fields, body } = parseFrontmatter(readFileSync(join(folder, file), "utf8"))
    if (!body) continue
    result[name] = { name, description: fields.description || name, prompt: body, agent: ["build", "plan", "explain", "learn"].includes(fields.agent || "") ? fields.agent as ProjectCommand["agent"] : undefined, model: fields.model }
  }
  return result
}

export function expandCommand(command: Pick<ProjectCommand, "prompt">, argument = "") {
  const args = argument.trim() ? argument.trim().split(/\s+/) : []
  return command.prompt.replace(/\$ARGUMENTS|\$(\d+)/g, (token, position) => token === "$ARGUMENTS" ? argument.trim() : args[Number(position) - 1] || "")
}

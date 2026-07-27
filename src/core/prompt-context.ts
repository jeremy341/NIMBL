import { existsSync, readFileSync } from "node:fs"
import { basename, isAbsolute, relative, resolve } from "node:path"

export interface PromptPreparation {
  text: string
  attachments: string[]
  commands: string[]
}

export interface PromptPreparationOptions {
  root: string
  text: string
  runCommand: (command: string) => Promise<string>
}

function insideProject(root: string, path: string) {
  const full = resolve(root, path)
  const rel = relative(root, full)
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`Reference "${path}" is outside this project.`)
  return { full, rel: rel.replaceAll("\\", "/") }
}

function readAttachment(root: string, path: string) {
  const target = insideProject(root, path)
  const name = basename(target.full)
  if ((name === ".env" || name.startsWith(".env.")) && name !== ".env.example") throw new Error("Environment files cannot be attached.")
  if (!existsSync(target.full)) throw new Error(`Referenced file "${path}" was not found.`)
  const content = readFileSync(target.full, "utf8")
  return { path: target.rel, content: content.length > 24_000 ? content.slice(0, 24_000) + "\n… attachment truncated by NIMBL" : content }
}

/** Expands OpenCode-style @file and !\`command\` parts before the model sees a prompt. */
export async function preparePromptContext(options: PromptPreparationOptions): Promise<PromptPreparation> {
  const attachments: string[] = []
  const commands: string[] = []
  const blocks: string[] = []
  const matches = [...options.text.matchAll(/(^|\s)@([a-zA-Z0-9_./\\-]+(?:\.[a-zA-Z0-9_-]+)?)/g)].slice(0, 4)
  for (const match of matches) {
    const attachment = readAttachment(options.root, match[2]!)
    attachments.push(attachment.path)
    blocks.push(`Attached file: ${attachment.path}\n\n${attachment.content}`)
  }
  const shellParts = [...options.text.matchAll(/!`([^`\r\n]+)`/g)].slice(0, 3)
  for (const match of shellParts) {
    const command = match[1]!.trim()
    if (!command) continue
    commands.push(command)
    blocks.push(`User-requested command output (${command}):\n\n${await options.runCommand(command)}`)
  }
  return { text: [options.text, ...blocks].join("\n\n"), attachments, commands }
}

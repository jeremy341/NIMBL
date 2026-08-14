import { existsSync, readFileSync } from "node:fs"
import { resolveUnprotectedProjectPath } from "./project-path"

export interface PromptPreparation {
  text: string
  attachments: string[]
  commands: string[]
  attachmentDetails?: PromptAttachment[]
}

export interface PromptAttachment { path: string; startLine?: number; endLine?: number; content: string; chip: string }

export interface PromptPreparationOptions {
  root: string
  text: string
  runCommand: (command: string) => Promise<string>
}

function readAttachment(root: string, path: string, startLine?: number, endLine?: number): PromptAttachment {
  let target
  try {
    target = resolveUnprotectedProjectPath(root, path)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.startsWith("Environment files")) throw new Error("Environment files cannot be attached.")
    throw error
  }
  if (!existsSync(target.full)) throw new Error(`Referenced file "${path}" was not found.`)
  const raw = readFileSync(target.full, "utf8")
  const selected = startLine ? raw.split(/\r?\n/).slice(Math.max(0, startLine - 1), endLine || startLine).join("\n") : raw
  const content = selected.length > 24_000 ? selected.slice(0, 24_000) + "\n… attachment truncated by NIMBL" : selected
  return { path: target.rel, startLine, endLine, content, chip: `@${target.rel}${startLine ? `:${startLine}${endLine && endLine !== startLine ? `-${endLine}` : ""}` : ""}` }
}

export function parseAttachmentReferences(text: string) {
  const results: { path: string; startLine?: number; endLine?: number }[] = []
  const expression = /(^|\s)@(?:"([^"]+)"|([^\s]+?))(?:\:(\d+)(?:-(\d+))?)?(?=\s|$)/g
  for (const match of text.matchAll(expression)) { const path = (match[2] || match[3] || "").replace(/^@/, ""); if (path && !path.startsWith("http")) results.push({ path, startLine: match[4] ? Number(match[4]) : undefined, endLine: match[5] ? Number(match[5]) : undefined }) }
  return results.slice(0, 8)
}

/** Expands OpenCode-style @file and !\`command\` parts before the model sees a prompt. */
export async function preparePromptContext(options: PromptPreparationOptions): Promise<PromptPreparation> {
  const attachments: string[] = []
  const attachmentDetails: PromptAttachment[] = []
  const commands: string[] = []
  const blocks: string[] = []
  for (const reference of parseAttachmentReferences(options.text)) {
    const attachment = readAttachment(options.root, reference.path, reference.startLine, reference.endLine)
    attachments.push(attachment.path)
    attachmentDetails.push(attachment)
    blocks.push(`Attached file: ${attachment.path}\n\n${attachment.content}`)
  }
  const shellParts = [...options.text.matchAll(/!`([^`\r\n]+)`/g)].slice(0, 3)
  for (const match of shellParts) {
    const command = match[1]!.trim()
    if (!command) continue
    commands.push(command)
    blocks.push(`User-requested command output (${command}):\n\n${await options.runCommand(command)}`)
  }
  return { text: [options.text, ...blocks].join("\n\n"), attachments, commands, attachmentDetails }
}

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type { SessionStore, StoredMessage } from "./sessions"

export type ExportFormat = "markdown" | "json"
export interface ExportOptions { format?: ExportFormat; includeReasoning?: boolean; includeTools?: boolean; redactSecrets?: boolean }

export function redactSecrets(value: string) {
  return value
    .replace(/(Bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|token|secret|password)\s*[:=]\s*)([^\s,;]+)/gi, "$1[REDACTED]")
    .replace(/\b(?:sk|pk)-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]")
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "[PRIVATE KEY REDACTED]")
}

function messageForExport(message: StoredMessage, options: ExportOptions) {
  if (message.role === "reasoning" && options.includeReasoning === false) return undefined
  if (message.role === "tool" && options.includeTools === false) return undefined
  const clone = structuredClone(message)
  if (options.includeReasoning === false) { clone.agentText = undefined; clone.parts = clone.parts?.filter((part) => part.type !== "reasoning") }
  if (options.includeTools === false) clone.parts = clone.parts?.filter((part) => part.type !== "tool")
  if (options.redactSecrets !== false) { clone.text = redactSecrets(clone.text); if (clone.output) clone.output = redactSecrets(clone.output); if (clone.detail) clone.detail = redactSecrets(clone.detail) }
  return clone
}

export function exportSession(store: SessionStore, sessionID = store.activeID, options: ExportOptions = {}) {
  const session = store.sessions.find((candidate) => candidate.id === sessionID)
  if (!session) throw new Error(`Session "${sessionID}" was not found.`)
  const messages = session.messages.map((message) => messageForExport(message, options)).filter((message): message is StoredMessage => Boolean(message))
  if ((options.format || "markdown") === "json") {
    const share = session.share ? { id: session.share.id, url: session.share.url, sharedAt: session.share.sharedAt } : undefined
    return JSON.stringify({ version: 1, provider: store.provider, model: store.model, session: { ...session, share, messages } }, null, 2) + "\n"
  }
  const lines = [`# ${session.title}`, ``, `- Provider: ${store.provider}`, `- Model: ${store.model}`, `- Created: ${new Date(session.created).toISOString()}`, ``]
  for (const message of messages) { lines.push(`## ${message.role} · ${new Date(message.time).toISOString()}`, "", message.text || "") ; if (message.parts?.length) for (const part of message.parts) lines.push("", `### ${part.type}`, part.type === "tool" ? `${part.tool}: ${part.title}\n${part.output || part.detail || ""}` : part.text) ; lines.push("") }
  return lines.join("\n")
}

export function writeSessionExport(file: string, content: string) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, content, { encoding: "utf8", mode: 0o600 }); return file }

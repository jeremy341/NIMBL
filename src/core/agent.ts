import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { stepCountIs, streamText, tool } from "ai"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname } from "node:path"
import { z } from "zod"
import { compatibilityIssues, getProvider, resolveModel, type ProviderModel } from "./providers"
import { selectProjectContextWithBudget, type ProjectContextIndex } from "./context"
import type { ContextRetrievalTelemetry } from "./context"
import { teachingPrompt, type LearningState } from "./learning"
import type { PermissionSettings } from "./settings"
import { permissionExplanation, permissionFor } from "./permissions"
import { ASSISTANT_RESPONSE_STYLE, stripEmojis } from "./response-style"
import { resolveProjectPath, resolveUnprotectedProjectPath } from "./project-path"
import { runShellCommand } from "./shell"
import { fitRequestToBudget, type RequestBudgetBreakdown } from "./request-budget"
import { countTextTokens } from "./tokenizers"
import { buildCachedPrompt } from "./prompt-cache"
import { compressContext, type CompressionMode } from "./token-compression"
import { availableSkillGuidance, discoverSkills, loadSkill } from "./skills"
import type { NimblSettings } from "./settings"

export type AgentMode = "build" | "plan" | "explain" | "learn"
export type ApprovalChoice = "once" | "always" | "reject"

export interface AgentMessage {
  role: "user" | "assistant" | "system"
  text: string
}

export interface PermissionRequest {
  id: string
  tool: "read" | "glob" | "grep" | "write" | "edit" | "apply_patch" | "bash" | "webfetch" | "websearch" | "skill" | "question" | "todowrite" | "delegate"
  title: string
  detail: string
  diff?: string
  target?: string
}

export interface ToolEvent {
  kind: "tool"
  id: string
  tool: string
  state: "running" | "completed" | "rejected" | "failed"
  title: string
  detail?: string
  output?: string
  diff?: string
  path?: string
}

export type AgentEvent =
  | { kind: "text"; delta: string }
  | { kind: "reasoning"; delta: string }
  | ToolEvent

export interface AgentRunOptions {
  root: string
  provider: string
  model: string
  apiKey: string
  mode: AgentMode
  messages: AgentMessage[]
  summary?: string
  onEvent: (event: AgentEvent) => void
  requestApproval: (request: PermissionRequest) => Promise<ApprovalChoice>
  askQuestion?: (question: { id: string; prompt: string; options: string[]; freeform?: boolean }) => Promise<string>
  delegateTask?: (request: { id: string; prompt: string; agent?: AgentMode }) => Promise<string>
  onFileChange?: (change: { path: string; before: string; after: string; beforeExists: boolean; afterExists: boolean }) => void
  onFileChanges?: (changes: { path: string; before: string; after: string; beforeExists: boolean; afterExists: boolean }[]) => void
  learning?: LearningState
  abortSignal?: AbortSignal
  permissions?: PermissionSettings
  contextWindow?: number
  contextIndex?: ProjectContextIndex
  onRetry?: (retry: { attempt: number; message: string }) => void
  retryDelayMs?: number
  maxToolSteps?: number
  maxAttempts?: number
  maxTokens?: number
  doomLoopThreshold?: number
  runID?: string
  parentTaskID?: string
  onTaskEvent?: (event: { type: "step" | "budget" | "doom-loop"; detail: string }) => void
  compression?: CompressionMode
  settings?: NimblSettings
}

export interface AgentRunResult {
  text: string
  reasoning: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    noCacheTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
    textTokens?: number
    reasoningTokens?: number
  }
  attempts: number
  latencyMs: number
  cacheKey?: string
  finishReason?: string
  rawFinishReason?: string
  callId?: string
  responseId?: string
  requestId?: string
  budget: RequestBudgetBreakdown
  retrieval: ContextRetrievalTelemetry
}

const MAX_FILE_BYTES = 48_000
const MAX_SEARCH_FILES = 250
const MAX_TOOL_STEPS = 12
const MAX_ATTEMPTS = 3

const MODE_TOOLS: Record<AgentMode, readonly PermissionRequest["tool"][]> = {
  build: ["read", "glob", "grep", "write", "edit", "apply_patch", "bash", "webfetch", "websearch", "skill", "question", "todowrite", "delegate"],
  plan: ["read", "glob", "grep", "webfetch", "websearch", "skill", "question", "todowrite", "delegate"],
  explain: ["read", "glob", "grep", "skill", "question"],
  learn: ["read", "skill", "question", "todowrite"],
}

function assertModeTool(mode: AgentMode, tool: PermissionRequest["tool"]) {
  if (!MODE_TOOLS[mode].includes(tool)) throw new Error(`${mode} mode does not permit the ${tool} tool. Switch to Build to modify files or run commands.`)
}

function modePrompt(mode: AgentMode) {
  if (mode === "build") return "Build mode: make small, approved changes when they are necessary; verify them with the relevant checks."
  if (mode === "plan") return "Plan mode: investigate with read-only tools and produce a concrete, ordered implementation plan. Never change files or run shell commands."
  if (mode === "explain") return "Explain mode: teach the relevant code and trade-offs clearly. Do not propose autonomous edits; use examples only when they improve understanding."
  return "Learn mode: guide the user with Socratic questions, a small hint ladder, and a short practice step before giving a complete solution. Never change files or run commands."
}

function createModel(config: Pick<AgentRunOptions, "provider" | "model" | "apiKey">) {
  const provider = getProvider(config.provider)
  if (provider.protocol === "anthropic") return createAnthropic({ apiKey: config.apiKey, baseURL: provider.baseURL })(config.model)
  const client = createOpenAI({ baseURL: provider.baseURL, apiKey: config.apiKey, headers: provider.headers })
  return provider.id === "openai" ? client.responses(config.model) : client.chat(config.model)
}

function requestModel(options: AgentRunOptions): ProviderModel {
  return resolveModel(options.provider, options.model, options.contextWindow)
}

function budgetPromptParts(text: string) {
  const markers = ["\n\nAttached file:", "\n\nUser-requested command output"]
  const indexes = markers.map((marker) => text.indexOf(marker)).filter((index) => index >= 0)
  const start = indexes.length ? Math.min(...indexes) : -1
  return start < 0 ? { history: text, attachment: "" } : { history: text.slice(0, start), attachment: text.slice(start) }
}

function toolID() { return Math.random().toString(36).slice(2, 10) }

export function retryable(error: unknown) {
  if (error instanceof TypeError) return true
  if (!error || typeof error !== "object") return false
  const name = "name" in error ? String((error as { name?: unknown }).name) : ""
  // The AI SDK collapses an exhausted retry or an empty stream into
  // NoOutputGeneratedError; the underlying cause carries the 429/5xx status.
  if (name === "AI_NoOutputGeneratedError" || name === "AI_RetryError") {
    const status = "statusCode" in error ? Number((error as { statusCode?: unknown }).statusCode)
      : "status" in error ? Number((error as { status?: unknown }).status)
      : 0
    if (status === 408 || status === 409 || status === 429 || status >= 500) return true
    const message = error instanceof Error ? error.message : ""
    return /rate limit|too many requests|overloaded|temporarily|ECONN|ETIMEDOUT|EAI_AGAIN|429|50\d/i.test(message)
  }
  const status = "statusCode" in error ? Number(error.statusCode) : "status" in error ? Number(error.status) : 0
  const code = "code" in error ? String(error.code) : ""
  return status === 408 || status === 409 || status === 429 || status >= 500 || ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN"].includes(code)
}

/** Convert an AI SDK stream error part into a readable provider error. */
export function describeStreamError(error: unknown, provider: string, model: string): Error {
  const status = error && typeof error === "object" && "statusCode" in error ? Number((error as { statusCode?: unknown }).statusCode) : 0
  const message = error instanceof Error ? error.message : error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message)
    : ""
  if (status === 429) {
    return new Error(`Rate limit exceeded for ${provider}/${model}. Wait a moment and retry.${message ? ` (${message})` : ""}`)
  }
  if (status >= 500) {
    return new Error(`${provider} returned a server error (HTTP ${status}). Retrying may help.${message ? ` (${message})` : ""}`)
  }
  if (message) return new Error(`${provider} request failed: ${message}`)
  return new Error(`No output generated by ${provider}/${model}. The provider closed the stream without a response.`)
}

function wait(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(new Error("Interrupted by user."))
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", onAbort)
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      cleanup()
      reject(new Error("Interrupted by user."))
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

function relativePath(root: string, path: string) {
  return resolveProjectPath(root, path)
}

function assertReadable(root: string, path: string) {
  return resolveUnprotectedProjectPath(root, path)
}

function clip(text: string, limit = MAX_FILE_BYTES) {
  return text.length <= limit ? text : text.slice(0, limit) + "\n\n… output truncated by NIMBL"
}

function fileDiff(path: string, before: string, after: string) {
  const oldLines = before.split("\n")
  const newLines = after.split("\n")
  const limit = 140
  const lines = ["--- a/" + path, "+++ b/" + path, "@@"]
  const maximum = Math.max(oldLines.length, newLines.length)
  for (let index = 0; index < maximum && lines.length < limit; index++) {
    const oldLine = oldLines[index]
    const newLine = newLines[index]
    if (oldLine === newLine) continue
    if (oldLine !== undefined) lines.push("-" + oldLine)
    if (newLine !== undefined) lines.push("+" + newLine)
  }
  if (lines.length === 3) return "No textual change"
  if (lines.length >= limit) lines.push("… diff truncated")
  return lines.join("\n")
}

function projectInstructions(root: string) {
  return ["AGENTS.md", "NIMBL.md"]
    .map((name) => {
      try { return resolveUnprotectedProjectPath(root, name).full } catch { return "" }
    })
    .filter((file) => file && existsSync(file))
    .map((file) => `Project instructions (${basename(file)}):\n${clip(readFileSync(file, "utf8"), 12_000)}`)
    .join("\n\n")
}

function safeURL(value: string) {
  const url = new URL(value)
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http and https URLs can be fetched.")
  return url
}

function patchPaths(root: string, patch: string) {
  const paths = new Set<string>()
  for (const match of patch.matchAll(/^\+\+\+\s+(?:b\/)?([^\s]+)|^---\s+(?:a\/)?([^\s]+)/gm)) {
    const path = (match[1] || match[2])?.trim()
    if (!path || path === "/dev/null") continue
    paths.add(relativePath(root, path).rel)
  }
  if (!paths.size) throw new Error("Patch does not contain project-relative file paths.")
  return [...paths]
}

async function applyUnifiedPatch(root: string, patch: string) {
  const child = Bun.spawn(["git", "apply", "--whitespace=nowarn", "-"], { cwd: root, stdin: new Blob([patch]), stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  if (code !== 0) throw new Error((stderr || stdout || "git apply failed").trim())
}

export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  let attemptActivity = false
  const repeatedToolCalls = new Map<string, number>()
  const emitTool = (event: Omit<ToolEvent, "kind">) => {
    attemptActivity = true
    options.onEvent({ kind: "tool", ...event })
  }
  const approve = async (toolName: PermissionRequest["tool"], title: string, detail: string, diff?: string, target?: string) => {
    assertModeTool(options.mode, toolName)
    const policy = permissionFor(options.permissions, { tool: toolName, target: target || detail })
    if (policy === "deny") throw new Error(`${toolName} is blocked by project policy.`)
    if (policy === "allow") return
    const choice = await options.requestApproval({ id: toolID(), tool: toolName, title, detail, diff, target })
    if (choice === "reject") throw new Error("The user rejected this action.")
  }

  const tools = {
    read: tool({
      description: "Read a UTF-8 text file from the current project. Environment files are protected.",
      inputSchema: z.object({ path: z.string().describe("Project-relative file path"), startLine: z.number().int().positive().optional(), endLine: z.number().int().positive().optional() }),
      execute: async ({ path, startLine, endLine }) => {
        const event = toolID(); emitTool({ id: event, tool: "read", state: "running", title: "Read " + path, path })
        try {
          const target = assertReadable(options.root, path)
          await approve("read", "Read " + target.rel, "Read this project file.", undefined, target.rel)
          const lines = readFileSync(target.full, "utf8").split("\n")
          const text = lines.slice((startLine || 1) - 1, endLine || lines.length).map((line, index) => String((startLine || 1) + index).padStart(5) + "  " + line).join("\n")
          const output = clip(text)
          emitTool({ id: event, tool: "read", state: "completed", title: "Read " + target.rel, path: target.rel, output })
          return output
        } catch (error) { const message = error instanceof Error ? error.message : String(error); emitTool({ id: event, tool: "read", state: "failed", title: "Read " + path, detail: message }); return "Error: " + message }
      },
    }),
    glob: tool({
      description: "Find files using a glob pattern inside the current project.",
      inputSchema: z.object({ pattern: z.string().describe("Glob such as src/**/*.ts") }),
      execute: async ({ pattern }) => {
        const event = toolID(); emitTool({ id: event, tool: "glob", state: "running", title: "Find " + pattern })
        try {
          await approve("glob", "Find " + pattern, "Search project file names.", undefined, pattern)
          const files: string[] = []
          for await (const match of new Bun.Glob(pattern).scan({ cwd: options.root, onlyFiles: true })) {
            if (!match.includes("node_modules/") && !match.includes(".git/")) {
              try { files.push(resolveUnprotectedProjectPath(options.root, match).rel) } catch { /* Skip protected and escaping links. */ }
            }
            if (files.length >= 200) break
          }
          const output = files.join("\n") || "No files found."
          emitTool({ id: event, tool: "glob", state: "completed", title: "Found " + files.length + " files", output: clip(output, 12_000) })
          return clip(output, 12_000)
        } catch (error) { const message = error instanceof Error ? error.message : String(error); emitTool({ id: event, tool: "glob", state: "failed", title: "Find " + pattern, detail: message }); return "Error: " + message }
      },
    }),
    grep: tool({
      description: "Search project text files for a regular expression. Returns matching paths and line numbers.",
      inputSchema: z.object({ query: z.string().describe("Regular expression or text to search for"), pattern: z.string().optional().describe("Optional file glob, e.g. src/**/*.ts") }),
      execute: async ({ query, pattern }) => {
        const event = toolID(); emitTool({ id: event, tool: "grep", state: "running", title: "Search " + query })
        try {
          await approve("grep", "Search " + query, "Search text in project files.", undefined, query)
          const regex = new RegExp(query, "i")
          const matches: string[] = []
          let seen = 0
          for await (const match of new Bun.Glob(pattern || "**/*").scan({ cwd: options.root, onlyFiles: true })) {
            if (match.includes("node_modules/") || match.includes(".git/") || ++seen > MAX_SEARCH_FILES) continue
            try {
              const target = assertReadable(options.root, match)
              const lines = readFileSync(target.full, "utf8").split("\n")
              for (let index = 0; index < lines.length; index++) {
                if (regex.test(lines[index]!)) matches.push(target.rel + ":" + (index + 1) + ": " + lines[index]!.trim())
                regex.lastIndex = 0
                if (matches.length >= 100) break
              }
            } catch { /* Ignore binary and unreadable files. */ }
            if (matches.length >= 100) break
          }
          const output = matches.join("\n") || "No matches found."
          emitTool({ id: event, tool: "grep", state: "completed", title: "Found " + matches.length + " matches", output: clip(output, 12_000) })
          return clip(output, 12_000)
        } catch (error) { const message = error instanceof Error ? error.message : String(error); emitTool({ id: event, tool: "grep", state: "failed", title: "Search " + query, detail: message }); return "Error: " + message }
      },
    }),
    write: tool({
      description: "Create or replace a project file. A diff is shown and the user must approve it.",
      inputSchema: z.object({ path: z.string(), content: z.string() }),
      execute: async ({ path, content }) => {
        const event = toolID()
        try {
          const target = resolveUnprotectedProjectPath(options.root, path)
          const beforeExists = existsSync(target.full)
          const before = beforeExists ? readFileSync(target.full, "utf8") : ""
          const diff = fileDiff(target.rel, before, content)
          emitTool({ id: event, tool: "write", state: "running", title: "Write " + target.rel, path: target.rel, diff })
          await approve("write", "Write " + target.rel, "Create or replace this project file.", diff, target.rel)
          mkdirSync(dirname(target.full), { recursive: true })
          writeFileSync(target.full, content, "utf8")
          options.onFileChange?.({ path: target.rel, before, after: content, beforeExists, afterExists: true })
          emitTool({ id: event, tool: "write", state: "completed", title: "Wrote " + target.rel, path: target.rel, diff })
          return "Wrote " + target.rel
        } catch (error) { const message = error instanceof Error ? error.message : String(error); emitTool({ id: event, tool: "write", state: "rejected", title: "Write " + path, detail: message }); return "Error: " + message }
      },
    }),
    edit: tool({
      description: "Replace an exact string in a project file. A diff is shown and the user must approve it.",
      inputSchema: z.object({ path: z.string(), oldText: z.string(), newText: z.string() }),
      execute: async ({ path, oldText, newText }) => {
        const event = toolID()
        try {
          const target = resolveUnprotectedProjectPath(options.root, path)
          const before = readFileSync(target.full, "utf8")
          if (!before.includes(oldText)) throw new Error("The requested text was not found; no file was changed.")
          const after = before.replace(oldText, newText)
          const diff = fileDiff(target.rel, before, after)
          emitTool({ id: event, tool: "edit", state: "running", title: "Edit " + target.rel, path: target.rel, diff })
          await approve("edit", "Edit " + target.rel, "Apply this exact text replacement.", diff, target.rel)
          writeFileSync(target.full, after, "utf8")
          options.onFileChange?.({ path: target.rel, before, after, beforeExists: true, afterExists: true })
          emitTool({ id: event, tool: "edit", state: "completed", title: "Edited " + target.rel, path: target.rel, diff })
          return "Edited " + target.rel
        } catch (error) { const message = error instanceof Error ? error.message : String(error); emitTool({ id: event, tool: "edit", state: "rejected", title: "Edit " + path, detail: message }); return "Error: " + message }
      },
    }),
    apply_patch: tool({
      description: "Apply a unified Git patch to project-relative files. The user sees the patch and must approve it.",
      inputSchema: z.object({ patch: z.string().min(1) }),
      execute: async ({ patch }) => {
        const event = toolID()
        try {
          const paths = patchPaths(options.root, patch)
          const before = new Map(paths.map((path) => {
            const target = resolveUnprotectedProjectPath(options.root, path)
            const existed = existsSync(target.full)
            return [path, { content: existed ? readFileSync(target.full, "utf8") : "", existed }] as const
          }))
          emitTool({ id: event, tool: "apply_patch", state: "running", title: "Apply patch to " + paths.join(", "), detail: paths.join(", "), diff: clip(patch, 12_000) })
          await approve("apply_patch", "Apply patch", "Update " + paths.join(", "), clip(patch, 12_000), paths.join(", "))
          await applyUnifiedPatch(options.root, patch)
          const changes = paths.map((path) => {
            const target = resolveUnprotectedProjectPath(options.root, path)
            const afterExists = existsSync(target.full)
            const prior = before.get(path)!
            return { path, before: prior.content, after: afterExists ? readFileSync(target.full, "utf8") : "", beforeExists: prior.existed, afterExists }
          })
          if (options.onFileChanges) options.onFileChanges(changes)
          else for (const change of changes) options.onFileChange?.(change)
          emitTool({ id: event, tool: "apply_patch", state: "completed", title: "Applied patch", detail: paths.join(", "), diff: clip(patch, 12_000) })
          return "Applied patch to " + paths.join(", ")
        } catch (error) { const message = error instanceof Error ? error.message : String(error); emitTool({ id: event, tool: "apply_patch", state: "rejected", title: "Apply patch", detail: message }); return "Error: " + message }
      },
    }),
    bash: tool({
      description: "Run a bounded shell command in the current project. Shell filesystem changes are not included in NIMBL's file-edit undo history.",
      inputSchema: z.object({ command: z.string().describe("Command to execute in the project directory") }),
      execute: async ({ command }) => {
        const event = toolID(); emitTool({ id: event, tool: "bash", state: "running", title: "Run command", detail: command })
        try {
          await approve("bash", "Run command", command, undefined, command)
          const result = await runShellCommand(command, options.root, { signal: options.abortSignal })
          const state = result.code === 0 ? "completed" : "failed"
          emitTool({ id: event, tool: "bash", state, title: "Command exited " + result.code, detail: command, output: result.output })
          return "Exit code " + result.code + "\n" + result.output
        } catch (error) { const message = error instanceof Error ? error.message : String(error); emitTool({ id: event, tool: "bash", state: "rejected", title: "Run command", detail: message }); return "Error: " + message }
      },
    }),
    webfetch: tool({
      description: "Fetch a public HTTP(S) URL and return focused text. Use this only when current external information is needed.",
      inputSchema: z.object({ url: z.string().url(), maxChars: z.number().int().positive().max(24_000).optional() }),
      execute: async ({ url, maxChars }) => {
        const event = toolID(); emitTool({ id: event, tool: "webfetch", state: "running", title: "Fetch " + url, detail: url })
        try {
          const parsed = safeURL(url)
          await approve("webfetch", "Fetch " + parsed.hostname, parsed.toString(), undefined, parsed.hostname)
          const response = await fetch(parsed, { signal: options.abortSignal, headers: { "User-Agent": "NIMBL/0.1" } })
          if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
          const output = clip((await response.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim(), maxChars || 12_000)
          emitTool({ id: event, tool: "webfetch", state: "completed", title: "Fetched " + parsed.hostname, detail: parsed.toString(), output })
          return output
        } catch (error) { const message = error instanceof Error ? error.message : String(error); emitTool({ id: event, tool: "webfetch", state: "failed", title: "Fetch " + url, detail: message }); return "Error: " + message }
      },
    }),
    websearch: tool({
      description: "Search public web pages for current information and return compact result titles and URLs.",
      inputSchema: z.object({ query: z.string().min(1), maxResults: z.number().int().positive().max(8).optional() }),
      execute: async ({ query, maxResults }) => {
        const event = toolID(); emitTool({ id: event, tool: "websearch", state: "running", title: "Search web", detail: query })
        try {
          await approve("websearch", "Search web", query, undefined, "duckduckgo")
          const url = new URL("https://html.duckduckgo.com/html/"); url.searchParams.set("q", query)
          const response = await fetch(url, { signal: options.abortSignal, headers: { "User-Agent": "NIMBL/0.1" } }); if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const html = await response.text(); const results: string[] = []; const expression = /result__a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
          for (const match of html.matchAll(expression)) { const title = match[2]!.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim(); if (title) results.push(`${title}\n${match[1]}`); if (results.length >= (maxResults || 5)) break }
          const output = results.join("\n\n") || "No web results found."; emitTool({ id: event, tool: "websearch", state: "completed", title: `Found ${results.length} results`, output }); return output
        } catch (error) { const message = error instanceof Error ? error.message : String(error); emitTool({ id: event, tool: "websearch", state: "failed", title: "Search web", detail: message }); return "Error: " + message }
      },
    }),
    skill: tool({
      description: "Load a specialized project, global, or configured skill. Skills provide specialized instructions and workflows for specific tasks. Returns the skill body, its base directory, and its related files.",
      inputSchema: z.object({ name: z.string().describe("The name of the skill from the available skills list") }),
      execute: async ({ name }) => {
        const event = toolID(); emitTool({ id: event, tool: "skill", state: "running", title: "Load skill " + name })
        try {
          await approve("skill", "Load skill " + name, "Read this skill.", undefined, name)
          const loaded = loadSkill(options.root, name, options.settings)
          const output = [
            `<skill_content name="${loaded.name}">`,
            loaded.content.trim(),
            "",
            `Base directory for this skill: ${loaded.directory}`,
            "Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.",
            loaded.files.length ? `<skill_files>\n${loaded.files.map((file) => `<file>${file}</file>`).join("\n")}\n</skill_files>` : "",
            "</skill_content>",
          ].filter(Boolean).join("\n")
          emitTool({ id: event, tool: "skill", state: "completed", title: "Loaded skill " + loaded.name, output })
          return output
        } catch (error) { const message = error instanceof Error ? error.message : String(error); emitTool({ id: event, tool: "skill", state: "failed", title: "Load skill " + name, detail: message }); return "Error: " + message }
      },
    }),
    todowrite: tool({
      description: "Record a short task checklist for this run. Use for multi-step work and keep statuses current.",
      inputSchema: z.object({ items: z.array(z.object({ content: z.string().min(1), status: z.enum(["pending", "in_progress", "completed"]) })).min(1).max(12) }),
      execute: async ({ items }) => {
        const event = toolID()
        try {
          await approve("todowrite", "Update task list", "Record the task checklist for this run.", undefined, "task list")
          const output = items.map((item) => `${item.status === "completed" ? "[x]" : item.status === "in_progress" ? "[>]" : "[ ]"} ${item.content}`).join("\n")
          emitTool({ id: event, tool: "todowrite", state: "completed", title: "Updated task list", output })
          return output
        } catch (error) { const message = error instanceof Error ? error.message : String(error); emitTool({ id: event, tool: "todowrite", state: "rejected", title: "Update task list", detail: message }); return "Error: " + message }
      },
    }),
    delegate: tool({
      description: "Delegate a research or implementation task to a child NIMBL session. Child work is limited by provider context/output, tool steps, approvals, and delegation depth—not an arbitrary aggregate token cap.",
      inputSchema: z.object({ prompt: z.string().min(1), agent: z.enum(["build", "plan", "explain", "learn"]).optional() }),
      execute: async ({ prompt, agent }) => {
        const event = toolID(); emitTool({ id: event, tool: "delegate", state: "running", title: "Delegate task", detail: prompt })
        try { await approve("delegate", "Delegate task", prompt, undefined, "child session"); if (!options.delegateTask) throw new Error("Subagent delegation is not configured for this runner."); const result = await options.delegateTask({ id: event, prompt, agent }); emitTool({ id: event, tool: "delegate", state: "completed", title: "Child task completed", output: result }); return result }
        catch (error) { const message = error instanceof Error ? error.message : String(error); emitTool({ id: event, tool: "delegate", state: "failed", title: "Delegate task", detail: message }); return "Error: " + message }
      },
    }),
    question: tool({
      description: "Ask the user a focused multiple-choice question when a decision cannot be made safely from the project context.",
      inputSchema: z.object({ prompt: z.string().min(1), options: z.array(z.string().min(1)).min(2).max(6).optional(), freeform: z.boolean().optional() }),
      execute: async ({ prompt, options: answers, freeform }) => {
        const event = toolID(); emitTool({ id: event, tool: "question", state: "running", title: "Question", detail: prompt })
        try {
          await approve("question", "Question for the user", prompt)
          if (!options.askQuestion) throw new Error("The current interface cannot ask interactive questions.")
          const answer = await options.askQuestion({ id: event, prompt, options: answers || [], freeform })
          emitTool({ id: event, tool: "question", state: "completed", title: "Answered question", detail: answer })
          return answer
        } catch (error) { const message = error instanceof Error ? error.message : String(error); emitTool({ id: event, tool: "question", state: "rejected", title: "Question", detail: message }); return "Error: " + message }
      },
    }),
  }

  const modelDefinition = requestModel(options)
  const availableTools = Object.fromEntries(Object.entries(tools).filter(([name]) => MODE_TOOLS[options.mode].includes(name as PermissionRequest["tool"])))
  const issues = compatibilityIssues(modelDefinition, { tools: Object.keys(availableTools).length > 0, reasoning: false, imageInput: false, structuredOutput: false, streaming: true, minimumContextTokens: 1 })
  if (issues.length) throw new Error(`${modelDefinition.name} is incompatible with this request: ${issues.join(", ")}.`)
  const rawHistory = options.messages.slice(-30)
  const splitHistory = rawHistory.map((message) => budgetPromptParts(message.text))
  const selectedContext = await selectProjectContextWithBudget(options.root, options.messages.at(-1)?.text || "", 12, Math.min(modelDefinition.contextWindow * 4, 500_000), { index: options.contextIndex })
  const skillGuidance = availableSkillGuidance(discoverSkills(options.root, options.settings).filter((skill) => permissionFor(options.permissions, { tool: "skill", target: skill.name }) !== "deny"))
  const systemInstructions = [
    "You are NIMBL, a token-efficient coding companion. Work inside the current project using tools before making claims about its code.",
    ASSISTANT_RESPONSE_STYLE,
    modePrompt(options.mode),
    "Use read, glob, grep, and project-local skills selectively. Keep tool output focused. Use todowrite for multi-step work. Use question only when a user decision is necessary. Use edit for focused changes, write for new or whole-file content, and apply_patch only for a valid unified diff.",
    "Current permission policy: " + ["read", "glob", "grep", "edit", "write", "bash", "webfetch", "websearch", "skill", "question", "delegate"].map((name) => `${name}=${permissionExplanation(options.permissions, { tool: name })}`).join(", "),
    teachingPrompt(options.learning || { concepts: {} }),
    skillGuidance,
  ]
  const projectInstructionText = projectInstructions(options.root)
  const compressedContext = compressContext(selectedContext.items, modelDefinition, 12_000, options.compression || "structural")
  const retrievalLowToHigh = selectedContext.items.map((item, index) => `# ${item.path} — ${item.reason}\n${compressedContext.items[index]?.text || item.excerpt}`).reverse()
  const fitted = fitRequestToBudget(modelDefinition, {
    systemInstructions,
    toolSchemas: Object.entries(availableTools).map(([name, value]) => {
      const definition = value as any
      let schema = "{}"
      try { schema = JSON.stringify(z.toJSONSchema(definition.inputSchema)) } catch { /* Conservative safety margin covers unsupported schema conversion. */ }
      return `${name}: ${String(definition.description || "tool")}\n${schema}`
    }),
    history: splitHistory.map((part) => part.history),
    summary: options.summary ? [options.summary] : [],
    attachments: splitHistory.map((part) => part.attachment).filter(Boolean),
    projectInstructions: projectInstructionText ? [projectInstructionText] : [],
    retrieval: retrievalLowToHigh,
    outputReservation: Math.min(8_000, modelDefinition.maxOutputTokens),
  })
  if (!fitted.budget.fits) throw new Error(`Request requires ${fitted.budget.requestTotal} tokens but ${modelDefinition.name} supports ${modelDefinition.contextWindow}. Reduce attachments or choose a larger model.`)
  const history = rawHistory.slice(rawHistory.length - fitted.history.length).map((message) => ({ role: message.role, content: message.text }))
  const retrievalText = fitted.retrieval.length ? `Relevant project context (${fitted.budget.retrieval} ${fitted.budget.quality === "exact" ? "tokens" : "estimated tokens"}; selected locally):\n${[...fitted.retrieval].reverse().join("\n\n")}` : ""
  const cachedPrompt = buildCachedPrompt({
    provider: getProvider(options.provider),
    stable: [...systemInstructions, projectInstructionText, options.summary ? "Session summary:\n" + options.summary : ""],
    dynamic: [retrievalText],
  })

  let text = ""
  let reasoning = ""
  const startedAt = Date.now()
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptActivity = false
    try {
      const result = streamText({
        model: createModel(options),
        system: cachedPrompt.system,
        messages: history as any,
        tools: availableTools,
        maxOutputTokens: fitted.budget.outputReservation,
        providerOptions: cachedPrompt.providerOptions,
        // NIMBL owns retries/backoff for transient provider failures so a rate
        // limit or gateway error surfaces with a clear message instead of the
        // AI SDK's internal retry noise and a generic "No output generated".
        maxRetries: 0,
        prepareStep: ({ messages, instructions }) => {
          const dynamicTokens = countTextTokens(JSON.stringify({ instructions, messages }), modelDefinition).tokens
          const projected = dynamicTokens + fitted.budget.toolSchemas + fitted.budget.outputReservation + fitted.budget.safetyMargin
          if (projected > modelDefinition.contextWindow) throw new Error(`Tool-loop context reached ${projected} tokens, above ${modelDefinition.name}'s ${modelDefinition.contextWindow}-token window.`)
          return {}
        },
        stopWhen: stepCountIs(Math.min(MAX_TOOL_STEPS, options.maxToolSteps ?? MAX_TOOL_STEPS)),
        abortSignal: options.abortSignal,
      })
      for await (const part of result.fullStream) {
        if (part.type === "error") {
          throw describeStreamError((part as { error?: unknown }).error, options.provider, options.model)
        }
        if (part.type === "tool-call") {
          const call = part as unknown as { toolName?: string; input?: unknown; args?: unknown }
          const fingerprint = JSON.stringify([call.toolName, call.input ?? call.args])
          const count = (repeatedToolCalls.get(fingerprint) || 0) + 1
          repeatedToolCalls.set(fingerprint, count)
          options.onTaskEvent?.({ type: "step", detail: `${call.toolName || "tool"} step ${count}` })
          if (count >= (options.doomLoopThreshold ?? 3)) { options.onTaskEvent?.({ type: "doom-loop", detail: `Repeated ${call.toolName || "tool"} call detected.` }); throw new Error("Agent stopped after repeating the same tool call; review the result or provide a new instruction.") }
        }
        if (part.type === "text-delta") {
          const delta = stripEmojis(part.text)
          if (delta) { attemptActivity = true; text += delta; options.onEvent({ kind: "text", delta }) }
        }
        if (part.type === "reasoning-delta") {
          const delta = stripEmojis(part.text)
          if (delta) { attemptActivity = true; reasoning += delta; options.onEvent({ kind: "reasoning", delta }) }
        }
      }
      let usage
      try {
        usage = await result.usage
      } catch (error) {
        throw describeStreamError(error, options.provider, options.model)
      }
      const inputTokens = usage.inputTokens || 0
      const outputTokens = usage.outputTokens || 0
      const totalTokens = usage.totalTokens ?? inputTokens + outputTokens
      if (options.maxTokens !== undefined && totalTokens > options.maxTokens) { options.onTaskEvent?.({ type: "budget", detail: `Token budget ${options.maxTokens} exceeded by ${totalTokens}.` }); throw new Error(`Agent token budget exceeded (${totalTokens}/${options.maxTokens}).`) }
      const inputDetails = usage.inputTokenDetails || {}
      const outputDetails = usage.outputTokenDetails || {}
      const finalStep = result.finalStep ? await result.finalStep : undefined
      if (!text && reasoning) text = reasoning
      return {
        text,
        reasoning,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens,
          noCacheTokens: inputDetails.noCacheTokens,
          cacheReadTokens: inputDetails.cacheReadTokens,
          cacheWriteTokens: inputDetails.cacheWriteTokens,
          textTokens: outputDetails.textTokens,
          reasoningTokens: outputDetails.reasoningTokens,
        },
        attempts: attempt,
        latencyMs: Date.now() - startedAt,
        cacheKey: cachedPrompt.cacheKey,
        finishReason: finalStep?.finishReason,
        rawFinishReason: finalStep?.rawFinishReason,
        callId: finalStep?.callId,
        responseId: finalStep?.response.id,
        requestId: finalStep?.response.headers?.["x-request-id"],
        budget: fitted.budget,
        retrieval: selectedContext.telemetry,
      }
    } catch (error) {
      if (attemptActivity || attempt === maxAttempts || options.abortSignal?.aborted || !retryable(error)) throw error
      const message = error instanceof Error ? error.message : String(error)
      options.onRetry?.({ attempt: attempt + 1, message })
      await wait((options.retryDelayMs ?? 500) * 2 ** (attempt - 1), options.abortSignal)
    }  }
  throw new Error("Agent execution failed.")
}

export function contextEstimate(messages: AgentMessage[], summary = "") {
  const characters = messages.reduce((total, message) => total + message.text.length, summary.length)
  return Math.ceil(characters / 4)
}

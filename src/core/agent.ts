import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { stepCountIs, streamText, tool } from "ai"
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname } from "node:path"
import { z } from "zod"
import { compatibilityIssues, getProvider, resolveModel, type ProviderModel } from "./providers"
import { selectProjectContextWithBudget, type ProjectContextIndex } from "./context"
import type { ContextRetrievalTelemetry } from "./context"
import { leakageLabel, leakageScore, teachingPrompt, type LearningState } from "./learning"
import type { PermissionSettings } from "./settings"
import { permissionExplanation, permissionFor } from "./permissions"
import { ASSISTANT_RESPONSE_STYLE, stripEmojis } from "./response-style"
import { resolvePathAllowExternal, resolveProjectPath, resolveUnprotectedProjectPath, type ResolvedToolPath } from "./project-path"
import { runShellCommand } from "./shell"
import { applyEdit } from "./edit-apply"
import { fitRequestToBudget, type RequestBudgetBreakdown } from "./request-budget"
import { countTextTokens } from "./tokenizers"
import { buildCachedPrompt } from "./prompt-cache"
import { compressContext, type CompressionMode } from "./token-compression"
import { classifyTask, type TaskFamily } from "./task-classifier"
import { availableSkillGuidance, discoverSkills, loadSkill, selectRelevantSkills } from "./skills"
import type { NimblSettings } from "./settings"

export type AgentMode = "build" | "plan" | "explain" | "learn"
export type ApprovalChoice = "once" | "always" | "reject" | { reject: string }

function rejectMessage(choice: ApprovalChoice): string | undefined {
  return typeof choice === "object" ? choice.reject : undefined
}

function isReject(choice: ApprovalChoice): boolean {
  return choice === "reject" || typeof choice === "object"
}

export interface AgentMessage {
  role: "user" | "assistant" | "system"
  text: string
}

export interface PermissionRequest {
  id: string
  tool: "read" | "glob" | "grep" | "write" | "edit" | "apply_patch" | "bash" | "webfetch" | "websearch" | "skill" | "question" | "todowrite" | "delegate" | "external_directory" | "doom_loop"
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
  /** Optional task-category tags (benchmark ground truth) fed to the classifier.
   * When set, they choose the per-class step budget; otherwise the last user
   * message is classified lexically. */
  taskTags?: string[]
  maxAttempts?: number
  maxTokens?: number
  doomLoopThreshold?: number
  /** Read-only tool calls allowed since the last edit before prepareStep injects a
   * "commit an edit now" directive. Universal guard against audit spirals. */
  readBudget?: number
  runID?: string
  parentTaskID?: string
  onTaskEvent?: (event: { type: "step" | "budget" | "doom-loop"; detail: string }) => void
  compression?: CompressionMode
  /** Opt into provider prompt caching (promptCacheKey + explicit cache-control).
   * Defaults to true (current behavior); set false to run the cache-off ablation. */
  promptCache?: boolean
  settings?: NimblSettings
  /**
   * Test/benchmark seam: override the AI SDK streamText call. The default uses
   * the imported `streamText`. A benchmark can supply a deterministic backend
   * that reports exact token accounting while still driving the real tools.
   */
  streamTextOverride?: typeof streamText
  /**
   * Test/benchmark seam: awaited immediately before every model request (each
   * tool step issues one). Lets a shared rate limiter gate live benchmark runs.
   */
  beforeRequest?: () => Promise<void>
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
  /** Sprint C: family chosen by the task classifier (telemetry only). */
  family?: TaskFamily
  /** Effective per-run step budget used by stopWhen (classified, ceiling-clamped). */
  maxToolSteps?: number
  budget: RequestBudgetBreakdown
  retrieval: ContextRetrievalTelemetry
}

const MAX_FILE_BYTES = 48_000
const MAX_SEARCH_FILES = 250
// Absolute safety ceiling for runaway loops (Sprint C: the per-class task
// classifier picks the working budget; this is only the bound on that choice).
const MAX_TOOL_STEPS = 100
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

function shellDescription() {
  const body = "Run a bounded shell command in the current project. Shell filesystem changes are not included in NIMBL's file-edit undo history. "
  if (process.platform === "win32") {
    return body +
      "Commands run in PowerShell (powershell.exe -NoProfile). Use PowerShell syntax: Get-ChildItem (or ls) and Get-Content (or cat) for listing/reading; avoid POSIX-only utilities like find, head, tail, or sed. Redirect stdout and stderr with 2>&1 or 2>&1 | Select-Object -First N; do not use 2>/dev/null (invalid in PowerShell). When running a command that emits non-zero exits on the project's test tool, allow it and inspect the output."
  }
  return body + "Commands run in POSIX shell (/bin/sh -lc). Use standard utilities (ls, cat, grep, find, head, tail). Redirect stdout and stderr for tests with 2>&1."
}

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
  // Preserve the HTTP status on the wrapped error so callers (retryable(),
  // benchmark run-level retries) still see the underlying 429/5xx even though
  // the AI SDK error object is replaced with a readable message.
  const wrapped = (text: string): Error => {
    const err = new Error(text)
    if (status) (err as { statusCode?: number }).statusCode = status
    return err
  }
  if (status === 429) {
    return wrapped(`Rate limit exceeded for ${provider}/${model}. Wait a moment and retry.${message ? ` (${message})` : ""}`)
  }
  if (status >= 500) {
    return wrapped(`${provider} returned a server error (HTTP ${status}). Retrying may help.${message ? ` (${message})` : ""}`)
  }
  if (message) return wrapped(`${provider} request failed: ${message}`)
  return wrapped(`No output generated by ${provider}/${model}. The provider closed the stream without a response.`)
}

/** Read the Retry-After header from a provider error, if present (ms, seconds, or HTTP-date). */
export function retryAfterMs(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined
  const value = (error as { headers?: unknown }).headers
  if (value === undefined || value === null) return undefined
  let raw: unknown
  if (typeof value === "object" && "get" in value && typeof (value as { get: unknown }).get === "function") {
    // A Headers/Headers-like instance (AI SDK errors expose these).
    try { raw = (value as { get(name: string): string | null }).get("retry-after") } catch { return undefined }
  } else if (typeof value === "object") {
    raw = (value as Record<string, unknown>)["retry-after"]
  }
  if (raw === undefined || raw === null) return undefined
  const text = String(raw).trim()
  if (/^\d+(\.\d+)?$/.test(text)) return Math.ceil(Number(text) * 1000)
  const date = Date.parse(text)
  if (Number.isFinite(date)) return Math.max(0, date - Date.now())
  return undefined
}

/**
 * Count read-only tool calls (read/glob/grep) since the most recent edit
 * (edit/write/apply_patch) across a sequence of agent steps. Used to enforce
 * the read-to-edit budget that breaks audit loops.
 */
export function countReadsSinceEdit(toolCallsPerStep: string[][]): number {
  let reads = 0
  for (const calls of toolCallsPerStep) {
    for (const name of calls) {
      if (name === "edit" || name === "write" || name === "apply_patch") reads = 0
      else if (name === "read" || name === "glob" || name === "grep") reads++
    }
  }
  return reads
}

/**
 * Conditional tool-result pruning (Hermes phase-1 style): stub long, old,
 * completed tool-result outputs so they no longer re-enter the next step's
 * context. Tail-protected — the most recent `tail` tool messages keep their
 * output verbatim; only older `tool` messages with an output longer than
 * `minChars` are replaced with a short marker. `edit`/`apply_patch` outputs
 * (diffs) and error outputs are never stubbed. No LLM call is made.
 * Returns the same array reference when nothing changed.
 */
export function pruneOldToolResults(messages: readonly unknown[], tail = 6, minChars = 200): unknown[] {
  const toolIndices = messages
    .map((message, index) => (message && typeof message === "object" && (message as { role?: string }).role === "tool" ? index : -1))
    .filter((index) => index >= 0)
  if (toolIndices.length <= tail) return messages as unknown[]
  let changed = false
  const next = messages.map((message, index) => {
    if (!toolIndices.includes(index)) return message
    if (toolIndices.indexOf(index) >= toolIndices.length - tail) return message
    const content = (message as { content?: unknown }).content
    if (!Array.isArray(content)) return message
    const parts = content.map((part) => {
      if (!part || typeof part !== "object" || (part as { type?: string }).type !== "tool-result") return part
      const output = (part as { output?: unknown }).output
      const text = typeof output === "string" ? output : output === undefined ? "" : JSON.stringify(output)
      if (text.length <= minChars) return part
      const toolName = (part as { toolName?: string }).toolName || "tool"
      // Never stub edit/apply_patch diffs or error outputs.
      if (toolName === "edit" || toolName === "apply_patch" || toolName === "write") return part
      if (/^Error:/i.test(text)) return part
      changed = true
      return { ...(part as object), output: `[Old ${toolName} output cleared to save context space (${text.length} chars)]` } as unknown
    })
    return { ...(message as object), content: parts } as unknown
  })
  return changed ? next : (messages as unknown[])
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
  const allowedRepeatedCalls = new Set<string>()
  // Read-to-edit budget state (hard gate): counts read-only tool calls since the
  // last edit/write/apply_patch/bash. Once it reaches the budget the `read` tool
  // refuses file content and returns a directive instead, forcing act-over-audit.
  let readsSinceEdit = 0
  // Edits made since the last bash run, used only to phrase the gate message with
  // a verify nudge (A.4); the read gate itself does not require a test per edit.
  let pendingEdits = 0
  const readGateBudget = options.readBudget ?? 12
  const enforceReadGate = options.mode === "build"
  const gateDirective = () => {
    const verifyNote = pendingEdits > 0 ? ` You have ${pendingEdits} unverified edit(s) since the last command run; run the relevant test (bash) to verify them before continuing to read.` : ""
    return `Investigation budget reached: ${readsSinceEdit} read-only tool calls since the last edit with no file change. Make the focused edit now and verify it, or stop investigating and answer directly. Do not issue further reads without acting.${verifyNote}`
  }
  const emitTool = (event: Omit<ToolEvent, "kind">) => {
    attemptActivity = true
    options.onEvent({ kind: "tool", ...event })
  }
  const approve = async (toolName: PermissionRequest["tool"], title: string, detail: string, diff?: string, target?: string, eventID?: string) => {
    assertModeTool(options.mode, toolName)
    const policy = permissionFor(options.permissions, { tool: toolName, target: target || detail })
    if (policy === "deny") throw new Error(`${toolName} is blocked by project policy.`)
    if (policy === "allow") return
    const choice = await options.requestApproval({ id: eventID ?? toolID(), tool: toolName, title, detail, diff, target })
    if (isReject(choice)) {
      const message = rejectMessage(choice)
      throw new Error(message ? `The user rejected this action: ${message}` : "The user rejected this action.")
    }
  }

  const approveExternal = async (target: ResolvedToolPath, eventID?: string) => {
    if (target.inside) return
    const dir = dirname(target.full)
    const policy = permissionFor(options.permissions, { tool: "external_directory", target: dir })
    if (policy === "deny") throw new Error(`Access to "${dir}" is blocked by project policy.`)
    if (policy === "allow") return
    const choice = await options.requestApproval({ id: eventID ?? toolID(), tool: "external_directory", title: dir, detail: dir, target: dir })
    if (isReject(choice)) {
      const message = rejectMessage(choice)
      throw new Error(message ? `The user rejected access to this directory: ${message}` : "The user rejected access to this directory.")
    }
  }

  const askDoomLoop = async (tool: string) => {
    const policy = permissionFor(options.permissions, { tool: "doom_loop", target: tool })
    if (policy === "deny") throw new Error(`Repeating the same tool call is blocked by project policy.`)
    if (policy === "allow") return
    const choice = await options.requestApproval({
      id: toolID(),
      tool: "doom_loop",
      title: `Continue after repeated ${tool} calls?`,
      detail: "This keeps the run going despite repeating the same tool call.",
      target: tool,
    })
    if (isReject(choice)) throw new Error("The user rejected continuing after repeated tool calls.")
  }

  const tools = {
    read: tool({
      description: "Read a UTF-8 text file from the current project. Environment files are protected.",
      inputSchema: z.object({ path: z.string().describe("Project-relative file path"), startLine: z.number().int().positive().optional(), endLine: z.number().int().positive().optional() }),
      execute: async ({ path, startLine, endLine }) => {
        const event = toolID(); emitTool({ id: event, tool: "read", state: "running", title: "Read " + path, path })
        try {
          // Hard read-to-edit gate: refuse content once the investigation budget
          // is exhausted without any edit. The model cannot audit forever; it must
          // edit (or answer) before more reads are allowed.
          if (enforceReadGate && readsSinceEdit >= readGateBudget) {
            const directive = gateDirective()
            emitTool({ id: event, tool: "read", state: "completed", title: "Read blocked by investigation budget", path, output: directive })
            return directive
          }
          const target = resolvePathAllowExternal(options.root, path)
          await approveExternal(target, event)
          await approve("read", "Read " + target.rel, "Read this file.", undefined, target.rel, event)
          readsSinceEdit++
          const size = statSync(target.full).size
          if (size > MAX_FILE_BYTES * 8) return `Error: File is ${size} bytes, exceeding the read limit. Use bash to inspect it in parts.`
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
          await approve("glob", "Find " + pattern, "Search project file names.", undefined, pattern, event)
          readsSinceEdit++
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
          await approve("grep", "Search " + query, "Search text in project files.", undefined, query, event)
          readsSinceEdit++
          const regex = new RegExp(query, "i")
          const matches: string[] = []
          let seen = 0
          const budgetStart = Date.now()
          const GREP_MS_BUDGET = 10_000
          for await (const match of new Bun.Glob(pattern || "**/*").scan({ cwd: options.root, onlyFiles: true })) {
            if (options.abortSignal?.aborted) throw new Error("Interrupted by user.")
            if (Date.now() - budgetStart > GREP_MS_BUDGET) throw new Error(`Grep exceeded the ${GREP_MS_BUDGET / 1000}s search budget. Narrow the pattern or query.`)
            if (match.includes("node_modules/") || match.includes(".git/") || ++seen > MAX_SEARCH_FILES) continue
            try {
              const target = assertReadable(options.root, match)
              if (statSync(target.full).size > MAX_FILE_BYTES) continue
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
          const target = resolvePathAllowExternal(options.root, path)
          await approveExternal(target, event)
          const beforeExists = existsSync(target.full)
          const before = beforeExists ? readFileSync(target.full, "utf8") : ""
          const diff = fileDiff(target.rel, before, content)
          emitTool({ id: event, tool: "write", state: "running", title: "Write " + target.rel, path: target.rel, diff })
          await approve("write", "Write " + target.rel, "Create or replace this file.", diff, target.rel, event)
          mkdirSync(dirname(target.full), { recursive: true })
          writeFileSync(target.full, content, "utf8")
          readsSinceEdit = 0; pendingEdits++
          options.onFileChange?.({ path: target.rel, before, after: content, beforeExists, afterExists: true })
          emitTool({ id: event, tool: "write", state: "completed", title: "Wrote " + target.rel, path: target.rel, diff })
          return "Wrote " + target.rel
        } catch (error) { const message = error instanceof Error ? error.message : String(error); emitTool({ id: event, tool: "write", state: "rejected", title: "Write " + path, detail: message }); return "Error: " + message }
      },
    }),
    edit: tool({
      description: "Replace text in a project file. A diff is shown and the user must approve it. Matches the requested text tolerantly when line endings, indentation, or whitespace differ.",
      inputSchema: z.object({ path: z.string(), oldText: z.string(), newText: z.string(), replaceAll: z.boolean().optional() }),
      execute: async ({ path, oldText, newText, replaceAll }) => {
        const event = toolID()
        try {
          const target = resolvePathAllowExternal(options.root, path)
          await approveExternal(target, event)
          const before = readFileSync(target.full, "utf8")
          const result = applyEdit(before, oldText, newText, Boolean(replaceAll))
          if (!result.ok) throw new Error(result.reason === "missing" ? "The requested text was not found; no file was changed." : result.reason === "ambiguous" ? "The requested text matches multiple locations; include more surrounding context or pass replaceAll: true." : "The requested text is too large relative to the file; no file was changed.")
          const after = result.after
          const diff = fileDiff(target.rel, before, after)
          emitTool({ id: event, tool: "edit", state: "running", title: "Edit " + target.rel, path: target.rel, diff })
          await approve("edit", "Edit " + target.rel, "Apply this text replacement.", diff, target.rel, event)
          writeFileSync(target.full, after, "utf8")
          readsSinceEdit = 0; pendingEdits++
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
          await approve("apply_patch", "Apply patch", "Update " + paths.join(", "), clip(patch, 12_000), paths.join(", "), event)
          await applyUnifiedPatch(options.root, patch)
          const changes = paths.map((path) => {
            const target = resolveUnprotectedProjectPath(options.root, path)
            const afterExists = existsSync(target.full)
            const prior = before.get(path)!
            return { path, before: prior.content, after: afterExists ? readFileSync(target.full, "utf8") : "", beforeExists: prior.existed, afterExists }
          })
          if (options.onFileChanges) options.onFileChanges(changes)
          else for (const change of changes) options.onFileChange?.(change)
          readsSinceEdit = 0; pendingEdits++
          emitTool({ id: event, tool: "apply_patch", state: "completed", title: "Applied patch", detail: paths.join(", "), diff: clip(patch, 12_000) })
          return "Applied patch to " + paths.join(", ")
        } catch (error) { const message = error instanceof Error ? error.message : String(error); emitTool({ id: event, tool: "apply_patch", state: "rejected", title: "Apply patch", detail: message }); return "Error: " + message }
      },
    }),
    bash: tool({
      description: shellDescription(),
      inputSchema: z.object({ command: z.string().describe("Command to execute in the project directory") }),
      execute: async ({ command }) => {
        const event = toolID(); emitTool({ id: event, tool: "bash", state: "running", title: "Run command", detail: command })
        try {
          await approve("bash", "Run command", command, undefined, command, event)
          const result = await runShellCommand(command, options.root, { signal: options.abortSignal })
          readsSinceEdit = 0; pendingEdits = 0
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
          await approve("webfetch", "Fetch " + parsed.hostname, parsed.toString(), undefined, parsed.hostname, event)
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
          await approve("websearch", "Search web", query, undefined, "duckduckgo", event)
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
          await approve("skill", "Load skill " + name, "Read this skill.", undefined, name, event)
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
          await approve("todowrite", "Update task list", "Record the task checklist for this run.", undefined, "task list", event)
          const output = items.map((item) => `${item.status === "completed" ? "[x]" : item.status === "in_progress" ? "[>]" : "[ ]"} ${item.content}`).join("\n")
          emitTool({ id: event, tool: "todowrite", state: "completed", title: "Updated task list", output })
          return output
        } catch (error) { const message = error instanceof Error ? error.message : String(error); emitTool({ id: event, tool: "todowrite", state: "rejected", title: "Update task list", detail: message }); return "Error: " + message }
      },
    }),
    delegate: tool({
      description: "Delegate a clearly-separated subtask to a child NIMBL session. A child session restarts context and costs another full round of retrieval and tool setup, so prefer doing work inline in the current session; only delegate when the subtask is genuinely independent (e.g. a large self-contained research task or a separate module) and you cannot proceed without it. Child work is limited by provider context/output, tool steps, approvals, and delegation depth.",
      inputSchema: z.object({ prompt: z.string().min(1), agent: z.enum(["build", "plan", "explain", "learn"]).optional() }),
      execute: async ({ prompt, agent }) => {
        const event = toolID(); emitTool({ id: event, tool: "delegate", state: "running", title: "Delegate task", detail: prompt })
        try { await approve("delegate", "Delegate task", prompt, undefined, "child session", event); if (!options.delegateTask) throw new Error("Subagent delegation is not configured for this runner."); const result = await options.delegateTask({ id: event, prompt, agent }); emitTool({ id: event, tool: "delegate", state: "completed", title: "Child task completed", output: result }); return result }
        catch (error) { const message = error instanceof Error ? error.message : String(error); emitTool({ id: event, tool: "delegate", state: "failed", title: "Delegate task", detail: message }); return "Error: " + message }
      },
    }),
    question: tool({
      description: "Ask the user a focused multiple-choice question when a decision cannot be made safely from the project context.",
      inputSchema: z.object({ prompt: z.string().min(1), options: z.array(z.string().min(1)).min(2).max(6).optional(), freeform: z.boolean().optional() }),
      execute: async ({ prompt, options: answers, freeform }) => {
        const event = toolID(); emitTool({ id: event, tool: "question", state: "running", title: "Question", detail: prompt })
        try {
          await approve("question", "Question for the user", prompt, undefined, undefined, event)
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
  // Sprint C: per-class step budget. An explicit maxToolSteps (e.g. a benchmark
  // forcing 8, or the TaskRegistry's 100-step safety ceiling) is a hard bound on
  // the classified budget, never a raise: easy tasks keep tiny budgets, only the
  // long-horizon/shell-loop/multi-file families unlock more turns.
  const classified = classifyTask(options.messages.at(-1)?.text || "", options.taskTags)
  const stepBudget = Math.min(classified.maxToolSteps, options.maxToolSteps ?? MAX_TOOL_STEPS)
  const selectedContext = await selectProjectContextWithBudget(options.root, options.messages.at(-1)?.text || "", classified.retrievalLimit, Math.min(modelDefinition.contextWindow * 4, 500_000), { index: options.contextIndex })
  const skillGuidance = availableSkillGuidance(selectRelevantSkills(
    discoverSkills(options.root, options.settings).filter((skill) => permissionFor(options.permissions, { tool: "skill", target: skill.name }) !== "deny"),
    options.messages.at(-1)?.text || "",
  ))
  const systemInstructions = [
    "You are NIMBL, a token-efficient coding companion. Work inside the current project using tools before making claims about its code.",
    ASSISTANT_RESPONSE_STYLE,
    modePrompt(options.mode),
    ...(classified.guidance ? [classified.guidance] : []),
    "Use read, glob, grep, and project-local skills selectively. Keep tool output focused. Use todowrite for multi-step work. Use question only when a user decision is necessary. Use edit for focused changes, write for new or whole-file content, and apply_patch only for a valid unified diff.",
    "After editing or changing code, verify the change by running the relevant test or check before finishing (e.g. bun test <file>); if the check is red, read the output and iterate. Do not loop on reads without acting: investigate just enough to edit, then edit and verify.",
    "When a task asks for a concrete value from the code (a constant, a numeric answer, a function name), read the relevant file and answer from its actual contents before replying; never answer with an unverified number or guess.",
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
  let history = rawHistory.slice(rawHistory.length - fitted.history.length).map((message) => ({ role: message.role, content: message.text }))
  const retrievalText = fitted.retrieval.length ? `Relevant project context (${fitted.budget.retrieval} ${fitted.budget.quality === "exact" ? "tokens" : "estimated tokens"}; selected locally):\n${[...fitted.retrieval].reverse().join("\n\n")}` : ""
  const cachedPrompt = buildCachedPrompt({
    provider: getProvider(options.provider),
    enabled: options.promptCache,
    // Stable prefix: system instructions + project instructions only. The
    // session summary is deliberately EXCLUDED from the cached prefix because
    // it changes on compaction — caching it would invalidate the provider cache
    // prefix mid-session (TokenPilot / "Don't break the cache"). It rides in the
    // dynamic tail instead, which sits after the cache breakpoint.
    stable: [...systemInstructions, projectInstructionText],
    dynamic: [options.summary ? "Session summary:\n" + options.summary : "", retrievalText],
  })

  let text = ""
  let reasoning = ""
  const startedAt = Date.now()
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS
  // Sprint C shared task budget: tool steps executed across *all* attempts count
  // toward the classified budget, so a step-cap continuation gets `remaining`
  // steps, not a fresh full budget (Kimi: attempts ≠ steps). Transient provider
  // retries do not consume it — their tool calls never execute into the stream.
  let executedToolSteps = 0
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptActivity = false
    // Step-cap continuation replays the same user goal with accumulated tool
    // history; per-attempt text/reasoning must reset so the final answer is the
    // continuation's, not a concatenation of partial outputs.
    text = ""
    reasoning = ""
    // Repetition counters are per attempt: a retry replays the same tool
    // sequence, which must not count toward a doom-loop from the prior attempt.
    repeatedToolCalls.clear()
    allowedRepeatedCalls.clear()
    try {
      const stream = options.streamTextOverride ?? streamText
      const result = stream({
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
        prepareStep: async ({ messages, instructions, steps }) => {
          // Shared benchmark rate limiter: gates every model request (the SDK
          // invokes prepareStep once per tool step, before each internal call).
          if (options.beforeRequest) await options.beforeRequest()
          // B.2 Conditional tool-result pruning: long-horizon runs accumulate many
          // tool messages; once the step history grows, stub old completed outputs
          // (tail-protected, diffs/errors kept) so they stop re-entering context.
          if (messages.length > 24) {
            const pruned = pruneOldToolResults(messages)
            if (pruned !== messages) return { messages: pruned as any }
          }
          const dynamicTokens = countTextTokens(JSON.stringify({ instructions, messages }), modelDefinition).tokens
          const projected = dynamicTokens + fitted.budget.toolSchemas + fitted.budget.outputReservation + fitted.budget.safetyMargin
          if (projected > modelDefinition.contextWindow) throw new Error(`Tool-loop context reached ${projected} tokens, above ${modelDefinition.name}'s ${modelDefinition.contextWindow}-token window.`)
          // Read-to-edit budget: if the agent has made many read-only tool calls
          // since the last edit without committing anything, inject a directive so
          // the next model turn acts instead of continuing to audit.
          const readsSinceEdit = countReadsSinceEdit(steps.map((step) => step.toolCalls.map((call) => call.toolName)))
          if (readsSinceEdit >= (options.readBudget ?? 12)) {
            const prior = instructions ? (typeof instructions === "string" ? instructions : String(instructions)) : ""
            return {
              instructions: [prior, `Investigation budget reached: ${readsSinceEdit} read-only tool calls since the last edit with no file change. Make the focused edit now and verify it, or stop investigating and answer directly. Do not issue further reads without acting.`].filter(Boolean).join("\n\n"),
            }
          }
          return {}
        },
        stopWhen: stepCountIs(Math.max(1, stepBudget - executedToolSteps)),
        abortSignal: options.abortSignal,
      })
      for await (const part of result.fullStream) {
        if (part.type === "error") {
          throw describeStreamError((part as { error?: unknown }).error, options.provider, options.model)
        }
        if (part.type === "tool-call") {
          executedToolSteps++
          const call = part as unknown as { toolName?: string; input?: unknown; args?: unknown }
          const fingerprint = JSON.stringify([call.toolName, call.input ?? call.args])
          const count = (repeatedToolCalls.get(fingerprint) || 0) + 1
          repeatedToolCalls.set(fingerprint, count)
          options.onTaskEvent?.({ type: "step", detail: `${call.toolName || "tool"} step ${count}` })
          if (count >= (options.doomLoopThreshold ?? 3)) {
            // Ask once per fingerprint; an approved fingerprint may continue.
            if (!allowedRepeatedCalls.has(fingerprint)) {
              options.onTaskEvent?.({ type: "doom-loop", detail: `Repeated ${call.toolName || "tool"} call detected.` })
              await askDoomLoop(call.toolName || "tool")
              allowedRepeatedCalls.add(fingerprint)
            }
          }
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
      // A.3 Step-cap continuation: the SDK cut the loop at the tool-step limit
      // while the model was mid-work (finishReason "tool-calls"). That is not a
      // thrown error, so the retry loop never re-arms. Append the accumulated
      // assistant/tool messages plus a one-line continuation prompt and retry,
      // bounded by maxAttempts. Only fires on real activity, never on clean stops.
      if (finalStep?.finishReason === "tool-calls" && attemptActivity && attempt < maxAttempts && !options.abortSignal?.aborted) {
        let continuedMessages: unknown[] = []
        try {
          const responseMessages = await result.responseMessages
          if (Array.isArray(responseMessages)) continuedMessages = responseMessages
        } catch { /* responseMessages unavailable (e.g. synthetic override) — continue with history only */ }
        if (continuedMessages.length) history = [...history, ...continuedMessages] as typeof history
        history = [...history, { role: "user", content: "You ran out of tool steps mid-task. Finish the remaining work now with as few additional tool calls as possible, then give your final answer." }]
        continue
      }
      // B.5 Leakage-aware learn mode: when teaching (learn mode), score whether
      // the final text revealed the answer outright instead of guiding. Heuristic
      // only — no extra LLM call; surfaced as an observable task event.
      if (options.mode === "learn" && text) {
        const score = leakageScore(text)
        options.onTaskEvent?.({ type: "budget", detail: `learning leakage=${score.toFixed(2)} (${leakageLabel(score)})` })
      }
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
        family: classified.family,
        maxToolSteps: stepBudget,
        budget: fitted.budget,
        retrieval: selectedContext.telemetry,
      }
    } catch (error) {
      if (attemptActivity || attempt === maxAttempts || options.abortSignal?.aborted || !retryable(error)) throw error
      const message = error instanceof Error ? error.message : String(error)
      options.onRetry?.({ attempt: attempt + 1, message })
      const base = (options.retryDelayMs ?? 500) * 2 ** (attempt - 1)
      const honor = retryAfterMs(error)
      await wait(Math.min(honor ?? base, 30_000), options.abortSignal)
    }  }
  throw new Error("Agent execution failed.")
}

export function contextEstimate(messages: AgentMessage[], summary = "") {
  const characters = messages.reduce((total, message) => total + message.text.length, summary.length)
  return Math.ceil(characters / 4)
}

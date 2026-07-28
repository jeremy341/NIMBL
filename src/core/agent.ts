import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { stepCountIs, streamText, tool } from "ai"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, isAbsolute, relative, resolve } from "node:path"
import { z } from "zod"
import { getProvider } from "./providers"
import { selectProjectContextWithBudget } from "./context"
import { teachingPrompt, type LearningState } from "./learning"
import type { PermissionSettings } from "./settings"
import { permissionExplanation, permissionFor } from "./permissions"

export type AgentMode = "build" | "plan" | "explain" | "learn"
export type ApprovalChoice = "once" | "always" | "reject"

export interface AgentMessage {
  role: "user" | "assistant" | "system"
  text: string
}

export interface PermissionRequest {
  id: string
  tool: "read" | "glob" | "grep" | "write" | "edit" | "apply_patch" | "bash" | "webfetch" | "skill" | "question" | "todowrite"
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
  askQuestion?: (question: { id: string; prompt: string; options: string[] }) => Promise<string>
  onFileChange?: (change: { path: string; before: string; after: string }) => void
  learning?: LearningState
  abortSignal?: AbortSignal
  permissions?: PermissionSettings
  contextWindow?: number
}

export interface AgentRunResult {
  text: string
  reasoning: string
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
}

const MAX_FILE_BYTES = 48_000
const MAX_SEARCH_FILES = 250
const MAX_TOOL_STEPS = 12

const MODE_TOOLS: Record<AgentMode, readonly PermissionRequest["tool"][]> = {
  build: ["read", "glob", "grep", "write", "edit", "apply_patch", "bash", "webfetch", "skill", "question", "todowrite"],
  plan: ["read", "glob", "grep", "webfetch", "skill", "question", "todowrite"],
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
  return provider.protocol === "anthropic"
    ? createAnthropic({ apiKey: config.apiKey, baseURL: provider.baseURL })(config.model)
    : createOpenAI({ baseURL: provider.baseURL, apiKey: config.apiKey, headers: provider.headers })(config.model)
}

function toolID() { return Math.random().toString(36).slice(2, 10) }

function relativePath(root: string, path: string) {
  const full = resolve(root, path)
  const rel = relative(root, full)
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`Path "${path}" resolved to "${rel}" which is outside this project.`)
  return { full, rel: rel.replaceAll("\\", "/") }
}

function assertReadable(root: string, path: string) {
  const result = relativePath(root, path)
  const name = basename(result.full)
  if ((name === ".env" || name.startsWith(".env.")) && name !== ".env.example") {
    throw new Error("Reading environment files is blocked by NIMBL’s default safety policy.")
  }
  return result
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
    .map((name) => resolve(root, name))
    .filter((file) => existsSync(file))
    .map((file) => `Project instructions (${basename(file)}):\n${clip(readFileSync(file, "utf8"), 12_000)}`)
    .join("\n\n")
}

async function shell(command: string, cwd: string, signal?: AbortSignal) {
  const child = Bun.spawn(process.platform === "win32"
    ? ["powershell.exe", "-NoProfile", "-Command", command]
    : ["/bin/sh", "-lc", command], { cwd, stdout: "pipe", stderr: "pipe" })
  const abort = () => child.kill()
  signal?.addEventListener("abort", abort, { once: true })
  try {
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    if (signal?.aborted) throw new Error("Command interrupted.")
    return { code, output: clip((stdout + (stderr ? "\n" + stderr : "")).trim() || "(no output)", 12_000) }
  } finally {
    signal?.removeEventListener("abort", abort)
  }
}

function safeURL(value: string) {
  const url = new URL(value)
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http and https URLs can be fetched.")
  return url
}

function skillFile(root: string, name: string) {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) throw new Error("Skill names may contain letters, numbers, _ and - only.")
  const file = resolve(root, ".nimbl", "skills", name, "SKILL.md")
  const rel = relative(root, file)
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Skill must remain inside this project.")
  return file
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
  const emitTool = (event: Omit<ToolEvent, "kind">) => options.onEvent({ kind: "tool", ...event })
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
          assertModeTool(options.mode, "read")
          const target = assertReadable(options.root, path)
          if (permissionFor(options.permissions, { tool: "read", target: target.rel }) === "deny") throw new Error("read is blocked by project policy.")
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
          assertModeTool(options.mode, "glob")
          if (permissionFor(options.permissions, { tool: "glob", target: pattern }) === "deny") throw new Error("glob is blocked by project policy.")
          const files: string[] = []
          for await (const match of new Bun.Glob(pattern).scan({ cwd: options.root, onlyFiles: true })) {
            if (!match.includes("node_modules/") && !match.includes(".git/")) files.push(match.replaceAll("\\", "/"))
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
          assertModeTool(options.mode, "grep")
          if (permissionFor(options.permissions, { tool: "grep", target: query }) === "deny") throw new Error("grep is blocked by project policy.")
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
          const target = relativePath(options.root, path)
          const before = existsSync(target.full) ? readFileSync(target.full, "utf8") : ""
          const diff = fileDiff(target.rel, before, content)
          emitTool({ id: event, tool: "write", state: "running", title: "Write " + target.rel, path: target.rel, diff })
          await approve("write", "Write " + target.rel, "Create or replace this project file.", diff, target.rel)
          mkdirSync(dirname(target.full), { recursive: true })
          writeFileSync(target.full, content, "utf8")
          options.onFileChange?.({ path: target.rel, before, after: content })
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
          const target = relativePath(options.root, path)
          const before = readFileSync(target.full, "utf8")
          if (!before.includes(oldText)) throw new Error("The requested text was not found; no file was changed.")
          const after = before.replace(oldText, newText)
          const diff = fileDiff(target.rel, before, after)
          emitTool({ id: event, tool: "edit", state: "running", title: "Edit " + target.rel, path: target.rel, diff })
          await approve("edit", "Edit " + target.rel, "Apply this exact text replacement.", diff, target.rel)
          writeFileSync(target.full, after, "utf8")
          options.onFileChange?.({ path: target.rel, before, after })
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
            const target = relativePath(options.root, path)
            return [path, existsSync(target.full) ? readFileSync(target.full, "utf8") : ""] as const
          }))
          emitTool({ id: event, tool: "apply_patch", state: "running", title: "Apply patch to " + paths.join(", "), detail: paths.join(", "), diff: clip(patch, 12_000) })
          await approve("apply_patch", "Apply patch", "Update " + paths.join(", "), clip(patch, 12_000), paths.join(", "))
          await applyUnifiedPatch(options.root, patch)
          for (const path of paths) {
            const target = relativePath(options.root, path)
            const after = existsSync(target.full) ? readFileSync(target.full, "utf8") : ""
            options.onFileChange?.({ path, before: before.get(path) || "", after })
          }
          emitTool({ id: event, tool: "apply_patch", state: "completed", title: "Applied patch", detail: paths.join(", "), diff: clip(patch, 12_000) })
          return "Applied patch to " + paths.join(", ")
        } catch (error) { const message = error instanceof Error ? error.message : String(error); emitTool({ id: event, tool: "apply_patch", state: "rejected", title: "Apply patch", detail: message }); return "Error: " + message }
      },
    }),
    bash: tool({
      description: "Run a shell command in the current project. The user must approve every command.",
      inputSchema: z.object({ command: z.string().describe("Command to execute in the project directory") }),
      execute: async ({ command }) => {
        const event = toolID(); emitTool({ id: event, tool: "bash", state: "running", title: "Run command", detail: command })
        try {
          await approve("bash", "Run command", command, undefined, command)
          const result = await shell(command, options.root, options.abortSignal)
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
    skill: tool({
      description: "Load a project-local NIMBL skill from .nimbl/skills/<name>/SKILL.md.",
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => {
        const event = toolID(); emitTool({ id: event, tool: "skill", state: "running", title: "Load skill " + name })
        try {
          assertModeTool(options.mode, "skill")
          const file = skillFile(options.root, name)
          if (permissionFor(options.permissions, { tool: "skill", target: name }) === "deny") throw new Error("skill is blocked by project policy.")
          if (!existsSync(file)) throw new Error(`No project skill named "${name}".`)
          const output = clip(readFileSync(file, "utf8"), 16_000)
          emitTool({ id: event, tool: "skill", state: "completed", title: "Loaded skill " + name, output })
          return output
        } catch (error) { const message = error instanceof Error ? error.message : String(error); emitTool({ id: event, tool: "skill", state: "failed", title: "Load skill " + name, detail: message }); return "Error: " + message }
      },
    }),
    todowrite: tool({
      description: "Record a short task checklist for this run. Use for multi-step work and keep statuses current.",
      inputSchema: z.object({ items: z.array(z.object({ content: z.string().min(1), status: z.enum(["pending", "in_progress", "completed"]) })).min(1).max(12) }),
      execute: async ({ items }) => {
        assertModeTool(options.mode, "todowrite")
        const event = toolID(); const output = items.map((item) => `${item.status === "completed" ? "[x]" : item.status === "in_progress" ? "[>]" : "[ ]"} ${item.content}`).join("\n")
        emitTool({ id: event, tool: "todowrite", state: "completed", title: "Updated task list", output })
        return output
      },
    }),
    question: tool({
      description: "Ask the user a focused multiple-choice question when a decision cannot be made safely from the project context.",
      inputSchema: z.object({ prompt: z.string().min(1), options: z.array(z.string().min(1)).min(2).max(6) }),
      execute: async ({ prompt, options: answers }) => {
        const event = toolID(); emitTool({ id: event, tool: "question", state: "running", title: "Question", detail: prompt })
        try {
          await approve("question", "Question for the user", prompt)
          if (!options.askQuestion) throw new Error("The current interface cannot ask interactive questions.")
          const answer = await options.askQuestion({ id: event, prompt, options: answers })
          emitTool({ id: event, tool: "question", state: "completed", title: "Answered question", detail: answer })
          return answer
        } catch (error) { const message = error instanceof Error ? error.message : String(error); emitTool({ id: event, tool: "question", state: "rejected", title: "Question", detail: message }); return "Error: " + message }
      },
    }),
  }

  const history = options.messages.slice(-30).map((message) => ({ role: message.role, content: message.text }))
  const priorTokens = contextEstimate(options.messages, options.summary || "")
  // Keep space for the model response, but never impose a separate NIMBL context cap.
  // The selected model's context window is the actual limit.
  const contextBudgetChars = Math.max(0, Math.floor(((options.contextWindow || 128_000) - priorTokens - 8_000) * 4))
  const selectedContext = await selectProjectContextWithBudget(options.root, options.messages.at(-1)?.text || "", 12, contextBudgetChars)
  const system = [
    "You are NIMBL, a token-efficient coding companion. Work inside the current project using tools before making claims about its code.",
    modePrompt(options.mode),
    "Use read, glob, grep, and project-local skills selectively. Keep tool output focused. Use todowrite for multi-step work. Use question only when a user decision is necessary. Use edit for focused changes, write for new or whole-file content, and apply_patch only for a valid unified diff.",
    "Current permission policy: " + ["read", "glob", "grep", "edit", "write", "bash", "webfetch", "skill", "question"].map((name) => `${name}=${permissionExplanation(options.permissions, { tool: name })}`).join(", "),
    teachingPrompt(options.learning || { concepts: {} }),
    projectInstructions(options.root),
    options.summary ? "Session summary:\n" + options.summary : "",
    selectedContext.items.length ? `Relevant project context (${selectedContext.estimatedTokens} estimated tokens${selectedContext.cacheHit ? ", cache hit" : ""}; selected locally to reduce token use):\n` + selectedContext.items.map((item) => `# ${item.path} — ${item.reason}\n${item.excerpt}`).join("\n\n") : "",
  ].filter(Boolean).join("\n\n")

  const result = streamText({ model: createModel(options), system, messages: history as any, tools, stopWhen: stepCountIs(MAX_TOOL_STEPS), abortSignal: options.abortSignal })
  let text = ""
  let reasoning = ""
  for await (const part of result.fullStream) {
    if (part.type === "text-delta") { text += part.text; options.onEvent({ kind: "text", delta: part.text }) }
    if (part.type === "reasoning-delta") { reasoning += part.text; options.onEvent({ kind: "reasoning", delta: part.text }) }
  }
  const usage = await result.usage
  return { text, reasoning, usage: { inputTokens: usage.inputTokens || 0, outputTokens: usage.outputTokens || 0, totalTokens: usage.totalTokens || 0 } }
}

export function contextEstimate(messages: AgentMessage[], summary = "") {
  const characters = messages.reduce((total, message) => total + message.text.length, summary.length)
  return Math.ceil(characters / 4)
}

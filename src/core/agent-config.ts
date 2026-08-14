import type { AgentMode } from "./agent"
import type { PermissionSettings } from "./settings"

export interface AgentDefinition {
  id: string
  version: 1
  description: string
  mode: AgentMode
  systemPrompt?: string
  tools: string[]
  permissions: PermissionSettings
  reasoningVisible: boolean
  maxSteps: number
  maxTokens: number
  temperature?: number
  visibility: "builtin" | "project" | "global"
}

export interface AgentConfigInput {
  id: string
  description?: string
  mode?: AgentMode
  systemPrompt?: string
  tools?: string[]
  permissions?: PermissionSettings
  reasoningVisible?: boolean
  maxSteps?: number
  maxTokens?: number
  temperature?: number
  visibility?: AgentDefinition["visibility"]
}

const ALL_TOOLS = ["read", "glob", "grep", "write", "edit", "apply_patch", "bash", "webfetch", "websearch", "skill", "question", "todowrite", "delegate"]
const READ_ONLY = ["read", "glob", "grep", "webfetch", "websearch", "skill", "question", "todowrite"]
const DEFAULT_PERMISSIONS: PermissionSettings = { "*": "ask", read: "allow", glob: "allow", grep: "allow", skill: "allow", todowrite: "allow" }

export const BUILTIN_AGENTS: readonly AgentDefinition[] = [
  { id: "build", version: 1, description: "Implement approved changes and verify them.", mode: "build", tools: ALL_TOOLS, permissions: { ...DEFAULT_PERMISSIONS, edit: "ask", write: "ask", apply_patch: "ask", bash: "ask" }, reasoningVisible: true, maxSteps: 12, maxTokens: 8_192, visibility: "builtin" },
  { id: "plan", version: 1, description: "Investigate and produce an ordered plan without side effects.", mode: "plan", tools: READ_ONLY, permissions: { ...DEFAULT_PERMISSIONS, bash: "deny", write: "deny", edit: "deny", apply_patch: "deny" }, reasoningVisible: true, maxSteps: 12, maxTokens: 6_144, visibility: "builtin" },
  { id: "explain", version: 1, description: "Explain code and trade-offs clearly.", mode: "explain", tools: READ_ONLY.filter((tool) => tool !== "todowrite"), permissions: { ...DEFAULT_PERMISSIONS, todowrite: "deny" }, reasoningVisible: false, maxSteps: 8, maxTokens: 4_096, visibility: "builtin" },
  { id: "learn", version: 1, description: "Teach with questions, hints and practice.", mode: "learn", tools: ["read", "skill", "question", "todowrite"], permissions: { ...DEFAULT_PERMISSIONS, todowrite: "allow", bash: "deny", write: "deny", edit: "deny", apply_patch: "deny" }, reasoningVisible: true, maxSteps: 8, maxTokens: 4_096, visibility: "builtin" },
]

export function validateAgentDefinition(input: AgentConfigInput): AgentDefinition {
  if (!/^[a-z][a-z0-9_-]{0,31}$/i.test(input.id)) throw new Error("Agent id must contain 1-32 letters, numbers, _ or -.")
  const maxSteps = input.maxSteps ?? 12
  const maxTokens = input.maxTokens ?? 8_192
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 100) throw new Error("Agent maxSteps must be between 1 and 100.")
  if (!Number.isInteger(maxTokens) || maxTokens < 256 || maxTokens > 1_000_000) throw new Error("Agent maxTokens is outside the supported range.")
  if (input.temperature !== undefined && (!Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 2)) throw new Error("Agent temperature must be between 0 and 2.")
  const tools = [...new Set(input.tools || ALL_TOOLS)].filter(Boolean)
  const invalid = tools.filter((tool) => !ALL_TOOLS.includes(tool))
  if (invalid.length) throw new Error(`Unknown agent tools: ${invalid.join(", ")}`)
  return { version: 1, id: input.id, description: input.description?.trim() || input.id, mode: input.mode || "build", systemPrompt: input.systemPrompt?.trim(), tools, permissions: { ...DEFAULT_PERMISSIONS, ...(input.permissions || {}) }, reasoningVisible: input.reasoningVisible ?? true, maxSteps, maxTokens, temperature: input.temperature, visibility: input.visibility || "project" }
}

export function effectiveAgent(id: string, custom: readonly AgentConfigInput[] = []): AgentDefinition {
  const builtIn = BUILTIN_AGENTS.find((agent) => agent.id === id)
  if (builtIn) return builtIn
  const definition = custom.find((agent) => agent.id === id)
  if (!definition) throw new Error(`Agent "${id}" is not configured.`)
  return validateAgentDefinition(definition)
}

export function effectivePermissions(agent: AgentDefinition, project: PermissionSettings = {}) {
  return { ...project, ...agent.permissions }
}

import type { PermissionRule, PermissionSettings, PermissionValue } from "./settings"

export interface PermissionCheck {
  tool: string
  target?: string
  agent?: string
  paths?: string[]
}

export interface PermissionDecision {
  value: PermissionValue
  matchedRule: string
  target: string
  rationale: string
  requiresApproval: boolean
}

function wildcard(pattern: string, value: string) {
  const expression = "^" + pattern.split("*").map((part) => part.replace(/[|\\{}()[\]^$+?.]/g, "\\$&")).join(".*") + "$"
  return new RegExp(expression, "i").test(value)
}

function resolveRule(rule: PermissionRule | undefined, target: string): PermissionValue | undefined {
  if (!rule) return
  if (typeof rule === "string") return rule
  let match: PermissionValue | undefined
  for (const [pattern, value] of Object.entries(rule)) if (wildcard(pattern, target)) match = value
  return match
}

export function permissionFor(settings: PermissionSettings | undefined, check: PermissionCheck): PermissionValue {
  const source = settings || {}
  const target = check.target || "*"
  return resolveRule(source[check.tool], target) || resolveRule(source["*"], target) || "ask"
}

export function permissionDecision(settings: PermissionSettings | undefined, check: PermissionCheck): PermissionDecision {
  const source = settings || {}; const target = check.target || check.paths?.join(", ") || "*"; const toolRule = source[check.tool]; let matchedRule = "*"; let value = resolveRule(toolRule, target)
  if (value !== undefined) { matchedRule = check.tool; if (typeof toolRule === "object") matchedRule = `${check.tool}:${Object.keys(toolRule).find((pattern) => wildcard(pattern, target)) || "*"}` }
  else { value = resolveRule(source["*"], target); if (typeof source["*"] === "object") matchedRule = `*:${Object.keys(source["*"] as Record<string, PermissionValue>).find((pattern) => wildcard(pattern, target)) || "*"}` }
  const resolved = value || "ask"; const agentText = check.agent ? ` for agent ${check.agent}` : ""
  return { value: resolved, matchedRule, target, rationale: resolved === "allow" ? `Allowed by ${matchedRule}${agentText}.` : resolved === "deny" ? `Denied by ${matchedRule}${agentText}.` : `Approval required by ${matchedRule}${agentText}.`, requiresApproval: resolved === "ask" }
}

export function updatePermission(settings: PermissionSettings, tool: string, value: PermissionValue, target = "*") {
  const next = { ...settings }; const current = next[tool]
  if (target === "*") next[tool] = value
  else next[tool] = { ...(typeof current === "object" ? current : {}), [target]: value }
  return next
}

export function removePermission(settings: PermissionSettings, tool: string, target = "*") {
  const next = { ...settings }; if (target === "*") { delete next[tool]; return next } const current = next[tool]; if (typeof current !== "object") return next; const rules = { ...current }; delete rules[target]; next[tool] = Object.keys(rules).length ? rules : undefined; return next
}

export function permissionExplanation(settings: PermissionSettings | undefined, check: PermissionCheck) {
  return permissionDecision(settings, check).rationale
}

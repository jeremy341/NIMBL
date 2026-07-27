import type { PermissionRule, PermissionSettings, PermissionValue } from "./settings"

export interface PermissionCheck {
  tool: string
  target?: string
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

export function permissionExplanation(settings: PermissionSettings | undefined, check: PermissionCheck) {
  const decision = permissionFor(settings, check)
  return decision === "allow" ? "Allowed by project policy." : decision === "deny" ? "Blocked by project policy." : "Requires approval by project policy."
}

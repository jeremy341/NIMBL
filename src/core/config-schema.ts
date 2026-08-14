import { existsSync, readFileSync, watch, type FSWatcher } from "node:fs"
import { join } from "node:path"
import { DEFAULT_SETTINGS, type NimblSettings } from "./settings"

export interface ConfigDiagnostic { path: string; level: "warning" | "error"; message: string }
export function validateSettings(settings: NimblSettings): ConfigDiagnostic[] {
  const diagnostics: ConfigDiagnostic[] = []; if (settings.providerAllowlist?.some((id) => !/^[a-z0-9_-]+$/i.test(id))) diagnostics.push({ path: "providerAllowlist", level: "error", message: "Provider IDs must contain letters, numbers, _ or -." }); const bindings = Object.entries(settings.keybinds); const seen = new Map<string, string>(); for (const [name, key] of bindings) { const previous = seen.get(key); if (previous) diagnostics.push({ path: `keybinds.${name}`, level: "warning", message: `Key ${key} is also bound to ${previous}.` }); seen.set(key, name) } if ((settings.prompt?.historySize || 0) < 1) diagnostics.push({ path: "prompt.historySize", level: "error", message: "Prompt history must retain at least one item." }); if (settings.skills?.paths?.some((item) => typeof item !== "string" || !item.trim())) diagnostics.push({ path: "skills.paths", level: "error", message: "Skill paths must be non-empty strings." }); if (settings.skills?.urls?.some((item) => typeof item !== "string" || !item.trim() || !/^https?:\/\//i.test(item.trim()))) diagnostics.push({ path: "skills.urls", level: "error", message: "Skill URLs must be absolute http(s) URLs." }); return diagnostics
}

export function loadProjectConfig(root: string) {
  const candidates = [join(root, ".nimbl", "config.json"), join(root, "nimbl.config.json")]; let merged: Partial<NimblSettings> = {}
  for (const file of candidates) { if (!existsSync(file)) continue; try { const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<NimblSettings>; merged = { ...merged, ...parsed } } catch { /* Invalid config is reported by the caller via diagnostics. */ } }
  const settings = { ...structuredClone(DEFAULT_SETTINGS), ...merged, keybinds: { ...DEFAULT_SETTINGS.keybinds, ...merged.keybinds }, providerRouting: { ...DEFAULT_SETTINGS.providerRouting, ...merged.providerRouting }, permissions: { ...DEFAULT_SETTINGS.permissions, ...merged.permissions } } as NimblSettings
  return { settings, diagnostics: validateSettings(settings) }
}

export function watchProjectConfig(root: string, onChange: (result: ReturnType<typeof loadProjectConfig>) => void): FSWatcher[] {
  const files = [join(root, ".nimbl", "config.json"), join(root, "nimbl.config.json")].filter((file) => existsSync(file)); return files.map((file) => watch(file, { persistent: false }, () => onChange(loadProjectConfig(root))))
}

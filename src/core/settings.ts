import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export type NimblTheme = "nimbl" | "opencode" | "mono"
export type PermissionValue = "ask" | "allow" | "deny"
export type PermissionRule = PermissionValue | Record<string, PermissionValue>
export type PermissionSettings = Record<string, PermissionRule | undefined>

export interface NimblSettings {
  theme: NimblTheme
  keybinds: Record<string, string>
  customCommands: Record<string, { description: string; prompt: string; agent?: "build" | "plan" | "explain" | "learn" }>
  providerRouting: { preferLocal: boolean; preferLowCost: boolean; preferFast: boolean }
  permissions: PermissionSettings
  mcp: Record<string, { command: string; args?: string[]; enabled?: boolean }>
  plugins: string[]
  lsp: Record<string, { command: string; args?: string[]; enabled?: boolean }>
  share: "manual" | "disabled"
}

export const DEFAULT_SETTINGS: NimblSettings = {
  theme: "nimbl",
  keybinds: { palette: "ctrl+p", sessions: "ctrl+s", agent: "tab" },
  customCommands: {},
  providerRouting: { preferLocal: false, preferLowCost: false, preferFast: false },
  permissions: {
    "*": "ask",
    read: "allow", glob: "allow", grep: "allow", skill: "allow",
    edit: "ask", write: "ask", apply_patch: "ask", bash: "ask", webfetch: "ask", question: "ask", todowrite: "allow",
  },
  mcp: {}, plugins: [], lsp: {}, share: "manual",
}

function fileFor(root: string) { return join(root, ".nimbl", "settings.json") }

export function loadSettings(root: string): NimblSettings {
  const file = fileFor(root)
  if (!existsSync(file)) return structuredClone(DEFAULT_SETTINGS)
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<NimblSettings>
    return {
      ...structuredClone(DEFAULT_SETTINGS), ...parsed,
      theme: (parsed.theme && ["nimbl", "opencode", "mono"].includes(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme) as NimblTheme,
      keybinds: { ...DEFAULT_SETTINGS.keybinds, ...parsed.keybinds },
      customCommands: parsed.customCommands || {},
      providerRouting: { ...DEFAULT_SETTINGS.providerRouting, ...parsed.providerRouting },
      permissions: { ...DEFAULT_SETTINGS.permissions, ...parsed.permissions },
      mcp: parsed.mcp || {}, plugins: parsed.plugins || [], lsp: parsed.lsp || {},
    }
  } catch { return structuredClone(DEFAULT_SETTINGS) }
}

export function saveSettings(root: string, settings: NimblSettings) {
  const folder = join(root, ".nimbl")
  mkdirSync(folder, { recursive: true })
  writeFileSync(fileFor(root), JSON.stringify(settings, null, 2) + "\n", "utf8")
}

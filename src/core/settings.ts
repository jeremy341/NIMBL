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
  shareURL?: string
  agents?: Record<string, import("./agent-config").AgentConfigInput>
  providerAllowlist?: string[]
  providerDenylist?: string[]
  prompt?: { queue: "reject" | "queue" | "replace"; historySize: number; maxStash: number; editor?: string }
  notifications?: { completion: boolean; permission: boolean; question: boolean; failure: boolean; sound: boolean }
  learning?: import("./learning").LearningPreferences
  workspace?: { useWorktrees: boolean; requireCleanGit: boolean }
  skills?: { paths?: string[]; urls?: string[] }
}

export const DEFAULT_SETTINGS: NimblSettings = {
  theme: "nimbl",
  keybinds: {
    palette: "ctrl+p",
    sessions: "ctrl+l",
    agent: "tab",
    new: "ctrl+n",
    timeline: "ctrl+g",
    rename: "ctrl+r",
    delete: "ctrl+d",
    pin: "ctrl+f",
    sidebar: "ctrl+b",
    model: "ctrl+m",
    status: "ctrl+shift+s",
    theme: "ctrl+t",
    undo: "ctrl+z",
    redo: "ctrl+y",
    export: "ctrl+x",
    conceal: "ctrl+h",
    timestamps: "ctrl+alt+t",
    pageDown: "pagedown",
    pageUp: "pageup",
    first: "home",
    last: "end",
  },
  customCommands: {},
  providerRouting: { preferLocal: false, preferLowCost: false, preferFast: false },
  permissions: {
    "*": "ask",
    read: "allow", glob: "allow", grep: "allow", skill: "allow",
    edit: "ask", write: "ask", apply_patch: "ask", bash: "ask", webfetch: "ask", websearch: "ask", question: "ask", todowrite: "allow", delegate: "ask",
  },
  mcp: {}, plugins: [], lsp: {}, share: "manual",
  agents: {}, providerAllowlist: [], providerDenylist: [],
  prompt: { queue: "queue", historySize: 50, maxStash: 10 },
  notifications: { completion: true, permission: true, question: true, failure: true, sound: false },
  learning: { enabled: true, quizFrequency: "normal", retentionDays: 365, storePrompts: false },
  workspace: { useWorktrees: false, requireCleanGit: true },
  skills: { paths: [], urls: [] },
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
      shareURL: parsed.shareURL,
      agents: parsed.agents || {}, providerAllowlist: parsed.providerAllowlist || [], providerDenylist: parsed.providerDenylist || [],
      prompt: { queue: parsed.prompt?.queue || DEFAULT_SETTINGS.prompt!.queue, historySize: parsed.prompt?.historySize ?? DEFAULT_SETTINGS.prompt!.historySize, maxStash: parsed.prompt?.maxStash ?? DEFAULT_SETTINGS.prompt!.maxStash, editor: parsed.prompt?.editor },
      notifications: { completion: parsed.notifications?.completion ?? DEFAULT_SETTINGS.notifications!.completion, permission: parsed.notifications?.permission ?? DEFAULT_SETTINGS.notifications!.permission, question: parsed.notifications?.question ?? DEFAULT_SETTINGS.notifications!.question, failure: parsed.notifications?.failure ?? DEFAULT_SETTINGS.notifications!.failure, sound: parsed.notifications?.sound ?? DEFAULT_SETTINGS.notifications!.sound },
      learning: { enabled: parsed.learning?.enabled ?? DEFAULT_SETTINGS.learning!.enabled, quizFrequency: parsed.learning?.quizFrequency || DEFAULT_SETTINGS.learning!.quizFrequency, retentionDays: parsed.learning?.retentionDays ?? DEFAULT_SETTINGS.learning!.retentionDays, storePrompts: false }, workspace: { useWorktrees: parsed.workspace?.useWorktrees ?? DEFAULT_SETTINGS.workspace!.useWorktrees, requireCleanGit: parsed.workspace?.requireCleanGit ?? DEFAULT_SETTINGS.workspace!.requireCleanGit }, skills: { paths: Array.isArray(parsed.skills?.paths) ? parsed.skills.paths.filter((item) => typeof item === "string") : [], urls: Array.isArray(parsed.skills?.urls) ? parsed.skills.urls.filter((item) => typeof item === "string") : [] },
    }
  } catch { return structuredClone(DEFAULT_SETTINGS) }
}

export function saveSettings(root: string, settings: NimblSettings) {
  const folder = join(root, ".nimbl")
  mkdirSync(folder, { recursive: true })
  writeFileSync(fileFor(root), JSON.stringify(settings, null, 2) + "\n", "utf8")
}

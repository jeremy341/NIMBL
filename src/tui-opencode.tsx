import { createCliRenderer } from "@opentui/core"
import { render, useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { existsSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { resolveConfig } from "@/config"
import { estimateReferenceCost } from "@/core/api"
import {
  type AgentMessage,
  type AgentEvent,
  type PermissionRequest,
} from "@/core/agent"
import { expandCommand, loadProjectCommands } from "@/core/commands"
import { discoverSkills } from "@/core/skills"
import { editTextWithEditor } from "@/core/editor"
import { loadFrecency, rankFiles, recordFrecency } from "@/core/frecency"
import { ctrlCAction } from "@/core/ctrl-c"
import { NimblBackend } from "@/core/backend"
import { loadGlobalConfig, saveGlobalConfig } from "@/core/global-config"
import { EXIT_CONFIRM_WINDOW_MS, registerExitPress } from "@/core/exit-guard"
import { loadLearning, observeLearning, saveLearning } from "@/core/learning"
import { preparePromptContext } from "@/core/prompt-context"
import { permissionFor } from "@/core/permissions"
import {
  PROVIDERS,
  defaultModelFor,
  localFallbackKey,
  modelContextWindow,
  providerApiKey,
  resolveModel,
} from "@/core/providers"
import { checkProviderHealth } from "@/core/provider-health"
import { catalogPrice, estimateProviderCost, warmCatalog } from "@/core/pricing"
import { routeProvider } from "@/core/routing"
import { findSession, latestSession, sessionEpilogue } from "@/core/session-lifecycle"
import {
  compactSession,
  dequeuePrompt,
  forkSession,
  navigateDraft,
  popDraft,
  queuePrompt,
  recordSnapshot,
  recordSnapshotGroup,
  redoSnapshot,
  renameSession,
  revertToMessage,
  setDraft as recordSessionDraft,
  shouldCompactSession,
  snapshotUnifiedDiff,
  stashDraft,
  undoSnapshot,
  type FileSnapshot,
} from "@/core/session-actions"
import {
  backupInvalidSessionStore,
  loadSessionStore,
  lastRequestUsage,
  sessionSummary,
  sessionUsage,
  SessionStoreConflictError,
  SessionStoreLockedError,
  type SessionStore,
  type StoredMessage,
  type StoredSession,
} from "@/core/sessions"
import { loadSettings, saveSettings, type NimblSettings, type PermissionValue } from "@/core/settings"
import { runShellCommand } from "@/core/shell"
import { countTextTokens } from "@/core/tokenizers"
import { finishAssistant, reduceAssistantEvents } from "@/core/transcript"
import { runCliCommand } from "./cli-commands"
import {
  win32DisableProcessedInput,
  win32FlushInputBuffer,
  win32InstallCtrlCGuard,
} from "@/core/terminal-win32"
import {
  AlertDialog,
  ConfirmDialog,
  DetailDialog,
  DiffDialog,
  DialogOverlay,
  ExportOptionsDialog,
  HelpDialog,
  SelectDialog,
  SessionPrompt,
  SessionScreen,
  StashDialog,
  TextPromptDialog,
  Toast,
  agentColor,
  enableAnimations,
  theme,
  type AgentMode,
  type ChatMessage,
  type ChatSession,
  type CommandOption,
  type SessionPromptRef,
  type ToastVariant,
} from "@/tui-opencode-ui"

let renderer: Awaited<ReturnType<typeof createCliRenderer>> | undefined
let restoreCtrlCGuard: (() => void) | undefined

const LOGO = [
  "███╗   ██╗ ██╗ ███╗   ███╗ ██████╗  ██╗",
  "████╗  ██║ ██║ ████╗ ████║ ██╔══██╗ ██║",
  "██╔██╗ ██║ ██║ ██╔████╔██║ ██████╔╝ ██║",
  "██║╚██╗██║ ██║ ██║╚██╔╝██║ ██╔══██╗ ██║",
  "██║ ╚████║ ██║ ██║ ╚═╝ ██║ ██████╔╝ ███████╗",
  "╚═╝  ╚═══╝ ╚═╝ ╚═╝     ╚═╝ ╚═════╝  ╚══════╝",
]

// Keep the branded home screen legible on short terminals. OpenCode scales its
// home composition rather than letting the prompt or footer get clipped; this
// compact mark preserves that behavior while retaining NIMBL's custom logo.
const LOGO_COMPACT = [
  " _   _ ___ __  __ ___ _    ",
  "| \\ | |_ _|  \\/  | _ ) |   ",
  "| .` || || |\\/| | _ \\ |__ ",
  "|_|\\_|___|_|  |_|___/____|",
]

const AGENT_MODES: AgentMode[] = ["build", "plan", "explain", "learn"]
const PROVIDER_PRIORITY = new Map([
  ["opencode-zen", 0],
  ["opencode-go", 1],
  ["openai", 2],
  ["github-models", 3],
  ["anthropic", 4],
  ["google", 5],
])

const BASE_COMMANDS: CommandOption[] = [
  { value: "new", title: "New session", description: "Start a clean session", category: "Session", suggested: true },
  { value: "sessions", title: "Sessions", description: "Switch sessions", category: "Session", suggested: true, aliases: ["resume", "continue"] },
  { value: "timeline", title: "Timeline", description: "Jump to an earlier prompt", category: "Session" },
  { value: "rename", title: "Rename session", description: "Change the active title", category: "Session" },
  { value: "fork", title: "Fork session", description: "Branch from this conversation", category: "Session" },
  { value: "pin", title: "Pin session", description: "Toggle the active pin", category: "Session" },
  { value: "delete", title: "Delete session", description: "Remove local conversation history", category: "Session" },
  { value: "compact", title: "Compact", description: "Archive older turns into a structured summary", category: "Session" },
  { value: "clear", title: "Clear", description: "Clear the active transcript", category: "Session" },
  { value: "model", title: "Model", description: "Select a model", category: "Configuration", suggested: true },
  { value: "provider", title: "Provider", description: "Connect or select a provider", category: "Configuration", suggested: true },
  { value: "agent", title: "Agent", description: "Select Build, Plan, Explain, or Learn", category: "Configuration" },
  { value: "route", title: "Provider routing", description: "Prefer local, fast, or budget", category: "Configuration", autocomplete: "insert" },
  { value: "settings", title: "Settings", description: "Inspect project integrations and policies", category: "Configuration" },
  { value: "keybinds", title: "Keybindings", description: "Inspect configured keybindings", category: "Configuration" },
  { value: "theme", title: "Theme", description: "View the active color theme", category: "Configuration" },
  { value: "thinking", title: "Thinking", description: "Show reasoning visibility and mode", category: "Configuration" },
  { value: "conceal", title: "Toggle conceal", description: "Hide long code blocks in messages", category: "Configuration" },
  { value: "timestamps", title: "Toggle timestamps", description: "Show or hide message timestamps", category: "Configuration" },
  { value: "animations", title: "Toggle animations", description: "Enable or disable animated spinners", category: "Configuration" },
  { value: "skills", title: "Skills", description: "Inspect project skills", category: "Configuration" },
  { value: "context", title: "Context", description: "Inspect context budget", category: "View" },
  { value: "details", title: "Details", description: "Show session diagnostics", category: "View" },
  { value: "status", title: "Status", description: "Show active configuration", category: "View" },
  { value: "stats", title: "Stats", description: "Show session usage", category: "View" },
  { value: "debug", title: "Debug console", description: "Inspect runtime and backend diagnostics", category: "View" },
  { value: "diff", title: "Diff", description: "Inspect tracked file changes", category: "View" },
  { value: "subagents", title: "Subagents", description: "Inspect child-agent activity", category: "View" },
  { value: "notifications", title: "Notifications", description: "Inspect attention and notification state", category: "View" },
  { value: "sidebar", title: "Toggle sidebar", description: "Show or hide session details", category: "View" },
  { value: "home", title: "Home", description: "Return to the NIMBL home screen", category: "View" },
  { value: "help", title: "Help", description: "Show keyboard shortcuts", category: "View" },
  { value: "undo", title: "Undo", description: "Undo the latest tracked write, edit, or patch", category: "Project" },
  { value: "redo", title: "Redo", description: "Reapply the latest undone change", category: "Project" },
  { value: "init", title: "Initialize project rules", description: "Create NIMBL.md", category: "Project" },
  { value: "export", title: "Export", description: "Export the active session", category: "Project" },
  { value: "export-options", title: "Export options", description: "Choose an export format", category: "Project" },
  { value: "share", title: "Share", description: "Publish a redacted hosted session link", category: "Project" },
  { value: "unshare", title: "Unshare", description: "Remove the hosted session link", category: "Project" },
  { value: "workspace", title: "Worktrees", description: "Create and manage Git worktrees", category: "Project", aliases: ["worktrees"] },
  { value: "stash", title: "Stash prompt", description: "Save prompt text for later", category: "Session", autocomplete: "insert" },
  { value: "pop", title: "Pop prompt stash", description: "Restore the latest saved prompt", category: "Session" },
  { value: "stashes", title: "Stashed prompts", description: "List saved prompts", category: "Session" },
  { value: "editor", title: "Edit with $EDITOR", description: "Open the current draft in your external editor", category: "Session", autocomplete: "insert" },
  { value: "retry", title: "Retry last response", description: "Resend the latest user prompt", category: "Session" },
  { value: "palette", title: "Command palette", description: "Browse every action", category: "NIMBL" },
  { value: "quit", title: "Quit", description: "Exit NIMBL", category: "NIMBL" },
]

type DialogName =
  | "palette"
  | "model"
  | "provider"
  | "connect"
  | "agent"
  | "sessions"
  | "timeline"
  | "message"
  | "rename"
  | "delete"
  | "theme"
  | "skills"
  | "subagents"
  | "diff"
  | "diff-view"
  | "revert-message"
  | "worktrees"
  | "help"
  | "stash"
  | "worktree-create"
  | "worktree-branch"
  | "worktree-remove"
  | "export-options"
  | "detail"
  | null

interface PendingApproval {
  sessionID: string
  request: PermissionRequest
  resolve: (choice: "once" | "always" | "reject") => void
}

interface PendingQuestion {
  sessionID: string
  prompt: string
  options: string[]
  freeform?: boolean
  resolve: (answer: string) => void
}

interface ToastState {
  title?: string
  message: string
  variant: ToastVariant
}

function id() {
  return Math.random().toString(36).slice(2, 10)
}

function preview(text: string) {
  return text.replace(/\s+/g, " ").slice(0, 48) || "New session"
}

function projectSkillOptions(directory: string): CommandOption[] {
  return discoverSkills(directory).map((skill) => ({
    value: skill.name,
    title: skill.name,
    description: skill.description || skill.source,
    details: [`${skill.source} skill · ${skill.location}`],
  }))
}

function projectFiles(directory: string, limit = 500): string[] {
  const files: string[] = []
  const excluded = new Set([".git", ".nimbl", "node_modules", "dist"])
  function visit(folder: string, prefix = "") {
    if (files.length >= limit) return
    let entries
    try {
      entries = readdirSync(folder, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (files.length >= limit) break
      if (entry.isSymbolicLink() || excluded.has(entry.name) || entry.name === ".env" || entry.name.startsWith(".env.")) continue
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) visit(join(folder, entry.name), relative)
      else if (entry.isFile()) files.push(relative)
    }
  }
  visit(directory)
  return files.sort((left, right) => left.localeCompare(right))
}

function providerName(providerID: string) {
  return PROVIDERS.find((item) => item.id === providerID)?.name || providerID
}

function modelName(providerID: string, modelID: string) {
  return PROVIDERS.find((item) => item.id === providerID)?.models.find((item) => item.id === modelID)?.name || modelID
}

function modeLabel(mode: AgentMode) {
  return mode.charAt(0).toUpperCase() + mode.slice(1)
}

function nextAgentMode(mode: AgentMode) {
  return AGENT_MODES[(AGENT_MODES.indexOf(mode) + 1) % AGENT_MODES.length]!
}

function formatTokens(value: number) {
  if (!Number.isFinite(value)) return "∞"
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

function runtimeContextWindow(providerID: string, modelID: string) {
  try { return modelContextWindow(providerID, modelID) }
  catch { return 128_000 }
}

function flagValue(argv: string[], flag: string) {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

function modelOptions(providerFilter?: string, discovered: Record<string, string[]> = {}): CommandOption[] {
  return [...PROVIDERS]
    .filter((provider) => !providerFilter || provider.id === providerFilter)
    .sort((left, right) => Number(left.id !== "opencode-zen") - Number(right.id !== "opencode-zen") || left.name.localeCompare(right.name))
    .flatMap((provider) => {
      const configured = provider.models
        .filter((model) => model.status !== "deprecated")
        .map((model) => ({
          value: `${provider.id}::${model.id}`,
          title: model.name,
          footer: model.free ? "Free" : undefined,
          category: provider.name,
          disabled: provider.id === "opencode-zen" && model.id.includes("-nano"),
        }))
      const known = new Set(provider.models.map((model) => model.id))
      const runtime = (discovered[provider.id] || []).filter((model) => !known.has(model)).map((model) => ({
        value: `${provider.id}::${model}`,
        title: model,
        description: "discovered from provider",
        category: provider.name,
      }))
      return [...configured, ...runtime]
    })
}

function commandLine(value: string) {
  const text = value.trim().replace(/^\//, "")
  const [name = "", ...rest] = text.split(/\s+/)
  return { name, argument: rest.join(" ") }
}

function agentMention(value: string): { agent: AgentMode; text: string } | undefined {
  const match = value.trim().match(/^@(build|plan|explain|learn)(?:\s+([\s\S]*))?$/i)
  if (!match) return undefined
  return { agent: match[1]!.toLowerCase() as AgentMode, text: match[2]?.trim() || "" }
}

function matchesKeybind(event: any, binding: string | undefined) {
  if (!binding) return false
  const parts = binding.toLowerCase().split("+")
  const key = parts.at(-1)
  const name = String(event.name || event.key || "").toLowerCase()
  return name === key
    && Boolean(event.ctrl) === parts.includes("ctrl")
    && Boolean(event.shift) === parts.includes("shift")
    && Boolean(event.meta) === parts.includes("alt")
}

function visibleMessages(session: StoredSession): ChatMessage[] {
  return session.messages.flatMap((message) => {
    if (message.role === "tool" || message.role === "reasoning") return []
    return [message as ChatMessage]
  })
}

export function App() {
  const argv = process.argv
  let globalConfig = loadGlobalConfig()
  const config = resolveConfig(argv, globalConfig)
  const dimensions = useTerminalDimensions()
  const homeLogo = createMemo(() => dimensions().height >= 30 ? LOGO : LOGO_COMPACT)
  const directory = process.cwd()
  const backend = new NimblBackend(directory, { watch: true })
  const contextIndex = backend.contextIndex
  const [settings, setSettings] = createSignal<NimblSettings>(loadSettings(directory))
  const [learning, setLearning] = createSignal(loadLearning(directory))
  const projectCommands = loadProjectCommands(directory)
  const storeResult = loadSessionStore(directory)
  let recoveryNotice: string | undefined
  let recoveryFingerprint: string | undefined
  let store: SessionStore | undefined
  if (storeResult.status === "valid") store = storeResult.store
  if (storeResult.status === "invalid") {
    recoveryFingerprint = storeResult.fingerprint
    try {
      const backup = backupInvalidSessionStore(storeResult)
      recoveryNotice = `Invalid session data at ${storeResult.file} was preserved at ${backup}. Started a recovery session.`
    } catch (error) {
      throw new Error(`Session data at ${storeResult.file} is invalid and could not be backed up. NIMBL will not overwrite it. ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const requestedSessionID = flagValue(argv, "-s") || flagValue(argv, "--session")
  const continueRequested = argv.includes("-c") || argv.includes("--continue")
  const forkRequested = argv.includes("--fork")
  const persistedSessions = store?.sessions ?? []
  const resumeBase = requestedSessionID
    ? findSession(persistedSessions, requestedSessionID)
    : continueRequested
      ? latestSession(persistedSessions)
      : undefined
  const resumed = resumeBase && forkRequested ? forkSession(resumeBase, id()) : resumeBase
  // A bare invocation is a home/new-session flow. Persisted sessions remain
  // available to the session picker, but must never be resumed implicitly.
  const freshSession: StoredSession = { id: id(), title: "New session", messages: [], agent: "build", created: Date.now() }
  const initialSessions: StoredSession[] = resumed
    ? (forkRequested ? [resumed, ...persistedSessions] : persistedSessions)
    : [freshSession, ...persistedSessions]
  const initialActiveID = resumed?.id || freshSession.id
  const explicitProvider = flagValue(argv, "--provider")
  const explicitModel = flagValue(argv, "--model")
  const storedProvider = store?.provider && PROVIDERS.some((item) => item.id === store.provider) ? store.provider : undefined
  const initialProvider = explicitProvider ? config.provider : storedProvider || config.provider
  const storedModel = store?.model && store.provider === initialProvider ? store.model : undefined
  const initialModel = explicitModel ? config.model : storedModel || (initialProvider === config.provider ? config.model : defaultModelFor(initialProvider))
  let storeRevision = store?.revision ?? 0
  let archivedSessions = store?.archived ?? []
  let persistenceBlocked = false
  backend.adoptPersistedState(storeRevision, recoveryFingerprint)

  const [view, setView] = createSignal<"home" | "session">(resumed ? "session" : "home")
  const [sessions, setSessions] = createSignal(initialSessions)
  const [activeID, setActiveID] = createSignal(initialActiveID)
  const [draft, setDraft] = createSignal("")
  const [provider, setProvider] = createSignal(initialProvider)
  const [model, setModel] = createSignal(initialModel)
  const [providerKeys, setProviderKeys] = createSignal<Record<string, string>>(
    flagValue(argv, "--api-key") ? { [config.provider]: config.apiKey } : {},
  )
  const [favoriteModels, setFavoriteModels] = createSignal(globalConfig.favoriteModels ?? [])
  const [recentModels, setRecentModels] = createSignal(globalConfig.recentModels ?? [])
  const [discoveredModels, setDiscoveredModels] = createSignal<Record<string, string[]>>({})
  const [dialog, setDialog] = createSignal<DialogName>(null)
  const [detail, setDetail] = createSignal({ title: "", lines: [] as string[] })
  const [pendingProvider, setPendingProvider] = createSignal<{ provider: string; model: string }>()
  const [providerConnecting, setProviderConnecting] = createSignal(false)
  const [modelProviderFilter, setModelProviderFilter] = createSignal<string>()
  const [pendingDelete, setPendingDelete] = createSignal<string>()
  const [pendingRename, setPendingRename] = createSignal<string>()
  const [selectedMessageID, setSelectedMessageID] = createSignal<string>()
  const [selectedSnapshot, setSelectedSnapshot] = createSignal<FileSnapshot>()
  const [pendingWorktree, setPendingWorktree] = createSignal<string>()
  const [pendingWorktreePath, setPendingWorktreePath] = createSignal<string>()
  const [sidebarMode, setSidebarMode] = createSignal<"auto" | boolean>("auto")
  const [conceal, setConceal] = createSignal(true)
  const [thinkingMode, setThinkingMode] = createSignal<"show" | "hide">(globalConfig.thinkingMode ?? "hide")
  const [retryState, setRetryState] = createSignal<{ message: string; attempt: number; next: number }>()
  const [showTimestamps, setShowTimestamps] = createSignal(false)
  const [animationsEnabled, setAnimationsEnabled] = createSignal(true)
  const [catalogVersion, setCatalogVersion] = createSignal(0)
  const [runningSessionID, setRunningSessionID] = createSignal<string>()
  const [abortController, setAbortController] = createSignal<AbortController>()
  const [approvalQueue, setApprovalQueue] = createSignal<PendingApproval[]>([])
  const [questionQueue, setQuestionQueue] = createSignal<PendingQuestion[]>([])
  const [alwaysAllowed, setAlwaysAllowed] = createSignal(new Set<string>())
  const [toast, setToast] = createSignal<ToastState>()
  const [notifications, setNotifications] = createSignal(backend.notifications.list())
  const unsubscribeNotifications = backend.notifications.subscribe(() => setNotifications(backend.notifications.list()))
  const [exitArmedAt, setExitArmedAt] = createSignal<number>()

  let sessionPrompt: SessionPromptRef | undefined
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let focusTimer: ReturnType<typeof setTimeout> | undefined
  let exitTimer: ReturnType<typeof setTimeout> | undefined
  let focusGeneration = 0
  let providerConnectGeneration = 0
  let shuttingDown = false

  const active = createMemo(() => sessions().find((session) => session.id === activeID()) || sessions()[0]!)
  const sidebarVisible = createMemo(() => sidebarMode() === "auto" ? dimensions().width > 120 : sidebarMode() as boolean)
  const contentWidth = createMemo(() => Math.max(20, dimensions().width - (sidebarVisible() && dimensions().width > 120 ? 42 : 0) - 4))
  const activeMessage = createMemo(() => active().messages.find((message) => message.id === selectedMessageID()))
  const subagentNavigation = createMemo(() => {
    const session = active()
    if (!session.parentID) return undefined
    const parent = sessions().find((item) => item.id === session.parentID)
    const siblings = sessions().filter((item) => item.parentID === session.parentID).sort((left, right) => left.created - right.created)
    const index = Math.max(0, siblings.findIndex((item) => item.id === session.id))
    const usage = sessionUsage(session)
    const latest = lastRequestUsage(session)
    const usageText = latest?.inputContextTokens !== undefined && latest?.contextWindow
      ? `${formatTokens(usage.totalTokens)} (${Math.round((latest.inputContextTokens / latest.contextWindow) * 100)}%)`
      : usage.totalTokens > 0
        ? formatTokens(usage.totalTokens)
        : undefined
    const cost = usage.providerCostUsd > 0 ? `$${usage.providerCostUsd.toFixed(2)}` : undefined
    return {
      index: index + 1,
      total: siblings.length,
      parentTitle: parent?.title || "Parent",
      label: parent?.title ? parent.title.split(" ")[0] || "Subagent" : "Subagent",
      usage: [usageText, cost].filter(Boolean).join(" · ") || undefined,
      onParent: () => parent && setActiveID(parent.id),
      onPrevious: () => setActiveID(siblings[(index - 1 + siblings.length) % siblings.length]?.id || session.id),
      onNext: () => setActiveID(siblings[(index + 1) % siblings.length]?.id || session.id),
    }
  })
  const renameTarget = createMemo(() => sessions().find((session) => session.id === pendingRename()) ?? active())
  const deleteTarget = createMemo(() => sessions().find((session) => session.id === pendingDelete()) ?? active())
  const currentApproval = createMemo(() => approvalQueue()[0])
  const currentQuestion = createMemo(() => questionQueue()[0])
  const uiSession = createMemo<ChatSession>(() => ({
    ...active(),
    contextTokens: lastRequestUsage(active())?.inputContextTokens ?? lastRequestUsage(active())?.inputTokens ?? active().legacyUsage?.lastRequestTokens,
    contextWindow: lastRequestUsage(active())?.contextWindow ?? active().legacyUsage?.contextWindow,
    messages: visibleMessages(active()),
  }))
  const contextText = createMemo(() => {
    const session = active()
    const latest = lastRequestUsage(session)
    const tokens = latest?.inputContextTokens ?? latest?.inputTokens ?? session.legacyUsage?.lastRequestTokens
    if (!tokens) return undefined
    const window = latest?.contextWindow || session.legacyUsage?.contextWindow || runtimeContextWindow(provider(), model())
    const context = `${formatTokens(tokens)} (${Math.round((tokens / window) * 100)}%)`
    return latest?.providerCostUsd !== undefined ? `${context} · $${latest.providerCostUsd.toFixed(4)}` : context
  })

  const configuredCommands = createMemo(() => ({ ...settings().customCommands, ...projectCommands }))
  const frecencyData = loadFrecency(directory)
  const autocompleteFiles = rankFiles(projectFiles(directory), frecencyData)
  const availableCommands = createMemo<CommandOption[]>(() => [
    ...BASE_COMMANDS,
    ...Object.entries(configuredCommands()).map(([name, command]) => ({
      value: name,
      title: name,
      description: command.description,
      category: "Project commands",
      autocomplete: "insert" as const,
    })),
  ])
  const paletteOptions = createMemo<CommandOption[]>(() => availableCommands()
    .filter((command) => command.value !== "palette")
    .map((command) => ({
      ...command,
      title: command.value === "sidebar" ? `${sidebarVisible() ? "Hide" : "Show"} sidebar` : command.title,
      footer: command.value === "sessions"
        ? settings().keybinds.sessions
        : command.value === "agent"
          ? settings().keybinds.agent
          : undefined,
    })))
  const providerOptions = createMemo<CommandOption[]>(() => [...PROVIDERS]
    .sort((left, right) => {
      const leftPriority = PROVIDER_PRIORITY.get(left.id) ?? Number.MAX_SAFE_INTEGER
      const rightPriority = PROVIDER_PRIORITY.get(right.id) ?? Number.MAX_SAFE_INTEGER
      return leftPriority - rightPriority || left.name.localeCompare(right.name)
    })
    .map((item) => ({
      value: item.id,
      title: item.name,
      description: ({
        "opencode-zen": "(Recommended)",
        "opencode-go": "Low cost subscription for everyone",
        openai: "(API key)",
        anthropic: "(API key)",
        "github-models": "(GitHub token)",
      } as Record<string, string>)[item.id] || item.description,
      connected: Boolean(apiKey(item.id)),
      category: PROVIDER_PRIORITY.has(item.id) ? "Popular" : "Providers",
    })))
  const models = createMemo<CommandOption[]>(() => {
    catalogVersion()
    const items = modelOptions(modelProviderFilter(), discoveredModels())
    const favorites = new Set(favoriteModels())
    const recents = recentModels().filter((value) => !favorites.has(value))
    const byValue = new Map(items.map((item) => [item.value, item]))
    const decorate = (item: CommandOption, category = item.category) => ({
      ...item,
      category,
      current: item.value === `${provider()}::${model()}`,
      description: favorites.has(item.value) ? "(Favorite)" : item.description,
    })
    if (modelProviderFilter()) return items.map((item) => decorate(item))
    const favoriteOptions = favoriteModels().flatMap((value) => {
      const item = byValue.get(value)
      return item ? [decorate(item, "Favorites")] : []
    })
    const recentOptions = recents.flatMap((value) => {
      const item = byValue.get(value)
      return item ? [decorate(item, "Recent")] : []
    })
    const rest = items.filter((item) => !favorites.has(item.value) && !recents.includes(item.value)).map((item) => decorate(item))
    const anyConnected = [...PROVIDERS].some((item) => Boolean(apiKey(item.id)))
    const popularProviders = !anyConnected
      ? [...PROVIDERS]
          .sort((left, right) => {
            const leftPriority = PROVIDER_PRIORITY.get(left.id) ?? Number.MAX_SAFE_INTEGER
            const rightPriority = PROVIDER_PRIORITY.get(right.id) ?? Number.MAX_SAFE_INTEGER
            return leftPriority - rightPriority || left.name.localeCompare(right.name)
          })
          .slice(0, 6)
          .map((item) => ({
            value: `provider::${item.id}`,
            title: item.name,
            description: ({
              "opencode-zen": "(Recommended)",
              "opencode-go": "Low cost subscription for everyone",
            } as Record<string, string>)[item.id] || item.description,
            category: "Popular providers",
          }))
      : []
    return [...favoriteOptions, ...recentOptions, ...rest, ...popularProviders]
  })
  const sessionOptions = createMemo<CommandOption[]>(() => {
    const today = new Date().toDateString()
    const slots = sessions().slice(0, 9)
    return [...sessions()]
      .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || (right.updated || right.created) - (left.updated || left.created))
      .map((session) => {
        const date = new Date(session.updated || session.created).toDateString()
        const slotIndex = slots.findIndex((item) => item.id === session.id)
        const running = session.runState === "running" || session.runState === "queued"
        return {
          value: session.id,
          title: pendingDelete() === session.id ? "Press ctrl+d again to confirm" : session.title,
          category: session.pinned ? "Pinned" : date === today ? "Today" : date,
          current: session.id === activeID(),
          gutter: running ? "⠋" : slotIndex >= 0 ? String(slotIndex + 1) : undefined,
        }
      })
  })
  const timelineOptions = createMemo<CommandOption[]>(() => active().messages
    .filter((message) => message.role === "user")
    .slice()
    .reverse()
    .map((message) => ({
      value: message.id,
      title: message.text.replace(/\n/g, " "),
      footer: new Date(message.time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    })))
  const skillOptions = createMemo<CommandOption[]>(() => {
    const options = projectSkillOptions(directory)
    return options.length
      ? options
      : [{ value: "none", title: "No project skills found", description: "Add .nimbl/skills/<name>/SKILL.md to this workspace" }]
  })
  const agentMentions = createMemo<CommandOption[]>(() => AGENT_MODES.map((mode) => ({
    value: mode,
    title: modeLabel(mode),
    description: mode === "build" ? "Can make approved changes" : mode === "plan" ? "Read-only implementation planning" : mode === "explain" ? "Read-only code explanations" : "Socratic hints and practice",
  })))

  function apiKey(providerID: string) {
    return providerKeys()[providerID] || providerApiKey(providerID) || globalConfig.providerKeys?.[providerID] || localFallbackKey(providerID) || ""
  }

  function persistNow() {
    if (persistenceBlocked) return
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = undefined
    try {
      const saved = backend.save({
        version: 2,
        revision: storeRevision,
        activeID: activeID(),
        provider: provider(),
        model: model(),
        sessions: sessions(),
        archived: archivedSessions,
      })
      storeRevision = saved.revision
      recoveryFingerprint = undefined
      archivedSessions = saved.archived ?? []
      if (saved.sessions.length !== sessions().length) setSessions(saved.sessions)
    } catch (error) {
      if (error instanceof SessionStoreConflictError) {
        persistenceBlocked = true
        showToast(error.message + " Automatic saving is paused to protect both versions.", "error", "Session conflict")
        return
      }
      showToast(error instanceof Error ? error.message : String(error), "warning", "Session save delayed")
      if (error instanceof SessionStoreLockedError) persistTimer = setTimeout(persistNow, 1000)
    }
  }

  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(persistNow, 500)
  }

  function setSession(sessionID: string, mutate: (session: StoredSession) => StoredSession, persist = true) {
    setSessions((all) => all.map((session) => session.id === sessionID ? mutate(session) : session))
    if (persist) schedulePersist()
  }

  function addMessage(sessionID: string, message: StoredMessage) {
    setSession(sessionID, (session) => ({
      ...session,
      messages: [...session.messages, message],
      updated: Date.now(),
    }))
  }

  function updateMessage(sessionID: string, messageID: string, mutate: (message: StoredMessage) => StoredMessage, persist = true) {
    setSession(sessionID, (session) => ({
      ...session,
      messages: session.messages.map((message) => message.id === messageID ? mutate(message) : message),
      // Streaming deltas are intentionally not session metadata changes. This
      // keeps header/sidebar subscribers quiet while the active text updates.
      ...(persist ? { updated: Date.now() } : {}),
    }), persist)
  }

  function showToast(message: string, variant: ToastVariant = "info", title?: string) {
    setToast({ message, variant, title })
    backend.notifications.notify(
      variant === "error" ? "failure" : variant === "success" ? "completion" : "info",
      title || "NIMBL",
      message,
    )
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => setToast(undefined), 5000)
  }

  function focusPrompt() {
    if (focusTimer) clearTimeout(focusTimer)
    const generation = ++focusGeneration
    focusTimer = setTimeout(() => {
      focusTimer = undefined
      if (generation !== focusGeneration) return
      if (dialog()) return
      sessionPrompt?.focus()
    }, 1)
  }

  function closeDialog() {
    providerConnectGeneration++
    setProviderConnecting(false)
    setDialog(null)
    setPendingProvider(undefined)
    setModelProviderFilter(undefined)
    setPendingDelete(undefined)
    setPendingRename(undefined)
    setSelectedMessageID(undefined)
    setSelectedSnapshot(undefined)
    setPendingWorktree(undefined)
    setPendingWorktreePath(undefined)
    focusPrompt()
  }

  function resetExitArm() {
    setExitArmedAt(undefined)
    if (exitTimer) clearTimeout(exitTimer)
    exitTimer = undefined
  }

  function prepareShutdown() {
    abortController()?.abort()
    for (const pending of approvalQueue()) pending.resolve("reject")
    for (const pending of questionQueue()) pending.resolve("Interrupted by user")
    setApprovalQueue([])
    setQuestionQueue([])
    try {
      persistNow()
    } catch {
      // Terminal restoration must not depend on persistence succeeding.
    }
  }

  function shutdown(code = 0) {
    if (shuttingDown) return
    shuttingDown = true
    const epilogue = code === 0 && view() === "session" ? sessionEpilogue(active()) : undefined
    resetExitArm()
    prepareShutdown()
    try {
      renderer?.destroy()
    } finally {
      restoreCtrlCGuard?.()
      restoreCtrlCGuard = undefined
      win32FlushInputBuffer()
      if (epilogue) process.stdout.write(epilogue + "\n")
      process.exitCode = code
    }
  }

  function armOrExit() {
    const next = registerExitPress(exitArmedAt(), Date.now())
    if (next.exit) return shutdown()
    setExitArmedAt(next.armedAt)
    if (exitTimer) clearTimeout(exitTimer)
    const message = "Press Ctrl+C again to exit."
    exitTimer = setTimeout(() => {
      exitTimer = undefined
      setExitArmedAt(undefined)
      setToast((current) => current?.message === message ? undefined : current)
    }, EXIT_CONFIRM_WINDOW_MS)
    showToast(message, "warning")
  }

  function handleCtrlC(event?: any) {
    event?.preventDefault?.()
    event?.stopPropagation?.()
    if (event?.repeat) return

    const selection = renderer?.getSelection?.()?.getSelectedText?.()
    const action = ctrlCAction({
      selection: Boolean(selection),
      dialog: Boolean(dialog()),
      approval: Boolean(currentApproval()),
      question: Boolean(currentQuestion()),
      running: Boolean(runningSessionID()),
      draft: Boolean(draft()),
    })
    if (action !== "exit") resetExitArm()
    if (action === "copy") {
      renderer?.copyToClipboardOSC52?.(selection!)
      renderer?.clearSelection?.()
      showToast("Copied selection to clipboard.", "success")
    } else if (action === "close-dialog") closeDialog()
    else if (action === "reject-approval") answerApproval("reject")
    else if (action === "cancel-question") answerQuestion("Interrupted by user")
    else if (action === "abort-run") abortRun()
    else if (action === "clear-draft") setDraft("")
    else armOrExit()
  }

  function openDetail(title: string, lines: string[]) {
    setDetail({ title, lines })
    setDialog("detail")
  }

  function approvalKey(request: PermissionRequest) {
    return `${request.tool}\0${request.target || request.detail}`
  }

  function askApproval(sessionID: string, request: PermissionRequest) {
    if (alwaysAllowed().has(approvalKey(request))) return Promise.resolve<"always">("always")
    setActiveID(sessionID)
    setView("session")
    return new Promise<"once" | "always" | "reject">((resolve) => {
      setApprovalQueue((queue) => [...queue, { sessionID, request, resolve }])
    })
  }

  function answerApproval(choice: "once" | "always" | "reject") {
    const pending = currentApproval()
    if (!pending) return
    if (choice === "always") {
      setAlwaysAllowed((current) => new Set([...current, approvalKey(pending.request)]))
      const target = pending.request.target || pending.request.detail
      const existing = settings().permissions[pending.request.tool]
      const rule: Record<string, PermissionValue> = typeof existing === "object" ? { ...existing } : { "*": existing || "ask" }
      rule[target] = "allow"
      persistSettings({
        ...settings(),
        permissions: { ...settings().permissions, [pending.request.tool]: rule },
      })
    }
    setApprovalQueue((queue) => queue.slice(1))
    pending.resolve(choice)
  }

  function askQuestion(sessionID: string, question: { prompt: string; options: string[]; freeform?: boolean }) {
    setActiveID(sessionID)
    setView("session")
    return new Promise<string>((resolve) => {
      setQuestionQueue((queue) => [...queue, { sessionID, ...question, resolve }])
    })
  }

  function answerQuestion(answer: string) {
    const pending = currentQuestion()
    if (!pending) return
    setQuestionQueue((queue) => queue.slice(1))
    pending.resolve(answer)
  }

  function drainInteractions(sessionID: string) {
    const approvals = approvalQueue().filter((item) => item.sessionID === sessionID)
    const questions = questionQueue().filter((item) => item.sessionID === sessionID)
    setApprovalQueue((queue) => queue.filter((item) => item.sessionID !== sessionID))
    setQuestionQueue((queue) => queue.filter((item) => item.sessionID !== sessionID))
    for (const approval of approvals) approval.resolve("reject")
    for (const question of questions) question.resolve("Skipped by user")
  }

  function drainQueued(sessionID: string) {
    const session = sessions().find((item) => item.id === sessionID)
    if (!session?.queuedPrompts?.length) return
    const { session: next, prompt } = dequeuePrompt(session)
    setSession(sessionID, () => next)
    if (prompt) queueMicrotask(() => void send(prompt))
  }

  async function runPromptCommand(command: string, sessionID: string, mode: AgentMode, signal: AbortSignal) {
    if (mode !== "build") throw new Error(`${modeLabel(mode)} mode cannot run prompt commands. Switch to Build first.`)
    const policy = permissionFor(settings().permissions, { tool: "bash", target: command })
    if (policy === "deny") throw new Error("The prompt command is blocked by project policy.")
    if (policy === "ask") {
      const choice = await askApproval(sessionID, { id: id(), tool: "bash", title: "Run prompt command", detail: command, target: command })
      if (choice === "reject") throw new Error("The prompt command was rejected.")
    }
    const result = await runShellCommand(command, directory, { signal })
    return result.output + (result.code ? `\n(exit ${result.code})` : "")
  }

  function history(session: StoredSession): AgentMessage[] {
    const result: AgentMessage[] = []
    for (const message of session.messages) {
      if (message.role === "user") result.push({ role: "user", text: message.agentText || message.text })
      if (message.role === "assistant" && message.text) result.push({ role: "assistant", text: message.text })
    }
    return result
  }

  async function runSubagent(
    parentSessionID: string,
    request: { prompt: string; agent?: AgentMode },
    runtime: { provider: string; model: string; key: string; parentTaskID?: string; depth: number },
  ): Promise<string> {
    if (runtime.depth >= 3) throw new Error("Subagent delegation depth limit reached.")
    const parent = sessions().find((item) => item.id === parentSessionID)
    if (!parent) throw new Error("Parent session was not found.")
    const childID = id()
    const userID = id()
    const assistantID = id()
    const mode = request.agent ?? "plan"
    const child: StoredSession = {
      id: childID,
      title: preview(request.prompt),
      parentID: parentSessionID,
      agent: mode,
      created: Date.now(),
      updated: Date.now(),
      runState: "running",
      messages: [
        { id: userID, role: "user", text: request.prompt, agent: mode, time: Date.now() },
        { id: assistantID, role: "assistant", text: "", agent: mode, provider: runtime.provider, model: runtime.model, parts: [], time: Date.now() },
      ],
    }
    setSessions((all) => [child, ...all])
    schedulePersist()
    const task = backend.createTask({ sessionID: childID, parentTaskID: runtime.parentTaskID, kind: "subagent", budget: { maxTokens: Number.POSITIVE_INFINITY } })
    try {
      const result = await backend.runTask({
        taskID: task.id,
        taskKind: "subagent",
        root: directory,
        provider: runtime.provider,
        model: runtime.model,
        apiKey: runtime.key,
        mode,
        messages: [{ role: "user", text: request.prompt }],
        learning: learning(),
        contextWindow: runtimeContextWindow(runtime.provider, runtime.model),
        contextIndex,
        permissions: settings().permissions,
        settings: settings(),
        requestApproval: (approval) => askApproval(childID, approval),
        askQuestion: (question) => askQuestion(childID, question),
        delegateTask: (nested) => runSubagent(childID, nested, { ...runtime, parentTaskID: task.id, depth: runtime.depth + 1 }),
        onFileChange: (change) => setSession(childID, (value) => recordSnapshot(value, { ...change, time: Date.now(), messageID: userID })),
        onFileChanges: (changes) => setSession(childID, (value) => recordSnapshotGroup(value, changes, Date.now(), userID)),
        onEvent: (event) => updateMessage(childID, assistantID, (message) => reduceAssistantEvents(message, [event], id), false),
      })
      updateMessage(childID, assistantID, (message) => ({
        ...finishAssistant(message, Date.now()),
        text: message.text || result.text,
        usage: {
          ...result.usage,
          referenceCostUsd: estimateReferenceCost(result.usage.inputTokens, result.usage.outputTokens),
          contextWindow: runtimeContextWindow(runtime.provider, runtime.model),
          inputContextTokens: result.budget.inputTotal,
          attempts: result.attempts,
          latencyMs: result.latencyMs,
          finishReason: result.finishReason,
          rawFinishReason: result.rawFinishReason,
          budget: result.budget,
          retrieval: result.retrieval,
        },
      }))
      setSession(childID, (session) => ({ ...session, runState: "idle", unread: activeID() !== childID, updated: Date.now() }))
      return result.text
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      updateMessage(childID, assistantID, (assistant) => ({ ...finishAssistant(assistant, Date.now()), error: message }))
      setSession(childID, (session) => ({ ...session, runState: "failed", unread: activeID() !== childID, updated: Date.now() }))
      throw error
    }
  }

  async function send(raw: string) {
    const displayText = raw.trim()
    if (!displayText) return
    const mention = agentMention(displayText)
    if (runningSessionID()) {
      const policy = settings().prompt?.queue || "queue"
      if (policy === "reject") {
        showToast("Wait for the current run to finish or press Esc to interrupt it.", "warning")
        return
      }
      setSession(activeID(), (session) => policy === "replace"
        ? queuePrompt({ ...session, queuedPrompts: [] }, displayText)
        : queuePrompt(session, displayText))
      showToast(policy === "replace" ? "Replaced the queued prompt; it will run after the current turn." : "Prompt queued; it will run after the current turn.", "info")
      return
    }
    if (mention) {
      setView("session")
      setDraft("")
      setSession(activeID(), (current) => recordSessionDraft(current, displayText))
      const sessionID = activeID()
      const key = apiKey(provider())
      const definition = PROVIDERS.find((item) => item.id === provider())
      if (!definition?.local && !key) {
        setPendingProvider({ provider: provider(), model: model() })
        setDialog("connect")
        showToast(`Enter an API key for ${providerName(provider())} to run this delegated prompt.`, "info")
        return
      }
      const controller = new AbortController()
      setRunningSessionID(sessionID)
      setAbortController(controller)
      const user: StoredMessage = { id: id(), role: "user", text: displayText, agentText: mention.text, agent: mention.agent, time: Date.now() }
      const assistantID = id()
      const assistant: StoredMessage = { id: assistantID, role: "assistant", text: "", time: Date.now(), agent: mention.agent, provider: provider(), model: model(), parts: [] }
      setSession(sessionID, (current) => ({
        ...current,
        title: current.messages.length ? current.title : preview(mention.text),
        messages: [...current.messages, user, assistant],
        updated: Date.now(),
      }))
      try {
        const result = await runSubagent(sessionID, { prompt: mention.text, agent: mention.agent }, { provider: provider(), model: model(), key, depth: 0 })
        updateMessage(sessionID, assistantID, (message) => ({ ...finishAssistant(message, Date.now()), text: result }))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        updateMessage(sessionID, assistantID, (assistantMessage) => ({ ...finishAssistant(assistantMessage), error: message }))
        showToast(message, "error")
      } finally {
        drainInteractions(sessionID)
        setAbortController(undefined)
        setRunningSessionID(undefined)
        setRetryState(undefined)
        persistNow()
        focusPrompt()
        drainQueued(sessionID)
      }
      return
    }

    const selectedProvider = PROVIDERS.find((item) => item.id === provider())
    if (selectedProvider && !selectedProvider.local && !apiKey(selectedProvider.id)) {
      setPendingProvider({ provider: selectedProvider.id, model: model() })
      setDialog("connect")
      showToast(`Enter an API key for ${selectedProvider.name} to send this prompt.`, "info")
      return
    }

    const sessionID = activeID()
    const session = sessions().find((item) => item.id === sessionID)!
    const controller = new AbortController()
    let runProvider = provider()
    let runModel = model()
    const runAgentMode = session.agent
    let assistantID: string | undefined
    const runID = id()
    let flushTimer: ReturnType<typeof setTimeout> | undefined
    let eventQueue: AgentEvent[] = []

    setRunningSessionID(sessionID)
    setAbortController(controller)
    setView("session")
    setDraft("")
    setSession(sessionID, (current) => recordSessionDraft(current, displayText))

    function flushEvents() {
      if (flushTimer) clearTimeout(flushTimer)
      flushTimer = undefined
      if (!assistantID || !eventQueue.length) return
      const events = eventQueue
      eventQueue = []
      updateMessage(sessionID, assistantID, (message) => reduceAssistantEvents(message, events, id), false)
    }

    function queueEvent(event: AgentEvent) {
      eventQueue.push(event)
      if (!flushTimer) flushTimer = setTimeout(flushEvents, 32)
    }

    try {
      const prepared = await preparePromptContext({
        root: directory,
        text: displayText,
        runCommand: (command) => runPromptCommand(command, sessionID, runAgentMode, controller.signal),
      })
      if (controller.signal.aborted) throw new Error("Interrupted by user.")
      for (const attachment of prepared.attachments) recordFrecency(directory, attachment)

      const routed = routeProvider(prepared.text, settings())
      if (routed && (routed.local || apiKey(routed.id))) {
        const health = await checkProviderHealth(routed, apiKey(routed.id), { signal: controller.signal })
        if (health.status === "healthy") {
          runProvider = routed.id
          runModel = defaultModelFor(routed.id)
          setProvider(runProvider)
          setModel(runModel)
          showToast(`Routed this request to ${routed.name} (${health.latencyMs || 0}ms health check).`, "info")
        } else {
          showToast(`Skipped ${routed.name} routing: ${health.reason || health.status}.`, "warning")
        }
      }
      const key = apiKey(runProvider)
      const definition = PROVIDERS.find((item) => item.id === runProvider)
      if (!definition?.local && !key) throw new Error(`Connect ${providerName(runProvider)} before sending a prompt.`)
      const modelDefinition = resolveModel(runProvider, runModel, runtimeContextWindow(runProvider, runModel))
      const beforeCompaction = sessions().find((item) => item.id === sessionID)!
      if (beforeCompaction.messages.length > 8 && shouldCompactSession(beforeCompaction, modelDefinition)) {
        const concepts = Object.entries(learning().concepts).map(([name, value]) => `${name}: confidence ${value.confidence.toFixed(2)}, encounters ${value.encounters}`)
        setSession(sessionID, (value) => compactSession(value, { keep: 8, now: Date.now(), learningState: concepts }))
        showToast("Older turns were compacted automatically to fit the model context.", "info")
      }

      const user: StoredMessage = {
        id: id(),
        role: "user",
        text: displayText,
        agentText: prepared.text,
        attachments: prepared.attachments,
        agent: runAgentMode,
        time: Date.now(),
      }
      assistantID = id()
      const assistant: StoredMessage = {
        id: assistantID,
        role: "assistant",
        text: "",
        time: Date.now(),
        agent: runAgentMode,
        provider: runProvider,
        model: runModel,
        parts: [],
      }
      setSession(sessionID, (current) => ({
        ...current,
        title: current.messages.length ? current.title : preview(displayText),
        messages: [...current.messages, user, assistant],
        updated: Date.now(),
      }))

      const current = sessions().find((item) => item.id === sessionID)!
      const result = await backend.run({
        root: directory,
        provider: runProvider,
        model: runModel,
        apiKey: key,
        mode: runAgentMode,
        summary: sessionSummary(current),
        learning: learning(),
        contextWindow: runtimeContextWindow(runProvider, runModel),
        contextIndex,
        messages: history(current),
        abortSignal: controller.signal,
        permissions: settings().permissions,
        settings: settings(),
        requestApproval: (request) => askApproval(sessionID, request),
        askQuestion: (question) => askQuestion(sessionID, question),
        runID,
        delegateTask: (request) => runSubagent(sessionID, request, { provider: runProvider, model: runModel, key, parentTaskID: runID, depth: 0 }),
        onFileChange: (change) => setSession(sessionID, (value) => recordSnapshot(value, { ...change, time: Date.now(), messageID: user.id })),
        onFileChanges: (changes) => setSession(sessionID, (value) => recordSnapshotGroup(value, changes, Date.now(), user.id)),
        onRetry: ({ attempt, message }) => {
          setRetryState({ message, attempt, next: Date.now() + 500 * 2 ** (attempt - 1) })
          showToast(`Retrying request (${attempt}/3): ${message}`, "warning")
        },
        onEvent: queueEvent,
      })

      flushEvents()
      const completed = Date.now()
      const cost = estimateReferenceCost(result.usage.inputTokens, result.usage.outputTokens)
      const price = modelDefinition.free
        ? undefined
        : await catalogPrice(runProvider, runModel, modelDefinition)
      const providerCost = price ? estimateProviderCost(price, result.usage) : undefined
      updateMessage(sessionID, assistantID, (message) => ({
        ...finishAssistant(message, completed),
        usage: {
          ...result.usage,
          referenceCostUsd: cost,
          // OpenCode calculates the displayed cost from the model catalog's
          // input/output/cache rates. A model marked free has an explicit zero
          // price; its GPT-4o comparison is not the provider bill.
          providerCostUsd: modelDefinition.free ? 0 : providerCost?.usd,
          pricingEffectiveFrom: providerCost?.effectiveFrom,
          contextWindow: runtimeContextWindow(runProvider, runModel),
          inputContextTokens: result.budget.inputTotal,
          attempts: result.attempts,
          latencyMs: result.latencyMs,
          finishReason: result.finishReason,
          rawFinishReason: result.rawFinishReason,
          callId: result.callId,
          responseId: result.responseId,
          requestId: result.requestId,
          budget: result.budget,
          retrieval: result.retrieval,
        },
      }))
      const nextLearning = observeLearning(learning(), prepared.text, true)
      setLearning(nextLearning)
      saveLearning(directory, nextLearning)
    } catch (error) {
      flushEvents()
      const message = error instanceof Error ? error.message : String(error)
      if (assistantID) {
        updateMessage(sessionID, assistantID, (assistant) => ({
          ...finishAssistant(assistant),
          error: message,
        }))
      } else {
        addMessage(sessionID, { id: id(), role: "error", text: message, error: message, time: Date.now() })
      }
      showToast(message, controller.signal.aborted ? "warning" : "error")
    } finally {
      if (flushTimer) clearTimeout(flushTimer)
      drainInteractions(sessionID)
      setAbortController(undefined)
      setRunningSessionID(undefined)
      setRetryState(undefined)
      persistNow()
      focusPrompt()
      drainQueued(sessionID)
    }
  }

  function abortRun() {
    const controller = abortController()
    const sessionID = runningSessionID()
    if (!controller || !sessionID) return
    controller.abort()
    drainInteractions(sessionID)
  }

  function persistSettings(next: NimblSettings) {
    setSettings(next)
    saveSettings(directory, next)
  }

  function changeAgent(mode: AgentMode) {
    setSession(activeID(), (session) => ({ ...session, agent: mode, updated: Date.now() }))
    showToast(`${modeLabel(mode)} agent selected.`, "info")
  }

  function newSession() {
    const session: StoredSession = {
      id: id(),
      title: "New session",
      messages: [],
      agent: active().agent,
      created: Date.now(),
    }
    setSessions((all) => [session, ...all])
    setActiveID(session.id)
    setView("session")
    setDraft("")
    schedulePersist()
    closeDialog()
  }

  async function discoverAndOpenModels(providerID: string) {
    const definition = PROVIDERS.find((item) => item.id === providerID)
    if (!definition) return
    const key = apiKey(providerID)
    try {
      const health = await checkProviderHealth(definition, key)
      if (health.status !== "healthy") showToast(`${definition.name}: ${health.reason || health.status}. Catalog models remain available.`, "warning")
      const discovered = await backend.discoverModels(providerID, key)
      if (discovered.length) setDiscoveredModels((current) => ({ ...current, [providerID]: discovered }))
    } catch (error) {
      showToast(`Could not discover ${definition.name} models: ${error instanceof Error ? error.message : String(error)} Catalog models remain available.`, "warning")
    }
    setModelProviderFilter(providerID)
    setDialog("model")
  }

  function selectProvider(providerID: string) {
    const definition = PROVIDERS.find((item) => item.id === providerID)
    if (!definition) return
    const nextModel = defaultModelFor(providerID)
    if (!definition.local && !apiKey(providerID)) {
      setPendingProvider({ provider: providerID, model: nextModel })
      setDialog("connect")
      return
    }
    setProvider(providerID)
    setModel(nextModel)
    schedulePersist()
    showToast(`Using ${definition.name}.`, "success")
    void discoverAndOpenModels(providerID)
  }

  function selectModel(value: string) {
    if (value.startsWith("provider::")) {
      const providerID = value.slice("provider::".length)
      const definition = PROVIDERS.find((item) => item.id === providerID)
      if (!definition) return
      if (!definition.local && !apiKey(providerID)) {
        setPendingProvider({ provider: providerID, model: defaultModelFor(providerID) })
        setDialog("connect")
        return
      }
      setProvider(providerID)
      setModel(defaultModelFor(providerID))
      schedulePersist()
      closeDialog()
      void discoverAndOpenModels(providerID)
      return
    }
    const [providerID, modelID] = value.split("::")
    const definition = PROVIDERS.find((item) => item.id === providerID)
    if (!definition || !modelID) return
    if (!definition.local && !apiKey(providerID)) {
      setPendingProvider({ provider: providerID, model: modelID })
      setDialog("connect")
      return
    }
    setProvider(providerID)
    setModel(modelID)
    const nextRecents = [value, ...recentModels().filter((item) => item !== value)].slice(0, 10)
    setRecentModels(nextRecents)
    globalConfig = { ...globalConfig, provider: providerID, model: modelID, recentModels: nextRecents }
    let savedPreference = true
    try {
      saveGlobalConfig(globalConfig)
    } catch (error) {
      savedPreference = false
      showToast(`Selected the model for this run, but could not save the preference: ${error instanceof Error ? error.message : String(error)}`, "warning")
    }
    schedulePersist()
    closeDialog()
    if (savedPreference) showToast(`Using ${modelID} via ${definition.name}.`, "success")
  }

  function toggleFavoriteModel(value: string) {
    const next = favoriteModels().includes(value)
      ? favoriteModels().filter((item) => item !== value)
      : [value, ...favoriteModels()]
    setFavoriteModels(next)
    globalConfig = { ...globalConfig, favoriteModels: next }
    try {
      saveGlobalConfig(globalConfig)
      showToast(`${next.includes(value) ? "Added to" : "Removed from"} model favorites.`, "success")
    } catch (error) {
      showToast(`Could not save model favorites: ${error instanceof Error ? error.message : String(error)}`, "error")
    }
  }

  async function connectProvider(key: string) {
    const pending = pendingProvider()
    if (!pending || !key.trim()) return
    const apiKey = key.trim()
    const generation = ++providerConnectGeneration
    setProviderConnecting(true)
    try {
      const discovered = await backend.discoverModels(pending.provider, apiKey)
      if (generation !== providerConnectGeneration) return
      if (discovered.length) setDiscoveredModels((current) => ({ ...current, [pending.provider]: discovered }))
    } catch (error) {
      if (generation !== providerConnectGeneration) return
      setProviderConnecting(false)
      showToast(`Could not authenticate ${providerName(pending.provider)}: ${error instanceof Error ? error.message : String(error)}`, "error")
      return
    }
    setProviderKeys((keys) => ({ ...keys, [pending.provider]: apiKey }))
    globalConfig = {
      ...globalConfig,
      provider: pending.provider,
      model: pending.model,
      providerKeys: { ...globalConfig.providerKeys, [pending.provider]: apiKey },
    }
    try {
      saveGlobalConfig(globalConfig)
    } catch (error) {
      setProvider(pending.provider)
      setModel(pending.model)
      schedulePersist()
      setPendingProvider(undefined)
      setProviderConnecting(false)
      setModelProviderFilter(pending.provider)
      setDialog("model")
      showToast(`Connected for this run, but could not save the key: ${error instanceof Error ? error.message : String(error)}`, "warning")
      return
    }
    setProvider(pending.provider)
    setModel(pending.model)
    schedulePersist()
    setPendingProvider(undefined)
    setProviderConnecting(false)
    setModelProviderFilter(pending.provider)
    setDialog("model")
    showToast(`Connected ${providerName(pending.provider)} and saved it for future runs.`, "success")
  }

  function disconnectProvider(providerID: string) {
    const definition = PROVIDERS.find((item) => item.id === providerID)
    if (!definition || definition.local) return showToast("Local providers do not require a saved API key.", "info")
    if (process.env[definition.envKey]) return showToast(`${definition.name} is connected through ${definition.envKey}; remove that environment variable outside NIMBL.`, "warning")
    setProviderKeys((keys) => { const next = { ...keys }; delete next[providerID]; return next })
    const providerKeys = { ...(globalConfig.providerKeys || {}) }
    delete providerKeys[providerID]
    globalConfig = { ...globalConfig, providerKeys }
    try { saveGlobalConfig(globalConfig); showToast(`Disconnected ${definition.name}.`, "success") }
    catch (error) { showToast(error instanceof Error ? error.message : String(error), "error") }
  }

  function deleteSession(closeAfter = true) {
    const target = pendingDelete()
    if (!target) return
    const targetSession = sessions().find((session) => session.id === target)
    if (targetSession?.share) {
      showToast("Remove the hosted share with /unshare before deleting this session.", "warning")
      return
    }
    if (sessions().length === 1) {
      setPendingDelete(undefined)
      showToast("Keep at least one session.", "warning")
      return
    }
    const deletingActive = target === activeID()
    const next = deletingActive ? sessions().find((session) => session.id !== target) : undefined
    setSessions((all) => all.filter((session) => session.id !== target))
    if (next) setActiveID(next.id)
    setPendingDelete(undefined)
    schedulePersist()
    if (closeAfter) closeDialog()
  }

  function toggleSessionPin(sessionID: string) {
    setSession(sessionID, (session) => ({ ...session, pinned: !session.pinned, updated: Date.now() }))
  }

  function openSessionRename(sessionID: string) {
    setPendingRename(sessionID)
    setPendingDelete(undefined)
    setDialog("rename")
  }

  function copyMessage(message: StoredMessage) {
    const copied = renderer?.copyToClipboardOSC52?.(message.text)
    showToast(copied ? "Copied to clipboard." : "Select the text and copy it normally.", copied ? "success" : "warning")
    closeDialog()
  }

  function forkFromMessage(message: StoredMessage) {
    const index = active().messages.findIndex((item) => item.id === message.id)
    if (index < 0) return
    const base = { ...active(), messages: active().messages.slice(0, index + 1), snapshots: [], redoSnapshots: [] }
    const fork = forkSession(base, id())
    setSessions((all) => [fork, ...all])
    setActiveID(fork.id)
    setView("session")
    schedulePersist()
    closeDialog()
  }

  function trimToMessage(message: StoredMessage) {
    const index = active().messages.findIndex((item) => item.id === message.id)
    if (index < 0) return
    setSession(activeID(), (session) => ({
      ...session,
      messages: session.messages.slice(0, index + 1),
      updated: Date.now(),
    }))
    setDraft(message.role === "user" ? message.text : "")
    closeDialog()
  }

  function confirmMessageRevert(message: StoredMessage) {
    setSelectedMessageID(message.id)
    setDialog("revert-message")
  }

  function applyMessageRevert() {
    const message = activeMessage()
    if (!message) return closeDialog()
    try {
      const result = revertToMessage(directory, active(), message.id)
      setSession(activeID(), () => result.session)
      setDraft(result.session.draft || "")
      closeDialog()
      showToast(`Reverted ${result.reverted.length} tracked change${result.reverted.length === 1 ? "" : "s"} and restored the prompt.`, "success")
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), "error")
    }
  }

  function openMessageDiff(message: StoredMessage) {
    const snapshots = (active().snapshots || []).filter((snapshot) => snapshot.messageID === message.id || (!snapshot.messageID && snapshot.time >= message.time))
    if (!snapshots.length) return showToast("This message has no tracked file changes.", "info")
    setSelectedSnapshot({
      ...snapshots[0]!,
      path: snapshots.map((snapshot) => snapshot.path).join(", "),
      changes: snapshots.flatMap((snapshot) => snapshot.changes?.length ? snapshot.changes : [snapshot]),
    })
    setDialog("diff-view")
  }

  function exportSession(prefix = "nimbl-export") {
    exportSessionWithOptions(`${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.md`)
  }

  function exportSessionWithOptions(filename: string, options: { thinking?: boolean; toolDetails?: boolean; assistantMetadata?: boolean; openWithoutSaving?: boolean } = {}) {
    try {
      const parts = active().messages.filter((message) => !message.hidden && (message.role === "user" || message.role === "assistant" || message.role === "error"))
      const rows = parts.map((message) => {
        let body = message.text || message.error || ""
        if (message.role === "assistant" && message.parts?.length) {
          const rows: string[] = []
          for (const part of message.parts) {
            if (part.type === "text") rows.push(part.text)
            else if (part.type === "reasoning" && options.thinking) rows.push(`_Thinking:_\n\n${part.text}`)
            else if (part.type === "tool" && options.toolDetails) {
              rows.push(`**Tool: ${part.tool}**`)
              if (part.detail) rows.push(`**Input:**\n\n\`\`\`json\n${part.detail}\n\`\`\``)
              if (part.output) rows.push(`**Output:**\n\n\`\`\`\n${part.output}\n\`\`\``)
              if (part.state === "failed") rows.push(`**Error:**\n\n\`\`\`\n${part.detail || part.output || "failed"}\n\`\`\``)
            }
          }
          body = rows.filter(Boolean).join("\n\n")
        }
        const header = message.role === "assistant" && options.assistantMetadata
          ? `## Assistant (${titlecaseMode(message.agent || "build")} · ${message.model || "model"})`
          : `## ${message.role === "assistant" ? "Assistant" : titlecaseMode(message.role as AgentMode)}`
        return `${header}\n\n${body}`
      })
      const target = filename.endsWith(".md") ? filename : `${filename}.md`
      writeFileSync(target, `# ${active().title}\n\n${rows.join("\n\n")}\n`, "utf8")
      showToast(`Created ${target}.`, "success")
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), "error")
    }
  }

  function titlecaseMode(mode: string): string {
    return mode.charAt(0).toUpperCase() + mode.slice(1)
  }

  async function shareSession() {
    const serviceURL = settings().shareURL || process.env.NIMBL_SHARE_URL
    if (!serviceURL) return showToast("Hosted sharing needs NIMBL_SHARE_URL or settings.shareURL. No data was uploaded.", "warning")
    try {
      const store: SessionStore = { version: 2, revision: storeRevision, activeID: activeID(), provider: provider(), model: model(), sessions: sessions(), archived: archivedSessions }
      const share = await backend.share(store, serviceURL, activeID())
      setSessions(store.sessions)
      schedulePersist()
      renderer?.copyToClipboardOSC52?.(share.url)
      showToast(`Shared link copied: ${share.url}`, "success")
    } catch (error) { showToast(error instanceof Error ? error.message : String(error), "error") }
  }

  async function unshareSession() {
    const serviceURL = settings().shareURL || process.env.NIMBL_SHARE_URL
    if (!serviceURL) return showToast("Hosted sharing needs NIMBL_SHARE_URL or settings.shareURL.", "warning")
    try {
      const store: SessionStore = { version: 2, revision: storeRevision, activeID: activeID(), provider: provider(), model: model(), sessions: sessions(), archived: archivedSessions }
      const removed = await backend.unshare(store, serviceURL, activeID())
      setSessions(store.sessions)
      schedulePersist()
      showToast(removed ? "Hosted share removed." : "This session is not shared.", "success")
    } catch (error) { showToast(error instanceof Error ? error.message : String(error), "error") }
  }

  function createWorktree(branch: string) {
    const path = pendingWorktreePath()
    if (!path) return closeDialog()
    try {
      const worktree = backend.createWorktree({ path, branch: branch.trim() || undefined })
      setPendingWorktreePath(undefined)
      setDialog("worktrees")
      showToast(`Created worktree ${worktree.path}.`, "success")
    } catch (error) { showToast(error instanceof Error ? error.message : String(error), "error") }
  }

  function removeWorktree() {
    const path = pendingWorktree()
    if (!path) return closeDialog()
    try { backend.removeWorktree(path); setPendingWorktree(undefined); setDialog("worktrees"); showToast("Worktree removed.", "success") }
    catch (error) { showToast(error instanceof Error ? error.message : String(error), "error") }
  }

  function worktreeOptions(): CommandOption[] {
    try {
      return backend.worktrees().map((worktree) => ({
        value: worktree.path,
        title: worktree.path === directory ? "Current workspace" : worktree.branch || worktree.path.split(/[\\/]/).at(-1) || worktree.path,
        description: worktree.path === directory ? worktree.branch || "main worktree" : worktree.branch || "detached",
        current: worktree.path === directory,
        details: [worktree.path, worktree.head ? `HEAD ${worktree.head.slice(0, 12)}` : ""].filter(Boolean),
      }))
    } catch (error) {
      return [{ value: "none", title: "Worktrees unavailable", description: error instanceof Error ? error.message : String(error), disabled: false }]
    }
  }

  function execute(name: string, argument = "") {
    if (name === "resume" || name === "continue") name = "sessions"
    if (name === "new") return newSession()
    if (name === "sessions") return setDialog("sessions")
    if (name === "timeline") return setDialog("timeline")
    if (name === "rename") {
      if (argument.trim()) {
        setSession(activeID(), (session) => renameSession(session, argument))
        return
      }
      return openSessionRename(activeID())
    }
    if (name === "fork") {
      const fork = forkSession(active(), id())
      setSessions((all) => [fork, ...all])
      setActiveID(fork.id)
      setView("session")
      schedulePersist()
      return
    }
    if (name === "pin") return toggleSessionPin(activeID())
    if (name === "delete") {
      if (sessions().length === 1) return showToast("Keep at least one session.", "warning")
      setPendingDelete(activeID())
      return setDialog("delete")
    }
    if (name === "model") {
      setModelProviderFilter(undefined)
      return setDialog("model")
    }
    if (name === "provider") return setDialog("provider")
    if (name === "agent") return setDialog("agent")
    if (name === "palette") return setDialog("palette")
    if (name === "sidebar") return setSidebarMode(!sidebarVisible())
    if (name === "home") return setView("home")
    if (name === "compact") {
      const concepts = Object.entries(learning().concepts).map(([concept, value]) => `${concept}: confidence ${value.confidence.toFixed(2)}, encounters ${value.encounters}`)
      setSession(activeID(), (session) => compactSession(session, { learningState: concepts }))
      return showToast("Older turns archived into a structured summary.", "success")
    }
    if (name === "undo" || name === "redo") {
      try {
        const result = name === "undo" ? undoSnapshot(directory, active()) : redoSnapshot(directory, active())
        setSession(activeID(), () => result.session)
        showToast(result.snapshot ? `${name === "undo" ? "Undid" : "Redid"} ${result.snapshot.path}.` : `Nothing to ${name}.`, "info")
      } catch (error) {
        showToast(error instanceof Error ? error.message : String(error), "error")
      }
      return
    }
    if (name === "clear") return setSession(activeID(), (session) => ({ ...session, messages: [], summary: undefined, compaction: undefined, archivedMessages: undefined, legacyUsage: undefined, updated: Date.now() }))
    if (name === "context") {
      const latest = lastRequestUsage(active())
      const window = latest?.contextWindow || active().legacyUsage?.contextWindow || runtimeContextWindow(provider(), model())
      const estimate = countTextTokens([sessionSummary(active()), ...history(active()).map((message) => message.text)].filter(Boolean).join("\n"), resolveModel(provider(), model(), window))
      return openDetail("Context", [
        `Model window: ${formatTokens(window)}`,
        `Last input context: ${formatTokens(latest?.inputContextTokens ?? latest?.inputTokens ?? active().legacyUsage?.lastRequestTokens ?? 0)}`,
        `Session history: ${formatTokens(estimate.tokens)} (${estimate.quality})`,
        "",
        ...(latest?.budget ? [
          `System: ${formatTokens(latest.budget.systemInstructions)}`,
          `Tools: ${formatTokens(latest.budget.toolSchemas)}`,
          `History: ${formatTokens(latest.budget.history)}`,
          `Summary: ${formatTokens(latest.budget.summary)}`,
          `Attachments: ${formatTokens(latest.budget.attachments)}`,
          `Project instructions: ${formatTokens(latest.budget.projectInstructions)}`,
          `Retrieval: ${formatTokens(latest.budget.retrieval)}`,
          `Output reserve: ${formatTokens(latest.budget.outputReservation)}`,
          `Safety margin: ${formatTokens(latest.budget.safetyMargin)}`,
          `Tokenizer: ${latest.budget.tokenizer} (${latest.budget.quality})`,
          `Retrieval: ${latest.retrieval?.selectedFiles ?? 0}/${latest.retrieval?.matchedFiles ?? 0} files selected (${latest.retrieval?.cacheHit ? "cache hit" : "index query"})`,
          `Index: generation ${latest.retrieval?.indexGeneration ?? 0}, ${latest.retrieval?.indexedFiles ?? 0} files indexed, ${latest.retrieval?.ignoredFiles ?? 0} ignored`,
          `Graph: ${latest.retrieval?.graphExpandedFiles ?? 0} expanded files at hop ${latest.retrieval?.graphMaxHop ?? 0} over ${latest.retrieval?.graphEdges ?? 0} edges${latest.retrieval?.hybrid ? `, hybrid fused with ${latest.retrieval?.semanticCandidates ?? 0} semantic candidates` : ""}`,
        ] : ["No persisted request budget is available for this session yet."]),
      ])
    }
    if (name === "details" || name === "status") return openDetail("Session details", [
      `Provider: ${providerName(provider())}`,
      `Model: ${model()}`,
      `Agent: ${modeLabel(active().agent)}`,
      `Session: ${active().title}`,
      `Session ID: ${active().id}`,
      `Continue: nimbl -s ${active().id}`,
      `Prompts: ${active().messages.filter((message) => message.role === "user").length}`,
      `Tokens: ${formatTokens(sessionUsage(active()).totalTokens)}`,
      `Reference cost: $${sessionUsage(active()).referenceCostUsd.toFixed(4)}`,
      ...(sessionUsage(active()).providerCostKnown ? [`Estimated provider cost: $${sessionUsage(active()).providerCostUsd.toFixed(4)}`] : []),
    ])
    if (name === "stats") return openDetail("Usage", [
      `Tokens: ${formatTokens(sessionUsage(active()).totalTokens)}`,
      `Reference cost: $${sessionUsage(active()).referenceCostUsd.toFixed(4)}`,
      ...(sessionUsage(active()).providerCostKnown ? [`Estimated provider cost: $${sessionUsage(active()).providerCostUsd.toFixed(4)}`] : []),
    ])
    if (name === "debug") return openDetail("Debug console", [
      `View: ${view()}`,
      `Renderer: ${renderer ? "connected" : "test/headless"}`,
      `Running: ${runningSessionID() || "idle"}`,
      `Pending approvals: ${approvalQueue().length}`,
      `Pending questions: ${questionQueue().length}`,
      "Detailed runtime errors are written to nimbl-error.log.",
    ])
    if (name === "diff") return setDialog("diff")
    if (name === "subagents") return setDialog("subagents")
    if (name === "notifications") {
      const current = toast()
      const history = notifications().slice(-8).reverse()
      const unread = notifications().filter((item) => !item.read).length
      backend.notifications.markRead()
      return openDetail("Notifications", [
        `Current toast: ${current?.message || "none"}`,
        ...(current ? [`Severity: ${current.variant}${current.title ? ` · ${current.title}` : ""}`] : []),
        `Unread: ${unread}`,
        ...(history.length ? ["", ...history.map((item) => `${new Date(item.time).toLocaleTimeString()} · ${item.title}: ${item.body || ""}`)] : []),
        "Permission and question prompts stay focused until answered.",
        "Attention sounds remain terminal-dependent.",
      ])
    }
    if (name === "help") return setDialog("help")
    if (name === "keybinds") return openDetail("Keybindings", Object.entries(settings().keybinds).map(([action, key]) => `${action}: ${key}`))
    if (name === "theme") return setDialog("theme")
    if (name === "thinking") {
      const next = thinkingMode() === "hide" ? "show" as const : "hide" as const
      setThinkingMode(next)
      globalConfig = { ...globalConfig, thinkingMode: next }
      try {
        saveGlobalConfig(globalConfig)
      } catch { /* Preference persistence is best-effort. */ }
      return showToast(`Thinking ${next === "hide" ? "collapsed" : "expanded"}.`, "info")
    }
    if (name === "conceal") {
      setConceal((value) => !value)
      return showToast(`Code concealment ${conceal() ? "enabled" : "disabled"}.`, "info")
    }
    if (name === "timestamps") {
      setShowTimestamps((value) => !value)
      return showToast(`Message timestamps ${showTimestamps() ? "shown" : "hidden"}.`, "info")
    }
    if (name === "animations") {
      setAnimationsEnabled((value) => !value)
      return showToast(`Animations ${animationsEnabled() ? "enabled" : "disabled"}.`, "info")
    }
    if (name === "skills") return setDialog("skills")
    if (name === "settings") return openDetail("Settings", [
      `Custom commands: ${Object.keys(settings().customCommands).length}`,
      `Edit permission: ${String(settings().permissions.edit || settings().permissions["*"])}`,
      `Shell permission: ${String(settings().permissions.bash || settings().permissions["*"])}`,
    ])
    if (name === "route") {
      const route = argument.trim() as "local" | "fast" | "budget"
      if (!(["local", "fast", "budget"] as const).includes(route)) return showToast("Usage: /route local|fast|budget", "warning")
      persistSettings({
        ...settings(),
        providerRouting: {
          preferLocal: route === "local",
          preferFast: route === "fast",
          preferLowCost: route === "budget",
        },
      })
      return showToast(`Provider routing now prefers ${route}.`, "success")
    }
    if (name === "init") {
      try {
        const file = join(directory, "NIMBL.md")
        if (existsSync(file)) return showToast("NIMBL.md already exists.", "warning")
        writeFileSync(file, "# NIMBL project instructions\n\n## Goals\n- Prefer small, explainable changes.\n- Keep context focused and token-efficient.\n\n## Verification\n- Run the relevant tests before handoff.\n", "utf8")
        return showToast("Created NIMBL.md.", "success")
      } catch (error) {
        return showToast(error instanceof Error ? error.message : String(error), "error")
      }
    }
    if (name === "export") return exportSession()
    if (name === "export-options") return setDialog("export-options")
    if (name === "share") {
      void shareSession()
      return
    }
    if (name === "unshare") {
      void unshareSession()
      return
    }
    if (name === "workspace" || name === "worktrees") return setDialog("worktrees")
    if (name === "stash") {
      const value = argument.trim() || draft().trim()
      if (!value) return setDialog("stash")
      setSession(activeID(), (session) => stashDraft({ ...session, draft: value }, value))
      setDraft("")
      return showToast("Prompt saved to the session stash.", "success")
    }
    if (name === "stashes") return setDialog("stash")
    if (name === "pop") {
      const before = active().stashes?.length || 0
      if (!before) return showToast("The session stash is empty.", "warning")
      let restored = ""
      setSession(activeID(), (session) => {
        const next = popDraft(session)
        restored = next.draft || ""
        return next
      })
      setDraft(restored)
      return showToast("Restored the latest stashed prompt.", "success")
    }
    if (name === "editor") {
      void (async () => {
        try {
          const target = argument.trim() || draft().trim()
          renderer?.suspend()
          try {
            const result = await editTextWithEditor(target, { editor: settings().prompt?.editor, cwd: directory, label: "prompt" })
            if (result.changed && result.value !== undefined) {
              setDraft(result.value)
              setSession(activeID(), (session) => recordSessionDraft(session, result.value!))
              showToast("Draft updated from the external editor.", "success")
            } else {
              showToast("No changes from the external editor.", "info")
            }
          } finally {
            renderer?.resume()
            sessionPrompt?.focus()
          }
        } catch (error) {
          renderer?.resume()
          sessionPrompt?.focus()
          showToast(error instanceof Error ? error.message : String(error), "error")
        }
      })()
      return
    }
    if (name === "retry") {
      const latest = active().messages.findLast((message) => message.role === "user")
      if (!latest) return showToast("There is no previous prompt to retry.", "warning")
      return void send(latest.agentText || latest.text)
    }
    if (name === "quit") {
      return shutdown()
    }

    const custom = configuredCommands()[name]
    if (custom) {
      if (custom.agent) changeAgent(custom.agent)
      const customModel = "model" in custom ? custom.model : undefined
      if (customModel) setModel(customModel)
      void send(expandCommand(custom, argument))
      return
    }
  }

  function submitLine(value: string) {
    const text = value.trim()
    if (!text) return
    if (text.startsWith("/")) {
      const command = commandLine(text)
      if (["resume", "continue", "worktrees"].includes(command.name) || availableCommands().some((item) => item.value === command.name)) {
        setDraft("")
        execute(command.name, command.argument)
        return
      }
    }
    void send(text)
  }

  function openMessageActions(messageID: string) {
    if (renderer?.getSelection?.()?.getSelectedText?.()) return
    setSelectedMessageID(messageID)
    setDialog("message")
  }

  useKeyboard((event: any) => {
    const name = String(event.name || event.key || "").toLowerCase()
    if (event.ctrl && name === "c") return handleCtrlC(event)
    if (exitArmedAt()) resetExitArm()
    if ((name === "escape" || name === "esc") && renderer?.getSelection?.()?.getSelectedText?.()) {
      event.preventDefault?.()
      event.stopPropagation?.()
      renderer.clearSelection()
      return
    }
    if (currentApproval() || currentQuestion()) return
    if (dialog()) return
    if (matchesKeybind(event, settings().keybinds.palette)) {
      event.preventDefault?.()
      event.stopPropagation?.()
      setDialog("palette")
      return
    }
    if (matchesKeybind(event, settings().keybinds.sessions)) {
      event.preventDefault?.()
      event.stopPropagation?.()
      setDialog("sessions")
      return
    }
    if (matchesKeybind(event, settings().keybinds.agent)) {
      event.preventDefault?.()
      event.stopPropagation?.()
      changeAgent(nextAgentMode(active().agent))
      return
    }
    if (event.ctrl && name === "m") {
      const latest = active().messages.findLast((message) => message.role === "user")
      if (latest) openMessageActions(latest.id)
    }
    if (event.ctrl && /^[1-9]$/.test(name)) {
      const target = sessions().slice(0, 9)[Number(name) - 1]
      if (target) {
        event.preventDefault?.()
        event.stopPropagation?.()
        setActiveID(target.id)
        setView("session")
      }
    }
    if (matchesKeybind(event, settings().keybinds.new)) return void execute("new")
    if (matchesKeybind(event, settings().keybinds.timeline)) return void execute("timeline")
    if (matchesKeybind(event, settings().keybinds.rename)) return void execute("rename")
    if (matchesKeybind(event, settings().keybinds.delete)) return void execute("delete")
    if (matchesKeybind(event, settings().keybinds.pin)) return void execute("pin")
    if (matchesKeybind(event, settings().keybinds.sidebar)) return void execute("sidebar")
    if (matchesKeybind(event, settings().keybinds.model)) return void execute("model")
    if (matchesKeybind(event, settings().keybinds.status)) return void execute("status")
    if (matchesKeybind(event, settings().keybinds.theme)) return void execute("theme")
    if (matchesKeybind(event, settings().keybinds.undo)) return void execute("undo")
    if (matchesKeybind(event, settings().keybinds.redo)) return void execute("redo")
    if (matchesKeybind(event, settings().keybinds.export)) return void execute("export")
    if (matchesKeybind(event, settings().keybinds.conceal)) return void execute("conceal")
    if (matchesKeybind(event, settings().keybinds.timestamps)) return void execute("timestamps")
  })

  createEffect(() => {
    const open = dialog()
    view()
    const generation = ++focusGeneration
    queueMicrotask(() => {
      if (generation !== focusGeneration || open !== dialog()) return
      if (sessionPrompt) open ? sessionPrompt.blur() : sessionPrompt.focus()
    })
  })

  createEffect(() => {
    const title = view() === "session" ? active().title : ""
    renderer?.setTerminalTitle(title ? `NIMBL | ${title.slice(0, 40)}` : "NIMBL")
  })

  createEffect(() => {
    enableAnimations(animationsEnabled())
  })

  onMount(() => {
    schedulePersist()
    void warmCatalog().then(() => setCatalogVersion((value) => value + 1))
    if (recoveryNotice) {
      showToast(recoveryNotice, "error", "Session recovery")
    } else if (requestedSessionID && !resumed) {
      showToast(`Session '${requestedSessionID}' was not found. Started a new session instead.`, "warning")
    } else if (continueRequested && !resumed) {
      showToast("No previous session was found. Started a new session instead.", "warning")
    } else if (forkRequested && !requestedSessionID && !continueRequested) {
      showToast("--fork requires --continue or --session.", "warning")
    }
  })

  onCleanup(() => {
    backend.close()
    unsubscribeNotifications()
    if (persistTimer) clearTimeout(persistTimer)
    if (toastTimer) clearTimeout(toastTimer)
    if (focusTimer) clearTimeout(focusTimer)
    if (exitTimer) clearTimeout(exitTimer)
    if (!shuttingDown) prepareShutdown()
  })

  const dialogSize = createMemo(() => dialog() === "diff-view" ? "xlarge" as const : ["sessions", "timeline", "worktrees"].includes(dialog() || "") ? "large" as const : "medium" as const)

  return (
    <Show
      when={dimensions().width >= 60 && dimensions().height >= 18}
      fallback={
        <box width={dimensions().width} height={dimensions().height} alignItems="center" justifyContent="center" backgroundColor={theme.background}>
          <box>
            <text fg={theme.text}><b>NIMBL needs more terminal space</b></text>
            <text fg={theme.textMuted}>Resize to at least 60 columns × 18 rows.</text>
          </box>
        </box>
      }
    >
      <box
        width={dimensions().width}
        height={dimensions().height}
        flexDirection="column"
        backgroundColor={theme.background}
        onMouseUp={() => {
          const selection = renderer?.getSelection?.()?.getSelectedText?.()
          if (!selection) return
          if (renderer?.copyToClipboardOSC52?.(selection)) {
            renderer?.clearSelection?.()
            showToast("Copied to clipboard", "info")
          }
        }}
      >
        <Show when={view() === "session"}>
          <SessionScreen
            session={uiSession()}
            providerLabel={providerName(provider())}
            model={modelName(provider(), model())}
            cwd={directory}
            loading={Boolean(runningSessionID())}
            promptValue={draft()}
            onPromptInput={setDraft}
            onPromptSubmit={(value) => void send(value)}
            onPromptQuit={shutdown}
            onHistory={(direction) => {
              const session = active()
              const next = navigateDraft(session, direction)
              setSession(activeID(), () => next)
              setDraft(next.draft || "")
              sessionPrompt?.focus()
            }}
            onAbort={abortRun}
            commands={availableCommands()}
            agents={agentMentions()}
            files={autocompleteFiles}
            onCommand={submitLine}
            onMessageAction={openMessageActions}
            focusMessageID={selectedMessageID()}
            sidebarVisible={sidebarVisible()}
            onCloseSidebar={() => setSidebarMode(false)}
            contextText={contextText()}
            cost={sessionUsage(active()).providerCostKnown ? sessionUsage(active()).providerCostUsd : undefined}
            contentWidth={contentWidth()}
            keyboardDisabled={dialog() !== null}
            pendingApproval={currentApproval() ? {
              title: currentApproval()!.request.title,
              detail: currentApproval()!.request.detail,
              diff: currentApproval()!.request.diff,
              tool: currentApproval()!.request.tool,
            } : undefined}
            onApproval={answerApproval}
            onRejectWithMessage={(message) => showToast(`Rejected with note: ${message.slice(0, 80)}`, "warning")}
            pendingQuestion={currentQuestion() ? {
              prompt: currentQuestion()!.prompt,
              options: currentQuestion()!.options,
              freeform: currentQuestion()!.freeform,
            } : undefined}
            onQuestion={answerQuestion}
            promptRef={(value) => { sessionPrompt = value }}
            subagentNavigation={subagentNavigation()}
            onSubagentClick={() => setDialog("subagents")}
            conceal={conceal()}
            thinkingMode={thinkingMode()}
            showTimestamps={showTimestamps()}
            queued={active().runState === "queued"}
            hasCompaction={Boolean(active().compaction)}
            retry={retryState() ? { message: retryState()!.message, attempt: retryState()!.attempt, next: retryState()!.next } : undefined}
            onRetryClick={() => retryState() && openDetail("Retry Error", [retryState()!.message])}
          />
        </Show>

        <Show when={view() === "home"}>
          <box width="100%" height="100%" flexDirection="column">
            <box flexGrow={1} minHeight={0} alignItems="center" paddingLeft={2} paddingRight={2}>
              <box flexGrow={1} minHeight={0} />
              <box height={4} minHeight={0} flexShrink={1} />
              <box flexShrink={0} flexDirection="column">
                <For each={homeLogo()}>{(line) => <text fg={theme.brand}>{line}</text>}</For>
              </box>
              <box height={1} minHeight={0} flexShrink={1} />
              <box><text fg={theme.text}>Token-efficient AI coding companion</text></box>
              <box><text fg={theme.textMuted}>Learn more. Use fewer tokens.</text></box>
              <box height={1} minHeight={0} flexShrink={1} />
              <box width="100%" maxWidth={75} zIndex={1000} paddingTop={1} flexShrink={0}>
                <SessionPrompt
                  value={draft()}
                  onInput={setDraft}
                  onSubmit={(value) => void send(value)}
                  onAbort={abortRun}
                  onCommand={submitLine}
                  onQuit={shutdown}
                  commands={availableCommands()}
                  agents={agentMentions()}
                  files={autocompleteFiles}
                  agent={active().agent}
                  provider={providerName(provider())}
                  model={modelName(provider(), model())}
                  cwd={directory}
                  status={runningSessionID() ? "busy" : "idle"}
                  showCwd={false}
                  ref={(value) => { sessionPrompt = value }}
                />
              </box>
              <box flexGrow={1} minHeight={0} />
            </box>
            <box width="100%" paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2} flexDirection="row" flexShrink={0} gap={2}>
              <box flexGrow={1} minWidth={0} overflow="hidden">
                <text fg={theme.textMuted} wrapMode="none">{directory}</text>
              </box>
              <text flexShrink={0} fg={theme.brand}>NIMBL</text>
            </box>
          </box>
        </Show>

        <Toast toast={toast()} />

        <DialogOverlay open={dialog() !== null} size={dialogSize()} onClose={closeDialog}>
          <Show when={dialog() === "palette"}>
            <SelectDialog
              title="Commands"
              options={paletteOptions()}
              flat
              showSuggested
              onSelect={(value) => { closeDialog(); queueMicrotask(() => execute(value)) }}
              onClose={closeDialog}
            />
          </Show>
          <Show when={dialog() === "model"}>
            <SelectDialog
              title={modelProviderFilter() ? providerName(modelProviderFilter()!) : "Select model"}
              options={models()}
              flat
              onSelect={selectModel}
              actions={[
                { key: "ctrl+a", title: "connect provider", onTrigger: () => setDialog("provider") },
                { key: "ctrl+f", title: "favorite", onTrigger: (value) => toggleFavoriteModel(value) },
              ]}
              onClose={closeDialog}
            />
          </Show>
          <Show when={dialog() === "provider"}>
            <SelectDialog
              title="Connect a provider"
              options={providerOptions()}
              onSelect={selectProvider}
              actions={[
                { key: "ctrl+r", title: "reconnect", onTrigger: (value) => { setPendingProvider({ provider: value, model: defaultModelFor(value) }); setDialog("connect") } },
                { key: "ctrl+d", title: "disconnect", onTrigger: disconnectProvider },
              ]}
              onClose={closeDialog}
            />
          </Show>
          <Show when={dialog() === "agent"}>
            <SelectDialog
              title="Select agent"
              options={AGENT_MODES.map((mode) => ({
                value: mode,
                title: modeLabel(mode),
                description: mode === "build" ? "Can make approved changes" : mode === "plan" ? "Read-only implementation planning" : mode === "explain" ? "Read-only code explanations" : "Socratic hints and practice",
                current: active().agent === mode,
              }))}
              onSelect={(value) => { changeAgent(value as AgentMode); closeDialog() }}
              onClose={closeDialog}
            />
          </Show>
          <Show when={dialog() === "sessions"}>
            <SelectDialog
              title="Sessions"
              options={sessionOptions()}
              preserveSelection
              onMove={(value) => setPendingDelete((current) => current === value ? current : undefined)}
              onSelect={(value) => { setActiveID(value); setView("session"); schedulePersist(); closeDialog() }}
              actions={[
                { key: "ctrl+f", title: "pin/unpin", onTrigger: (value) => toggleSessionPin(value) },
                {
                  key: "ctrl+d",
                  title: "delete",
                  onTrigger: (value) => {
                    if (pendingDelete() === value) deleteSession(false)
                    else setPendingDelete(value)
                  },
                },
                { key: "ctrl+r", title: "rename", onTrigger: (value) => openSessionRename(value) },
              ]}
              onClose={closeDialog}
            />
          </Show>
          <Show when={dialog() === "timeline"}>
            <SelectDialog
              title="Timeline"
              options={timelineOptions()}
              onMove={(value) => setSelectedMessageID(value)}
              onSelect={(value) => { setSelectedMessageID(value); setDialog("message") }}
              onClose={closeDialog}
            />
          </Show>
          <Show when={dialog() === "message" && activeMessage()}>
            <SelectDialog
              title="Message Actions"
              options={[
                { value: "revert", title: "Revert", description: "restore files and prompt to this message" },
                { value: "changes", title: "View changes", description: "open the native diff viewer" },
                { value: "trim", title: "Trim conversation", description: "remove messages after this point; files are unchanged" },
                { value: "copy", title: "Copy", description: "message text to clipboard" },
                { value: "fork", title: "Fork", description: "create a new session" },
                { value: "resend", title: "Edit and resend", description: "restore this prompt" },
              ]}
              onSelect={(value) => {
                const message = activeMessage()!
                if (value === "resend") { setDraft(message.text); closeDialog(); return }
                if (value === "copy") return copyMessage(message)
                if (value === "fork") return forkFromMessage(message)
                if (value === "trim") return trimToMessage(message)
                if (value === "revert") return confirmMessageRevert(message)
                if (value === "changes") return openMessageDiff(message)
              }}
              onClose={closeDialog}
            />
          </Show>
          <Show when={dialog() === "revert-message" && activeMessage()}>
            <ConfirmDialog
              title="Revert message"
              message="Restore tracked files to before this prompt, remove this turn and every later turn, and place the prompt back in the composer?"
              confirmLabel="Revert"
              onConfirm={applyMessageRevert}
              onClose={closeDialog}
            />
          </Show>
          <Show when={dialog() === "theme"}>
            <SelectDialog
              title="Select theme"
              options={["nimbl", "opencode", "mono"].map((value) => ({
                value,
                title: value,
                description: value === settings().theme ? "active" : "semantic color theme",
                current: value === settings().theme,
              }))}
              onSelect={(value) => { persistSettings({ ...settings(), theme: value as NimblSettings["theme"] }); closeDialog(); showToast(`Theme set to ${value}. Restart NIMBL to apply it.`, "success") }}
              onClose={closeDialog}
            />
          </Show>
          <Show when={dialog() === "help"}>
            <HelpDialog commandShortcut="ctrl+p" onClose={closeDialog} />
          </Show>
          <Show when={dialog() === "stash"}>
            <StashDialog
              entries={active().stashes ?? []}
              onSelect={(entry) => {
                setSession(activeID(), (session) => popDraft(session))
                setDraft(entry.text)
                showToast("Restored the stashed prompt.", "success")
              }}
              onDelete={(entryID) => {
                setSession(activeID(), (session) => ({ ...session, stashes: (session.stashes || []).filter((item) => item.id !== entryID), updated: Date.now() }))
              }}
              onClose={closeDialog}
            />
          </Show>
          <Show when={dialog() === "skills"}>
            <SelectDialog
              title="Skills"
              options={skillOptions()}
              onSelect={(value, option) => {
                if (value === "none") return closeDialog()
                closeDialog()
                queueMicrotask(() => openDetail(`Skill · ${option.title}`, [
                  ...(option.description && option.description !== "project" ? [`Description: ${option.description}`] : []),
                  `Path: ${option.details?.[0] || ".nimbl/skills/" + option.title + "/SKILL.md"}`,
                  "Skills are loaded by the agent when a task matches their description.",
                ]))
              }}
              onClose={closeDialog}
            />
          </Show>
          <Show when={dialog() === "subagents"}>
            <SelectDialog
              title="Subagents"
              options={(() => {
                const children = sessions().filter((session) => session.parentID === activeID())
                return children.length
                  ? children.map((session) => {
                    const task = backend.listTasks(session.id)[0]
                    return { value: session.id, title: session.title, description: `${session.agent} · ${task?.status || session.runState || "idle"}`, footer: task ? `${formatTokens(task.usedTokens)}/${task.budget.maxTokens === Number.POSITIVE_INFINITY ? "∞" : formatTokens(task.budget.maxTokens)}` : undefined, details: [`${session.messages.length} messages`] }
                  })
                  : [{ value: "none", title: "No child sessions", description: "Delegated agents will appear here when created." }]
              })()}
              onSelect={(value) => {
                if (value === "none") return closeDialog()
                setActiveID(value); setView("session"); closeDialog()
              }}
              actions={[{ key: "ctrl+c", title: "cancel", onTrigger: (value) => { const task = backend.listTasks(value).find((item) => item.status === "running" || item.status === "queued"); if (task) { backend.cancelTask(task.id); setSession(value, (session) => ({ ...session, runState: "interrupted", updated: Date.now() })); showToast("Child agent cancelled.", "success") } } }]}
              onClose={closeDialog}
            />
          </Show>
          <Show when={dialog() === "diff"}>
            <SelectDialog
              title="Tracked changes"
              options={(active().snapshots ?? []).length
                ? (active().snapshots ?? []).map((snapshot) => ({ value: snapshot.path, title: snapshot.path, description: new Date(snapshot.time).toLocaleTimeString(), details: ["Undo/redo snapshot"] }))
                : [{ value: "none", title: "No tracked file changes", description: "Approved edits create snapshots." }]}
              onSelect={(value) => {
                const snapshot = active().snapshots?.find((item) => item.path === value)
                if (!snapshot) return closeDialog()
                setSelectedSnapshot(snapshot)
                setDialog("diff-view")
              }}
              onClose={closeDialog}
            />
          </Show>
          <Show when={dialog() === "diff-view" && selectedSnapshot()}>
            <DiffDialog title={`Diff · ${selectedSnapshot()!.path}`} diff={snapshotUnifiedDiff(selectedSnapshot()!)} onClose={closeDialog} />
          </Show>
          <Show when={dialog() === "export-options"}>
            <ExportOptionsDialog
              value={`session-${active().id.slice(0, 8)}.md`}
              options={{ thinking: false, toolDetails: true, assistantMetadata: true, openWithoutSaving: false }}
              onConfirm={(filename, options) => {
                closeDialog()
                try {
                  exportSessionWithOptions(filename, options)
                } catch (error) {
                  showToast(error instanceof Error ? error.message : String(error), "error")
                }
              }}
              onClose={closeDialog}
            />
          </Show>
          <Show when={dialog() === "worktrees"}>
            <SelectDialog
              title="Worktrees"
              options={worktreeOptions()}
              preserveSelection
              onSelect={(value, option) => {
                if (value === "none") return
                closeDialog()
                queueMicrotask(() => openDetail(`Worktree · ${option.title}`, [option.details?.[0] || value, option.details?.[1] || "", "", `Open: cd \"${value}\"; nimbl`].filter(Boolean)))
              }}
              actions={[
                { key: "ctrl+n", title: "create", onTrigger: () => setDialog("worktree-create") },
                { key: "ctrl+d", title: "remove", onTrigger: (value) => { if (value === directory || value === "none") return showToast("The main workspace cannot be removed.", "warning"); setPendingWorktree(value); setDialog("worktree-remove") } },
                { key: "ctrl+p", title: "prune", onTrigger: () => { try { backend.pruneWorktrees(); showToast("Pruned stale worktree metadata.", "success") } catch (error) { showToast(error instanceof Error ? error.message : String(error), "error") } } },
              ]}
              onClose={closeDialog}
            />
          </Show>
          <Show when={dialog() === "worktree-create"}>
            <TextPromptDialog
              title="Create worktree"
              description={<text fg={theme.textMuted}>Enter a destination outside the current workspace.</text>}
              placeholder="../nimbl-feature"
              onConfirm={(value) => { if (!value.trim()) return; setPendingWorktreePath(value.trim()); setDialog("worktree-branch") }}
              onClose={closeDialog}
            />
          </Show>
          <Show when={dialog() === "worktree-branch"}>
            <TextPromptDialog title="New branch" description={<text fg={theme.textMuted}>Leave empty to check out HEAD in detached mode.</text>} placeholder="feature/name" onConfirm={createWorktree} onClose={closeDialog} />
          </Show>
          <Show when={dialog() === "worktree-remove" && pendingWorktree()}>
            <ConfirmDialog title="Remove worktree" message={`Remove ${pendingWorktree()}? Dirty worktrees are refused.`} confirmLabel="Remove" onConfirm={removeWorktree} onClose={closeDialog} />
          </Show>
          <Show when={dialog() === "connect" && pendingProvider()}>
            <TextPromptDialog
              title="API key"
              description={
                <box gap={1}>
                  <text fg={theme.textMuted}>
                    Connect {providerName(pendingProvider()!.provider)}. The key is saved globally on this computer; environment variables still take priority.
                  </text>
                  <Show when={pendingProvider()!.provider === "opencode-zen"}>
                    <text fg={theme.text}>Go to <span style={{ fg: theme.primary }}>https://opencode.ai/zen</span> to get a key</text>
                  </Show>
                  <Show when={pendingProvider()!.provider === "opencode-go"}>
                    <text fg={theme.text}>Go to <span style={{ fg: theme.primary }}>https://opencode.ai/go</span> and enable OpenCode Go</text>
                  </Show>
                </box>
              }
              placeholder="API key"
              secret
              busy={providerConnecting()}
              busyText="Authenticating and discovering models..."
              onConfirm={(value) => void connectProvider(value)}
              onClose={closeDialog}
            />
          </Show>
          <Show when={dialog() === "rename"}>
            <TextPromptDialog
              title="Rename session"
              value={renameTarget().title}
              onConfirm={(value) => { setSession(renameTarget().id, (session) => renameSession(session, value)); closeDialog() }}
              onClose={closeDialog}
            />
          </Show>
          <Show when={dialog() === "delete"}>
            <ConfirmDialog
              title="Delete session"
              message={`Delete '${deleteTarget().title}' and its local conversation history?`}
              confirmLabel="Delete"
              onConfirm={deleteSession}
              onClose={closeDialog}
            />
          </Show>
          <Show when={dialog() === "detail"}>
            <DetailDialog title={detail().title} lines={detail().lines} onClose={closeDialog} />
          </Show>
        </DialogOverlay>
      </box>
    </Show>
  )
}

if (process.env.NIMBL_TEST_RENDERER !== "1") {
  if (await runCliCommand(process.argv.slice(2), process.cwd())) {
    process.exit(process.exitCode || 0)
  }
  restoreCtrlCGuard = win32InstallCtrlCGuard()
  try {
    renderer = await createCliRenderer({
      externalOutputMode: "passthrough",
      targetFps: 60,
      gatherStats: false,
      exitOnCtrlC: false,
      autoFocus: false,
      openConsoleOnError: false,
    })
    win32DisableProcessedInput()
    await render(() => <App />, renderer)
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error)
    try {
      writeFileSync("nimbl-error.log", `TUI CRASH:\n${message}\n`, "utf8")
    } finally {
      renderer?.destroy()
      restoreCtrlCGuard?.()
      restoreCtrlCGuard = undefined
      win32FlushInputBuffer()
      process.exitCode = 1
    }
  }
}

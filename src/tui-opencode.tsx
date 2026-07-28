import { createCliRenderer } from "@opentui/core"
import { render, useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { resolveConfig } from "@/config"
import { estimateReferenceCost } from "@/core/api"
import {
  contextEstimate,
  runAgent,
  type AgentMessage,
  type AgentEvent,
  type PermissionRequest,
} from "@/core/agent"
import { expandCommand, loadProjectCommands } from "@/core/commands"
import { ctrlCAction } from "@/core/ctrl-c"
import { EXIT_CONFIRM_WINDOW_MS, registerExitPress } from "@/core/exit-guard"
import { loadLearning, observeLearning, saveLearning } from "@/core/learning"
import { preparePromptContext } from "@/core/prompt-context"
import { permissionFor } from "@/core/permissions"
import {
  PROVIDERS,
  defaultModelFor,
  modelContextWindow,
  providerApiKey,
} from "@/core/providers"
import { routeProvider } from "@/core/routing"
import { findSession, latestSession, sessionEpilogue } from "@/core/session-lifecycle"
import {
  compactSession,
  forkSession,
  recordSnapshot,
  recordSnapshotGroup,
  redoSnapshot,
  renameSession,
  undoSnapshot,
} from "@/core/session-actions"
import {
  backupInvalidSessionStore,
  loadSessionStore,
  saveSessionStore,
  type SessionStore,
  type StoredMessage,
  type StoredSession,
} from "@/core/sessions"
import { loadSettings, saveSettings, type NimblSettings, type PermissionValue } from "@/core/settings"
import { runShellCommand } from "@/core/shell"
import { finishAssistant, reduceAssistantEvents } from "@/core/transcript"
import {
  win32DisableProcessedInput,
  win32FlushInputBuffer,
  win32InstallCtrlCGuard,
} from "@/core/terminal-win32"
import {
  ConfirmDialog,
  DetailDialog,
  DialogOverlay,
  SelectDialog,
  SessionPrompt,
  SessionScreen,
  TextPromptDialog,
  Toast,
  agentColor,
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
  { value: "compact", title: "Compact", description: "Replace older messages with lossy excerpts", category: "Session" },
  { value: "clear", title: "Clear", description: "Clear the active transcript", category: "Session" },
  { value: "model", title: "Model", description: "Select a model", category: "Configuration", suggested: true },
  { value: "provider", title: "Provider", description: "Connect or select a provider", category: "Configuration", suggested: true },
  { value: "agent", title: "Agent", description: "Select Build, Plan, Explain, or Learn", category: "Configuration" },
  { value: "route", title: "Provider routing", description: "Prefer local, fast, or budget", category: "Configuration", autocomplete: "insert" },
  { value: "settings", title: "Settings", description: "Inspect project integrations and policies", category: "Configuration" },
  { value: "keybinds", title: "Keybindings", description: "Inspect configured keybindings", category: "Configuration" },
  { value: "context", title: "Context", description: "Inspect context budget", category: "View" },
  { value: "details", title: "Details", description: "Show session diagnostics", category: "View" },
  { value: "status", title: "Status", description: "Show active configuration", category: "View" },
  { value: "stats", title: "Stats", description: "Show session usage", category: "View" },
  { value: "sidebar", title: "Toggle sidebar", description: "Show or hide session details", category: "View" },
  { value: "home", title: "Home", description: "Return to the NIMBL home screen", category: "View" },
  { value: "help", title: "Help", description: "Show keyboard shortcuts", category: "View" },
  { value: "undo", title: "Undo", description: "Undo the latest tracked write, edit, or patch", category: "Project" },
  { value: "redo", title: "Redo", description: "Reapply the latest undone change", category: "Project" },
  { value: "init", title: "Initialize project rules", description: "Create NIMBL.md", category: "Project" },
  { value: "export", title: "Export", description: "Export the active session", category: "Project" },
  { value: "share", title: "Export copy", description: "Create a local Markdown copy", category: "Project" },
  { value: "unshare", title: "Disable export copies", description: "Disable local /share exports", category: "Project" },
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
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

function flagValue(argv: string[], flag: string) {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

function modelOptions(): CommandOption[] {
  return [...PROVIDERS]
    .sort((left, right) => Number(left.id !== "opencode-zen") - Number(right.id !== "opencode-zen") || left.name.localeCompare(right.name))
    .flatMap((provider) => provider.models.map((model) => ({
    value: `${provider.id}::${model.id}`,
    title: model.name,
    footer: model.free ? "Free" : undefined,
    category: provider.name,
  })))
}

function commandLine(value: string) {
  const text = value.trim().replace(/^\//, "")
  const [name = "", ...rest] = text.split(/\s+/)
  return { name, argument: rest.join(" ") }
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
  const config = resolveConfig(argv)
  const dimensions = useTerminalDimensions()
  const directory = process.cwd()
  const [settings, setSettings] = createSignal<NimblSettings>(loadSettings(directory))
  const [learning, setLearning] = createSignal(loadLearning(directory))
  const projectCommands = loadProjectCommands(directory)
  const storeResult = loadSessionStore(directory)
  let recoveryNotice: string | undefined
  let store: SessionStore | undefined
  if (storeResult.status === "valid") store = storeResult.store
  if (storeResult.status === "invalid") {
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
  const initialSessions: StoredSession[] = persistedSessions.length
    ? resumed && forkRequested ? [resumed, ...persistedSessions] : persistedSessions
    : [{ id: id(), title: "New session", messages: [], agent: "build", created: Date.now() }]
  const initialActiveID = resumed?.id
    || (store?.activeID && initialSessions.some((session) => session.id === store.activeID) ? store.activeID : initialSessions[0]!.id)
  const explicitProvider = flagValue(argv, "--provider")
  const explicitModel = flagValue(argv, "--model")
  const initialProvider = explicitProvider ? config.provider : store?.provider || config.provider
  const initialModel = explicitModel ? config.model : store?.model || (initialProvider === config.provider ? config.model : defaultModelFor(initialProvider))

  const [view, setView] = createSignal<"home" | "session">(resumed ? "session" : "home")
  const [sessions, setSessions] = createSignal(initialSessions)
  const [activeID, setActiveID] = createSignal(initialActiveID)
  const [draft, setDraft] = createSignal("")
  const [provider, setProvider] = createSignal(initialProvider)
  const [model, setModel] = createSignal(initialModel)
  const [providerKeys, setProviderKeys] = createSignal<Record<string, string>>(
    flagValue(argv, "--api-key") ? { [config.provider]: config.apiKey } : {},
  )
  const [dialog, setDialog] = createSignal<DialogName>(null)
  const [detail, setDetail] = createSignal({ title: "", lines: [] as string[] })
  const [pendingProvider, setPendingProvider] = createSignal<{ provider: string; model: string }>()
  const [pendingDelete, setPendingDelete] = createSignal<string>()
  const [pendingRename, setPendingRename] = createSignal<string>()
  const [selectedMessageID, setSelectedMessageID] = createSignal<string>()
  const [sidebarMode, setSidebarMode] = createSignal<"auto" | boolean>("auto")
  const [runningSessionID, setRunningSessionID] = createSignal<string>()
  const [abortController, setAbortController] = createSignal<AbortController>()
  const [approvalQueue, setApprovalQueue] = createSignal<PendingApproval[]>([])
  const [questionQueue, setQuestionQueue] = createSignal<PendingQuestion[]>([])
  const [alwaysAllowed, setAlwaysAllowed] = createSignal(new Set<string>())
  const [toast, setToast] = createSignal<ToastState>()
  const [exitArmedAt, setExitArmedAt] = createSignal<number>()

  let sessionPrompt: SessionPromptRef | undefined
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let focusTimer: ReturnType<typeof setTimeout> | undefined
  let exitTimer: ReturnType<typeof setTimeout> | undefined
  let focusGeneration = 0
  let shuttingDown = false

  const active = createMemo(() => sessions().find((session) => session.id === activeID()) || sessions()[0]!)
  const sidebarVisible = createMemo(() => sidebarMode() === "auto" ? dimensions().width > 120 : sidebarMode() as boolean)
  const contentWidth = createMemo(() => Math.max(20, dimensions().width - (sidebarVisible() && dimensions().width > 120 ? 42 : 0) - 4))
  const activeMessage = createMemo(() => active().messages.find((message) => message.id === selectedMessageID()))
  const renameTarget = createMemo(() => sessions().find((session) => session.id === pendingRename()) ?? active())
  const deleteTarget = createMemo(() => sessions().find((session) => session.id === pendingDelete()) ?? active())
  const currentApproval = createMemo(() => approvalQueue()[0])
  const currentQuestion = createMemo(() => questionQueue()[0])
  const uiSession = createMemo<ChatSession>(() => ({
    ...active(),
    messages: visibleMessages(active()),
  }))
  const contextText = createMemo(() => {
    const session = active()
    if (!session.contextTokens) return undefined
    const window = session.contextWindow || modelContextWindow(provider(), model())
    const context = `${formatTokens(session.contextTokens)} (${Math.round((session.contextTokens / window) * 100)}%)`
    return session.cost ? `${context} · $${session.cost.toFixed(4)}` : context
  })

  const configuredCommands = createMemo(() => ({ ...settings().customCommands, ...projectCommands }))
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
      description: item.description,
      connected: Boolean(apiKey(item.id)),
      category: PROVIDER_PRIORITY.has(item.id) ? "Popular" : "Providers",
    })))
  const models = createMemo<CommandOption[]>(() => modelOptions().map((item) => ({
    ...item,
    current: item.value === `${provider()}::${model()}`,
  })))
  const sessionOptions = createMemo<CommandOption[]>(() => {
    const today = new Date().toDateString()
    return [...sessions()]
      .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || (right.updated || right.created) - (left.updated || left.created))
      .map((session) => {
        const date = new Date(session.updated || session.created).toDateString()
        return {
          value: session.id,
          title: pendingDelete() === session.id ? "Press ctrl+d again to confirm" : session.title,
          category: session.pinned ? "Pinned" : date === today ? "Today" : date,
          current: session.id === activeID(),
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

  function apiKey(providerID: string) {
    return providerKeys()[providerID] || providerApiKey(providerID)
  }

  function persistNow() {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = undefined
    saveSessionStore(directory, {
      version: 1,
      activeID: activeID(),
      provider: provider(),
      model: model(),
      sessions: sessions(),
    })
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
      updated: Date.now(),
    }), persist)
  }

  function showToast(message: string, variant: ToastVariant = "info", title?: string) {
    setToast({ message, variant, title })
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
    setDialog(null)
    setPendingProvider(undefined)
    setPendingDelete(undefined)
    setPendingRename(undefined)
    setSelectedMessageID(undefined)
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

  function askQuestion(sessionID: string, question: { prompt: string; options: string[] }) {
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

  async function send(raw: string) {
    const displayText = raw.trim()
    if (!displayText) return
    if (runningSessionID()) {
      showToast("Wait for the current run to finish or press Esc to interrupt it.", "warning")
      return
    }

    const sessionID = activeID()
    const session = sessions().find((item) => item.id === sessionID)!
    const controller = new AbortController()
    let runProvider = provider()
    let runModel = model()
    const runAgentMode = session.agent
    let assistantID: string | undefined
    let flushTimer: ReturnType<typeof setTimeout> | undefined
    let eventQueue: AgentEvent[] = []

    setRunningSessionID(sessionID)
    setAbortController(controller)
    setView("session")
    setDraft("")

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

      const routed = routeProvider(prepared.text, settings())
      if (routed && (routed.local || apiKey(routed.id))) {
        runProvider = routed.id
        runModel = defaultModelFor(routed.id)
        setProvider(runProvider)
        setModel(runModel)
        showToast(`Routed this request to ${routed.name}.`, "info")
      }
      const key = apiKey(runProvider)
      const definition = PROVIDERS.find((item) => item.id === runProvider)
      if (!definition?.local && !key) throw new Error(`Connect ${providerName(runProvider)} before sending a prompt.`)

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
      const result = await runAgent({
        root: directory,
        provider: runProvider,
        model: runModel,
        apiKey: key,
        mode: runAgentMode,
        summary: current.summary,
        learning: learning(),
        contextWindow: modelContextWindow(runProvider, runModel),
        messages: history(current),
        abortSignal: controller.signal,
        permissions: settings().permissions,
        requestApproval: (request) => askApproval(sessionID, request),
        askQuestion: (question) => askQuestion(sessionID, question),
        onFileChange: (change) => setSession(sessionID, (value) => recordSnapshot(value, { ...change, time: Date.now() })),
        onFileChanges: (changes) => setSession(sessionID, (value) => recordSnapshotGroup(value, changes, Date.now())),
        onRetry: ({ attempt, message }) => showToast(`Retrying request (${attempt}/3): ${message}`, "warning"),
        onEvent: queueEvent,
      })

      flushEvents()
      const completed = Date.now()
      const cost = estimateReferenceCost(result.usage.inputTokens, result.usage.outputTokens)
      updateMessage(sessionID, assistantID, (message) => finishAssistant(message, completed))
      setSession(sessionID, (value) => ({
        ...value,
        contextTokens: result.usage.totalTokens,
        contextWindow: modelContextWindow(runProvider, runModel),
        tokens: (value.tokens || 0) + result.usage.totalTokens,
        cost: (value.cost || 0) + cost,
        updated: completed,
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
      persistNow()
      focusPrompt()
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
    closeDialog()
    showToast(`Using ${definition.name}.`, "success")
  }

  function selectModel(value: string) {
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
    schedulePersist()
    closeDialog()
    showToast(`Using ${modelID} via ${definition.name}.`, "success")
  }

  function connectProvider(key: string) {
    const pending = pendingProvider()
    if (!pending || !key.trim()) return
    setProviderKeys((keys) => ({ ...keys, [pending.provider]: key.trim() }))
    setProvider(pending.provider)
    setModel(pending.model)
    schedulePersist()
    closeDialog()
    showToast(`Connected ${providerName(pending.provider)} for this run.`, "success")
  }

  function deleteSession(closeAfter = true) {
    const target = pendingDelete()
    if (!target) return
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

  function exportSession(prefix = "nimbl-export") {
    try {
      const filename = `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.md`
      const transcript = active().messages
        .filter((message) => !message.hidden && (message.role === "user" || message.role === "assistant" || message.role === "error"))
        .map((message) => `## ${message.role}\n\n${message.text || message.error || ""}`)
        .join("\n\n")
      writeFileSync(filename, `# ${active().title}\n\n${transcript}\n`, "utf8")
      showToast(`Created ${filename}.`, "success")
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), "error")
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
    if (name === "model") return setDialog("model")
    if (name === "provider") return setDialog("provider")
    if (name === "agent") return setDialog("agent")
    if (name === "palette") return setDialog("palette")
    if (name === "sidebar") return setSidebarMode(!sidebarVisible())
    if (name === "home") return setView("home")
    if (name === "compact") {
      setSession(activeID(), (session) => compactSession(session))
      return showToast("Older messages replaced with lossy excerpts.", "success")
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
    if (name === "clear") return setSession(activeID(), (session) => ({ ...session, messages: [], summary: undefined, contextTokens: 0, tokens: 0, cost: 0, updated: Date.now() }))
    if (name === "context") {
      const window = active().contextWindow || modelContextWindow(provider(), model())
      const estimate = contextEstimate(history(active()), active().summary || "")
      return openDetail("Context", [
        `Model window: ${formatTokens(window)}`,
        `Last request: ${formatTokens(active().contextTokens || 0)}`,
        `Session estimate: ${formatTokens(estimate)}`,
        "",
        "NIMBL selects relevant project files locally and reserves room for the model response.",
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
      `Tokens: ${formatTokens(active().tokens || 0)}`,
      `Reference cost: $${(active().cost || 0).toFixed(4)}`,
    ])
    if (name === "stats") return openDetail("Usage", [
      `Tokens: ${formatTokens(active().tokens || 0)}`,
      `Reference cost: $${(active().cost || 0).toFixed(4)}`,
    ])
    if (name === "help") return openDetail("Keyboard shortcuts", [
      "Tab        cycle Build / Plan / Explain / Learn",
      "Ctrl+P     command palette",
      "Ctrl+C     copy selection; press twice to exit",
      "Esc        close popup; press twice to interrupt a run",
      "↑ / ↓      move selection",
      "Enter      select or submit",
      "/sessions  switch sessions",
      "/home      return to the NIMBL home screen",
    ])
    if (name === "keybinds") return openDetail("Keybindings", Object.entries(settings().keybinds).map(([action, key]) => `${action}: ${key}`))
    if (name === "settings") return openDetail("Settings", [
      `MCP entries (runtime unavailable): ${Object.keys(settings().mcp).length}`,
      `Plugin entries (runtime unavailable): ${settings().plugins.length}`,
      `LSP entries (runtime unavailable): ${Object.keys(settings().lsp).length}`,
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
    if (name === "share") {
      if (settings().share === "disabled") return showToast("Local export copies are disabled for this project.", "warning")
      return exportSession("nimbl-share")
    }
    if (name === "unshare") {
      persistSettings({ ...settings(), share: "disabled" })
      return showToast("Local /share export copies disabled.", "success")
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
      if (["resume", "continue"].includes(command.name) || availableCommands().some((item) => item.value === command.name)) {
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

  onMount(() => {
    schedulePersist()
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
    if (persistTimer) clearTimeout(persistTimer)
    if (toastTimer) clearTimeout(toastTimer)
    if (focusTimer) clearTimeout(focusTimer)
    if (exitTimer) clearTimeout(exitTimer)
    if (!shuttingDown) prepareShutdown()
  })

  const dialogSize = createMemo(() => ["sessions", "timeline"].includes(dialog() || "") ? "large" as const : "medium" as const)

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
      <box width={dimensions().width} height={dimensions().height} flexDirection="column" backgroundColor={theme.background}>
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
            onAbort={abortRun}
            commands={availableCommands()}
            onCommand={submitLine}
            onMessageAction={openMessageActions}
            focusMessageID={selectedMessageID()}
            sidebarVisible={sidebarVisible()}
            contextText={contextText()}
            cost={active().cost || 0}
            contentWidth={contentWidth()}
            keyboardDisabled={dialog() !== null}
            pendingApproval={currentApproval() ? {
              title: currentApproval()!.request.title,
              detail: currentApproval()!.request.detail,
              diff: currentApproval()!.request.diff,
            } : undefined}
            onApproval={answerApproval}
            pendingQuestion={currentQuestion() ? {
              prompt: currentQuestion()!.prompt,
              options: currentQuestion()!.options,
            } : undefined}
            onQuestion={answerQuestion}
            promptRef={(value) => { sessionPrompt = value }}
          />
        </Show>

        <Show when={view() === "home"}>
          <box width="100%" height="100%" flexDirection="column">
            <box flexGrow={1} minHeight={0} alignItems="center" paddingLeft={2} paddingRight={2}>
              <box flexGrow={1} minHeight={0} />
              <box height={4} minHeight={0} flexShrink={1} />
              <box flexShrink={0} flexDirection="column">
                <For each={LOGO}>{(line) => <text fg={theme.primaryForeground}>{line}</text>}</For>
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
                  commands={availableCommands()}
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
              <text flexShrink={0} fg={theme.textMuted}>NIMBL</text>
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
            <SelectDialog title="Select model" options={models()} flat onSelect={selectModel} onClose={closeDialog} />
          </Show>
          <Show when={dialog() === "provider"}>
            <SelectDialog title="Connect a provider" options={providerOptions()} onSelect={selectProvider} onClose={closeDialog} />
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
              }}
              onClose={closeDialog}
            />
          </Show>
          <Show when={dialog() === "connect" && pendingProvider()}>
            <TextPromptDialog
              title={`Connect ${providerName(pendingProvider()!.provider)}`}
              description={<text fg={theme.textMuted}>Enter an API key for this NIMBL process.</text>}
              placeholder="API key"
              secret
              onConfirm={connectProvider}
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

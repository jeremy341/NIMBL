// @ts-nocheck
import { render, useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createCliRenderer, RGBA } from "@opentui/core"
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { resolveConfig } from "@/config"
import { estimateSavings } from "@/core/api"
import { PROVIDERS, defaultModelFor, modelContextWindow, providerApiKey } from "@/core/providers"
import { loadSessionStore, saveSessionStore } from "@/core/sessions"
import { contextEstimate, runAgent, type PermissionRequest } from "@/core/agent"
import { compactSession, forkSession, recordSnapshot, redoSnapshot, renameSession, undoSnapshot } from "@/core/session-actions"
import { loadSettings, saveSettings, type NimblSettings } from "@/core/settings"
import { routeProvider } from "@/core/routing"
import { loadLearning, observeLearning, saveLearning } from "@/core/learning"
import { preparePromptContext } from "@/core/prompt-context"
import { expandCommand, loadProjectCommands } from "@/core/commands"
import { existsSync, writeFileSync } from "fs"

const PALETTES = {
  nimbl: {
  bg: "#0a0a0a", surface: "#111111", surfaceHi: "#181818",
  promptSurface: "#1e1e1e",
  accent: "#06402b", accentHi: "#0a5c3e", accentLo: "#042e1f", selFg: "#ffffff", catFg: "#7fd88f",
  text: "#e0e0e0", textHi: "#ffffff", mute: "#808080", dim: "#505050",
  ok: "#7fd88f", warn: "#e5b567", err: "#e06c75", info: "#76a9fa",
  },
  opencode: {
    bg: "#0a0a0a", surface: "#141414", surfaceHi: "#282828", promptSurface: "#1e1e1e",
    accent: "#9d7cd8", accentHi: "#fab283", accentLo: "#323232", selFg: "#0a0a0a", catFg: "#9d7cd8",
    text: "#eeeeee", textHi: "#ffffff", mute: "#808080", dim: "#484848",
    ok: "#7fd88f", warn: "#f5a742", err: "#e06c75", info: "#56b6c2",
  },
  mono: {
    bg: "#000000", surface: "#121212", surfaceHi: "#1d1d1d",
    promptSurface: "#1d1d1d",
    accent: "#808080", accentHi: "#d0d0d0", accentLo: "#262626", selFg: "#000000", catFg: "#d0d0d0",
    text: "#d0d0d0", textHi: "#ffffff", mute: "#909090", dim: "#606060",
    ok: "#d0d0d0", warn: "#b0b0b0", err: "#e0e0e0", info: "#c0c0c0",
  },
} as const
const C = process.env.NO_COLOR ? PALETTES.mono : PALETTES[loadSettings(process.cwd()).theme]

const LOGO = [
  "  ███╗   ██╗ ██╗ ███╗   ███╗ ██████╗  ██╗",
  "  ████╗  ██║ ██║ ████╗ ████║ ██╔══██╗ ██║",
  "  ██╔██╗ ██║ ██║ ██╔████╔██║ ██████╔╝ ██║",
  "  ██║╚██╗██║ ██║ ██║╚██╔╝██║ ██╔══██╗ ██║",
  "  ██║ ╚████║ ██║ ██║ ╚═╝ ██║ ██████╔╝ ███████╗",
  "  ╚═╝  ╚═══╝ ╚═╝ ╚═╝     ╚═╝ ╚═════╝  ╚══════╝",
]
const LOGO_COMPACT = [
  " _   _ ___ __  __ ___ _    ",
  "| \\ | |_ _|  \\/  | _ ) |   ",
  "| .` || || |\\/| | _ \\ |__ ",
  "|_|\\_|___|_|  |_|___/____|",
]

const EmptyBorder = {
  topLeft: "", bottomLeft: "", vertical: "", topRight: "", bottomRight: "",
  horizontal: " ", bottomT: "", topT: "", cross: "", leftT: "", rightT: "",
}
const LeftRule = { ...EmptyBorder, vertical: "┃" }
const PromptRule = { ...EmptyBorder, vertical: "┃", bottomLeft: "╹" }
const PromptBottom = { ...EmptyBorder, vertical: "╹" }

type Role = "user" | "assistant" | "error" | "system" | "tool" | "reasoning"
type AgentMode = "build" | "plan" | "explain" | "learn"
type Dialog = "model" | "provider" | "connect" | "agent" | "sessions" | "timeline" | "message" | "context" | "help" | "approval" | "question" | "delete" | "details" | "palette" | null

interface Message { id: string; role: Role; text: string; time: number; tool?: string; state?: string; detail?: string; output?: string; diff?: string; path?: string; hidden?: boolean; agentText?: string }
interface Session { id: string; title: string; messages: Message[]; agent: AgentMode; created: number; summary?: string; pinned?: boolean; updated?: number; reasoningVisible?: boolean; contextTokens?: number; contextWindow?: number }
interface PendingApproval { request: PermissionRequest; resolve: (choice: "once" | "always" | "reject") => void }
interface PendingQuestion { prompt: string; options: string[]; resolve: (answer: string) => void }
interface Option { value: string; title: string; description?: string; connected?: boolean; current?: boolean; category?: string }

const commands = [
  ["new", "New session", "Start a clean session"],
  ["sessions", "Sessions", "Open the session timeline"],
  ["timeline", "Timeline", "Jump to a message and open its actions"],
  ["rename", "Rename session", "Rename the active session"],
  ["fork", "Fork session", "Branch from the active session"],
  ["pin", "Pin session", "Toggle active session pin"],
  ["delete", "Delete session", "Delete the active session"],
  ["model", "Model", "Select model"],
  ["provider", "Provider", "Connect or select provider"],
  ["theme", "Theme", "Set the TUI theme for the next launch"],
  ["keybinds", "Keybindings", "Inspect configured keybindings"],
  ["settings", "Settings", "Inspect project integrations and policies"],
  ["route", "Provider routing", "Configure automatic provider choice"],
  ["init", "Initialize project rules", "Create NIMBL.md project instructions"],
  ["share", "Share", "Create a local shareable session export"],
  ["unshare", "Unshare", "Disable share output for this project"],
  ["agent", "Agent", "Switch Build or Plan mode"],
  ["compact", "Compact", "Summarize old context to save tokens"],
  ["details", "Details", "Show token, context, and model diagnostics"],
  ["thinking", "Thinking", "Toggle reasoning cards"],
  ["undo", "Undo", "Undo the last approved file change"],
  ["redo", "Redo", "Reapply the last undone file change"],
  ["palette", "Command palette", "Browse every action"],
  ["context", "Context", "Inspect context budget"],
  ["status", "Status", "Show active configuration"],
  ["stats", "Stats", "Show session token usage"],
  ["export", "Export", "Export active session"],
  ["clear", "Clear", "Clear active timeline"],
  ["help", "Help", "Show keyboard shortcuts"],
  ["quit", "Quit", "Exit NIMBL"],
  ["sidebar", "Toggle sidebar", "Open the session sidebar"],
  ["home", "Home", "Go back to the home screen"],
] as const

const modelOptions = (): Option[] => PROVIDERS.flatMap((provider) => provider.models.map((model) => ({
  value: provider.id + "::" + model.id,
  title: model.name,
  description: provider.name + (model.free ? " · Free" : ""),
  category: provider.name,
})))

function providerName(id: string) { return PROVIDERS.find((item) => item.id === id)?.name || id }
function modeLabel(mode: AgentMode) { return mode === "build" ? "Build" : mode === "plan" ? "Plan" : mode === "explain" ? "Explain" : "Learn" }
// OpenCode assigns visible agents secondary, accent, success, then warning in order.
function modeAccent(mode: AgentMode) { return mode === "build" ? "#5c9cf5" : mode === "plan" ? "#9d7cd8" : mode === "explain" ? "#7fd88f" : "#f5a742" }
const AGENT_MODES: AgentMode[] = ["build", "plan", "explain", "learn"]
function nextAgentMode(mode: AgentMode) { return AGENT_MODES[(AGENT_MODES.indexOf(mode) + 1) % AGENT_MODES.length]! }
// Match OpenCode's compact context notation: 12.4K (8%).
function formatTokens(value: number) { return value >= 1_000_000 ? (value / 1_000_000).toFixed(1) + "M" : value >= 1_000 ? (value / 1_000).toFixed(1) + "K" : String(value) }
function envKey(provider: string) { return providerApiKey(provider) || "" }
function id() { return Math.random().toString(36).slice(2, 10) }
function preview(text: string) { return text.replace(/\s+/g, " ").slice(0, 31) || "New session" }

function markdownRows(value: string) {
  let code = false
  return value.split("\n").map((line) => {
    if (line.trimStart().startsWith("```")) { code = !code; return { kind: "fence", text: line.slice(3).trim() || (code ? "code" : "") } }
    if (code) return { kind: "code", text: line }
    if (/^#{1,3}\s/.test(line)) return { kind: "heading", text: line.replace(/^#+\s/, "") }
    if (/^[-*]\s/.test(line)) return { kind: "bullet", text: line.replace(/^[-*]\s/, "") }
    return { kind: "text", text: line }
  })
}

function InlineText(props: { text: string; fg?: string; dim?: boolean }) {
  const parts = () => {
    const tokens: Array<{ kind: "text" | "code" | "bold" | "link"; text: string; url?: string }> = []
    let remaining = props.text
    while (remaining) {
      const codeMatch = remaining.match(/^`([^`]+)`/)
      const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/)
      const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/)
      const next = codeMatch || boldMatch || linkMatch
      if (next) {
        const before = remaining.slice(0, next.index)
        if (before) tokens.push({ kind: "text", text: before })
        tokens.push({ kind: codeMatch ? "code" : boldMatch ? "bold" : "link", text: next[1]!, url: next[2] })
        remaining = remaining.slice(next.index! + next[0].length)
      } else {
        tokens.push({ kind: "text", text: remaining })
        remaining = ""
      }
    }
    return tokens
  }
  return <text fg={props.fg || C.text} attributes={props.dim ? "dim" : undefined}><For each={parts()}>{(part) => <span style={{ fg: part.kind === "code" ? C.ok : part.kind === "bold" ? C.textHi : part.kind === "link" ? C.info : undefined, attributes: part.kind === "bold" ? "bold" : undefined }}>{part.text}</span>}</For></text>
}

function CodeLine(props: { text: string }) {
  const tokens = () => props.text.split(/(\/\/.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:const|let|var|function|class|interface|type|export|import|return|async|await|if|else|for|while|new|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b)/g)
  return <text fg={C.text}><For each={tokens()}>{(token) => <span style={{ fg: token.startsWith("//") ? C.mute : /^['"]/.test(token) ? C.ok : /^(const|let|var|function|class|interface|type|export|import|return|async|await|if|else|for|while|new|true|false|null|undefined)$/.test(token) ? C.info : /^\d/.test(token) ? C.warn : C.text }}>{token}</span>}</For></text>
}

function MarkdownText(props: { text: string }) {
  return <box flexDirection="column"><For each={markdownRows(props.text)}>{(row) => <Show when={row.kind !== "fence"} fallback={<text fg={C.dim}>```{row.text}</text>}><Show when={row.kind === "code"} fallback={row.kind === "heading" ? <InlineText text={row.text} fg={C.textHi} dim={false}/> : <Show when={row.kind === "bullet"} fallback={<InlineText text={row.text} dim={false}/>}><InlineText text={"• " + row.text} dim={false}/></Show>}><box backgroundColor={C.bg} paddingLeft={1}><CodeLine text={row.text}/></box></Show></Show>}</For></box>
}

function Spinner() {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
  const [frame, setFrame] = createSignal(0)
  onMount(() => { const timer = setInterval(() => setFrame((value) => (value + 1) % frames.length), 80); onCleanup(() => clearInterval(timer)) })
  return <text fg={C.accentHi}>{frames[frame()]}</text>
}

function Picker(props: { title: string; options: Option[]; onSelect: (value: string) => void; onClose: () => void; footer?: Array<[string, string]> }) {
  const dims = useTerminalDimensions()
  const [query, setQuery] = createSignal("")
  const [selected, setSelected] = createSignal(0)
  const [hovered, setHovered] = createSignal<number | null>(null)
  const [start, setStart] = createSignal(0)
  const filtered = createMemo(() => {
    const q = query().toLowerCase()
    if (!q) return props.options
    return props.options.filter((option) => [option.title, option.description, option.value, option.category].filter(Boolean).some((value) => value!.toLowerCase().includes(q)))
  })
  const listHeight = createMemo(() => Math.max(1, Math.min(filtered().length, Math.max(4, Math.floor(dims().height / 2) - 6))))
  const visible = createMemo(() => filtered().slice(start(), start() + listHeight()))
  // Insert bold accent category headers when the group changes, like OpenCode's DialogSelect.
  const visibleRows = createMemo(() => {
    const rows: Array<{ kind: "header"; label: string } | { kind: "option"; option: Option; index: number }> = []
    visible().forEach((option, local) => {
      const absolute = start() + local
      const previous = absolute > 0 ? filtered()[absolute - 1] : undefined
      if (option.category && option.category !== previous?.category) rows.push({ kind: "header", label: option.category })
      rows.push({ kind: "option", option, index: absolute })
    })
    return rows
  })
  function keepVisible(next: number) {
    const max = Math.max(0, filtered().length - listHeight())
    setStart((current) => next < current ? next : next >= current + listHeight() ? Math.min(max, next - listHeight() + 1) : current)
  }
  function choose(index: number) { const option = filtered()[index]; if (option) props.onSelect(option.value) }
  function key(e: any) {
    const length = filtered().length
    if (e.key === "Escape") { e.preventDefault(); props.onClose(); return }
    if (!length) return
    if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); setSelected((value) => { const next = Math.min(length - 1, value + 1); keepVisible(next); return next }) }
    else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); setSelected((value) => { const next = Math.max(0, value - 1); keepVisible(next); return next }) }
    else if (e.key === "Home") { e.preventDefault(); setSelected(0); setStart(0) }
    else if (e.key === "End") { e.preventDefault(); setSelected(length - 1); setStart(Math.max(0, length - listHeight())) }
    else if (e.key === "Enter") { e.preventDefault(); choose(selected()) }
  }
  function wheel(event: any) {
    event.stopPropagation()
    const delta = Math.max(1, event.scroll?.delta || 1)
    if (event.scroll?.direction === "down") setStart((value) => Math.min(Math.max(0, filtered().length - listHeight()), value + delta))
    if (event.scroll?.direction === "up") setStart((value) => Math.max(0, value - delta))
  }
  return <box flexDirection="column" width="100%" height={visibleRows().length + 5 + (props.footer?.length ? 1 : 0)} gap={1} paddingBottom={1}>
      <box paddingLeft={4} paddingRight={4}>
      <box flexDirection="row" justifyContent="space-between"><text fg={C.text} attributes="bold">{props.title}</text><text fg={C.mute} onMouseUp={props.onClose}>esc</text></box>
      <box paddingTop={1}><input value={query()} width="100%" placeholder="Search" placeholderColor={C.mute} fg={C.mute} backgroundColor={C.surface} focusedBackgroundColor={C.surface} cursorColor={C.accentHi} onInput={(value) => { setQuery(value); setSelected(0); setStart(0) }} onKeyDown={key} ref={(node: any) => setTimeout(() => node?.focus(), 1)} /></box>
    </box>
    <box flexDirection="column" height={visibleRows().length} overflow="hidden" onMouseScroll={wheel}>
      <Show when={visible().length > 0} fallback={<box paddingLeft={4} paddingTop={1}><text fg={C.mute}>No results found</text></box>}>
        <For each={visibleRows()}>{(row) => {
          if (row.kind === "header") {
            const first = () => visibleRows().indexOf(row) === 0
            return <box paddingTop={first() ? 0 : 1} paddingLeft={3}><text fg={C.catFg} attributes="bold">{row.label}</text></box>
          }
          const option = row.option
          const active = () => row.index === selected() || row.index === hovered()
           return <box flexDirection="row" paddingLeft={option.current ? 1 : 3} paddingRight={3} gap={1} backgroundColor={active() ? C.accentHi : undefined} onMouseOver={() => setHovered(row.index)} onMouseOut={() => setHovered(null)} onMouseScroll={wheel} onMouseDown={(event: any) => { event.stopPropagation(); setSelected(row.index) }} onMouseUp={(event: any) => { event.stopPropagation(); choose(row.index) }}>
            <Show when={option.current}><text fg={active() ? C.selFg : C.accentHi}>●</text></Show>
            <text flexGrow={1} overflow="hidden" wrapMode="none" fg={active() ? C.selFg : option.current ? C.accentHi : C.text} attributes={active() ? "bold" : undefined}>{option.connected ? "[connected] " : ""}{option.title}<Show when={option.description}><span style={{ fg: active() ? C.selFg : C.mute }}> {option.description}</span></Show></text>
          </box>
        }}</For>
      </Show>
    </box>
    <Show when={props.footer?.length}><box paddingLeft={4} paddingRight={2} flexDirection="row" gap={2}><For each={props.footer}>{([action, label]) => <text><span style={{ fg: C.text, bold: true }}>{action}</span><span style={{ fg: C.mute }}> {label}</span></text>}</For></box></Show>
  </box>
}

function DetailDialog(props: { title: string; lines: string[]; footer?: string; onClose: () => void }) {
  const height = Math.min(18, props.lines.length + 4)
  return <box flexDirection="column" width="100%" height={height} paddingLeft={3} paddingRight={3} paddingBottom={1}>
    <box flexDirection="row" justifyContent="space-between"><text fg={C.textHi} attributes="bold">{props.title}</text><text fg={C.dim} onMouseUp={props.onClose}>esc</text></box>
    <box height={1} />
    <For each={props.lines.slice(0, height - 4)}>{(line) => <text fg={C.text}>{line}</text>}</For>
    <box flexGrow={1} />
    <text fg={C.dim}>{props.footer || "Esc close"}</text>
  </box>
}

function ApiKeyDialog(props: { onSubmit: (key: string) => void; onClose: () => void }) {
  const [apiKey, setApiKey] = createSignal("")
  return <box flexDirection="column" width="100%" height={7} paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
    <box flexDirection="row" justifyContent="space-between"><text fg={C.textHi} attributes="bold">API key</text><text fg={C.dim} onMouseUp={props.onClose}>esc</text></box>
    <input value={apiKey()} width="100%" placeholder="API key" placeholderColor={C.dim} fg={C.text} backgroundColor={C.surface} focusedBackgroundColor={C.surface} onInput={setApiKey} onKeyDown={(event: any) => { if (event.key === "Escape") { event.preventDefault(); props.onClose() } }} onSubmit={() => { if (apiKey().trim()) props.onSubmit(apiKey().trim()) }} ref={(node: any) => setTimeout(() => node?.focus(), 1)} />
    <text fg={C.dim}><span style={{ fg: C.textHi }}>enter</span> submit</text>
  </box>
}

export function App() {
  const config = resolveConfig(process.argv)
  const dims = useTerminalDimensions()
  const directory = process.cwd()
  const [settings, setSettings] = createSignal<NimblSettings>(loadSettings(directory))
  const projectCommands = loadProjectCommands(directory)
  const [learning, setLearning] = createSignal(loadLearning(directory))
  const savedStore = loadSessionStore(directory)
  const requestedSessionID = process.argv.find((argument, index, args) => (argument === "-s" || argument === "--session") && Boolean(args[index + 1]))
    ? process.argv[process.argv.findIndex((argument) => argument === "-s" || argument === "--session") + 1]
    : undefined
  const initialSessions = savedStore?.sessions?.length ? savedStore.sessions : [{ id: id(), title: "New session", messages: [], agent: "build" as AgentMode, created: Date.now() }]
  const resumed = requestedSessionID ? initialSessions.find((session) => session.id === requestedSessionID || session.id.startsWith(requestedSessionID)) : undefined
  const initialActiveID = resumed?.id || (savedStore?.activeID && initialSessions.some((session) => session.id === savedStore.activeID) ? savedStore.activeID : initialSessions[0]!.id)
  const [view, setView] = createSignal<"home" | "session">(resumed ? "session" : "home")
  const [sessions, setSessions] = createSignal<Session[]>(initialSessions)
  const [activeID, setActiveID] = createSignal(initialActiveID)
  const [input, setInput] = createSignal("")
  const [loading, setLoading] = createSignal(false)
  const [tokens, setTokens] = createSignal(0)
  const [saved, setSaved] = createSignal(0)
  const [dialog, setDialog] = createSignal<Dialog>(null)
  const [pendingProvider, setPendingProvider] = createSignal<string | null>(null)
  const [providerKeys, setProviderKeys] = createSignal<Record<string, string>>({})
  const [provider, setProvider] = createSignal(savedStore?.provider || config.provider)
  const [model, setModel] = createSignal(savedStore?.model || config.model)
  const [commandOpen, setCommandOpen] = createSignal(false)
  const [commandIndex, setCommandIndex] = createSignal(0)
  const [pendingApproval, setPendingApproval] = createSignal<PendingApproval | null>(null)
  const [pendingQuestion, setPendingQuestion] = createSignal<PendingQuestion | null>(null)
  const [pendingDelete, setPendingDelete] = createSignal<string | null>(null)
  const [alwaysAllowed, setAlwaysAllowed] = createSignal<Set<string>>(new Set())
  const [showReasoning, setShowReasoning] = createSignal(false)
  const [abortController, setAbortController] = createSignal<AbortController | null>(null)
  const [selectedMessageID, setSelectedMessageID] = createSignal<string | null>(null)
  let inputEl: any
  // Trailing-edge throttle: streaming fires hundreds of setActive calls per second;
  // a synchronous session-store write per token freezes the renderer (see debug notes).
  let persistTimer: ReturnType<typeof setTimeout> | undefined
  const persistNow = () => {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = undefined }
    saveSessionStore(directory, { version: 1, activeID: activeID(), provider: provider(), model: model(), sessions: sessions() })
  }
  const persist = () => {
    if (persistTimer) return
    persistTimer = setTimeout(() => { persistTimer = undefined; persistNow() }, 300)
  }
  const active = createMemo(() => sessions().find((session) => session.id === activeID()) || sessions()[0]!)
  const selectedMessage = createMemo(() => active().messages.find((message) => message.id === selectedMessageID()))
  const [sidebarOpen, setSidebarOpen] = createSignal(false)
  const homeLogo = createMemo(() => dims().height >= 48 ? LOGO : LOGO_COMPACT)
  const homePromptWidth = createMemo(() => Math.min(75, Math.max(1, dims().width - 4)))
  const apiKey = (providerID: string) => providerKeys()[providerID] || envKey(providerID)
  const persistSettings = (next: NimblSettings) => { setSettings(next); saveSettings(directory, next) }
  const configuredCommands = createMemo(() => ({ ...settings().customCommands, ...projectCommands }))
  const availableCommands = createMemo(() => [...commands, ...Object.entries(configuredCommands()).map(([name, command]) => [name, name, command.description] as const)])
  const commandMatches = createMemo(() => {
    const query = input().slice(1).toLowerCase()
    return availableCommands().filter(([slash, title]) => slash.startsWith(query) || title.toLowerCase().startsWith(query)).slice(0, 8)
  })
  let timelineScroll: any
  const [scrollKey, setScrollKey] = createSignal(0)
  createEffect(() => {
    scrollKey()
    setTimeout(() => timelineScroll?.scrollTo(timelineScroll.scrollHeight), 0)
  })
  const setActive = (mutate: (session: Session) => Session) => { setSessions((all) => all.map((session) => session.id === activeID() ? mutate(session) : session)); setScrollKey((v) => v + 1); persist() }
  const addMessage = (role: Role, text: string, extra: Partial<Message> = {}) => { const message = { id: id(), role, text, time: Date.now(), ...extra }; setActive((session) => ({ ...session, messages: [...session.messages, message], updated: Date.now() })); return message.id }
  const updateMessage = (messageID: string, mutate: (message: Message) => Message) => setActive((session) => ({ ...session, messages: session.messages.map((message) => message.id === messageID ? mutate(message) : message), updated: Date.now() }))
  const askApproval = (request: PermissionRequest) => new Promise<"once" | "always" | "reject">((resolve) => {
    if (alwaysAllowed().has(request.tool)) return resolve("always")
    setPendingApproval({ request, resolve }); setDialog("approval")
  })
  const askQuestion = (question: { prompt: string; options: string[] }) => new Promise<string>((resolve) => {
    setPendingQuestion({ ...question, resolve }); setDialog("question")
  })
  useKeyboard((event: any) => {
    if (event.ctrl && event.name === "p") { event.preventDefault?.(); setDialog("palette"); return }
    if (event.name === "tab" && !dialog()) { event.preventDefault?.(); changeAgent(nextAgentMode(active().agent)); return }
    if (event.ctrl && event.name === "m" && !dialog()) {
      const latest = [...active().messages].reverse().find((message) => message.role === "user")
      if (latest) { event.preventDefault?.(); setSelectedMessageID(latest.id); setDialog("message") }
      return
    }
    if (dialog() === "approval") {
      if (event.name === "return") answerApproval("once")
      else if (event.name === "a") answerApproval("always")
      else if (event.name === "escape") answerApproval("reject")
      return
    }
    if (dialog() === "question") {
      if (event.name === "escape") answerQuestion("Skipped by user")
      return
    }
    if (event.name === "escape" && !dialog() && !input() && view() === "session") { setView("home"); return }
    if (event.name === "escape" && dialog()) close()
  })
  onMount(() => {
    persist()
    if (requestedSessionID && !resumed) {
      setView("session")
      addMessage("error", `Session '${requestedSessionID}' was not found in this project. Started a new session instead.`)
    }
  })
  const close = () => { if (dialog() === "approval") pendingApproval()?.resolve("reject"); if (dialog() === "question") pendingQuestion()?.resolve("Skipped by user"); setPendingApproval(null); setPendingQuestion(null); setPendingDelete(null); setSelectedMessageID(null); setDialog(null); setPendingProvider(null); setTimeout(() => inputEl?.focus(), 1) }
  const answerApproval = (choice: "once" | "always" | "reject") => {
    const pending = pendingApproval(); if (!pending) return
    if (choice === "always") setAlwaysAllowed((all) => new Set([...all, pending.request.tool]))
    pending.resolve(choice); setPendingApproval(null); setDialog(null); setTimeout(() => inputEl?.focus(), 1)
  }
  const answerQuestion = (answer: string) => {
    const pending = pendingQuestion(); if (!pending) return
    pending.resolve(answer); setPendingQuestion(null); setDialog(null); setTimeout(() => inputEl?.focus(), 1)
  }
  const deleteSession = () => {
    const target = pendingDelete(); if (!target || sessions().length === 1) return close()
    const next = sessions().find((session) => session.id !== target)!;
    setSessions((all) => all.filter((session) => session.id !== target)); setActiveID(next.id); setView("session"); persist(); close()
  }
  const newSession = () => { const session = { id: id(), title: "New session", messages: [], agent: active().agent, created: Date.now() }; setSessions((all) => [session, ...all]); setActiveID(session.id); setView("session"); setInput(""); persist(); setTimeout(() => inputEl?.focus(), 1) }
  const changeAgent = (value: string) => { setActive((session) => ({ ...session, agent: value as AgentMode })); close(); addMessage("system", value === "build" ? "Build mode is active — NIMBL can make approved changes." : value === "plan" ? "Plan mode is active — NIMBL is read-only and will create an implementation plan." : value === "explain" ? "Explain mode is active — NIMBL will teach the code and its trade-offs without editing." : "Learn mode is active — NIMBL will use questions and hints before full solutions.") }
  const chooseProvider = (value: string) => {
    const definition = PROVIDERS.find((item) => item.id === value)
    if (!definition) return
    if (!definition.local && !apiKey(value)) { setPendingProvider(value); setDialog("connect"); return }
    setProvider(value); setModel(defaultModelFor(value)); persist(); close(); addMessage("system", "Provider changed to " + providerName(value) + ".")
  }
  const chooseModel = (value: string) => {
    const [nextProvider, nextModel] = value.split("::")
    const definition = PROVIDERS.find((item) => item.id === nextProvider)
    if (!definition) return
    if (!definition.local && !apiKey(nextProvider)) { setPendingProvider(nextProvider); setDialog("connect"); return }
    setProvider(nextProvider); setModel(nextModel); persist(); close(); addMessage("system", "Model changed to " + nextModel + " via " + providerName(nextProvider) + ".")
  }
  const connect = (key: string) => { const pending = pendingProvider(); if (!pending) return; setProviderKeys((all) => ({ ...all, [pending]: key })); setProvider(pending); setModel(defaultModelFor(pending)); persist(); close(); addMessage("system", "Connected " + providerName(pending) + " for this session.") }
  const openMessageActions = (messageID: string) => {
    if (renderer?.getSelection?.()?.getSelectedText?.()) return
    setSelectedMessageID(messageID)
    setDialog("message")
  }
  const copyMessage = (message: Message) => {
    const text = message.role === "tool" ? [message.text, message.detail, message.diff, message.output].filter(Boolean).join("\n\n") : message.text
    const copied = renderer?.copyToClipboardOSC52?.(text)
    addMessage("system", copied ? "Copied message to the clipboard." : "Your terminal did not accept clipboard access. Select the message text and copy it normally.")
    close()
  }
  const forkFromMessage = (message: Message) => {
    const index = active().messages.findIndex((item) => item.id === message.id)
    if (index < 0) return
    const base = { ...active(), messages: active().messages.slice(0, index + 1) }
    const fork = forkSession(base, id())
    setSessions((all) => [fork, ...all])
    setActiveID(fork.id)
    setView("session")
    persist()
    close()
  }
  const revertToMessage = (message: Message) => {
    const index = active().messages.findIndex((item) => item.id === message.id)
    if (index < 0) return
    setActive((session) => ({ ...session, messages: session.messages.slice(0, index + 1), updated: Date.now() }))
    setInput(message.role === "user" ? message.text : "")
    close()
  }
  const messageActionOptions = createMemo((): Option[] => {
    const message = selectedMessage()
    if (!message) return []
    const options: Option[] = [
      { value: "copy", title: "Copy", description: "message text to clipboard" },
      { value: "fork", title: "Fork", description: "create a session from this message" },
      { value: "revert", title: "Revert", description: "remove later messages and restore this prompt" },
    ]
    if (message.role === "user") options.unshift({ value: "resend", title: "Edit and resend", description: "put this prompt back in the composer" })
    return options
  })
  const chooseMessageAction = (action: string) => {
    const message = selectedMessage()
    if (!message) return close()
    if (action === "copy") return copyMessage(message)
    if (action === "fork") return forkFromMessage(message)
    if (action === "revert") return revertToMessage(message)
    if (action === "resend") { setInput(message.text); close() }
  }
  const send = async (raw: string) => {
    const displayText = raw.trim()
    if (!displayText || loading()) return
    let prepared: { text: string; attachments: string[]; commands: string[] }
    try {
      prepared = await preparePromptContext({ root: directory, text: displayText, runCommand: async (command) => {
        const choice = await askApproval({ id: id(), tool: "bash", title: "Run prompt command", detail: command })
        if (choice === "reject") throw new Error("The prompt command was rejected.")
        const child = Bun.spawn(process.platform === "win32" ? ["powershell.exe", "-NoProfile", "-Command", command] : ["/bin/sh", "-lc", command], { cwd: directory, stdout: "pipe", stderr: "pipe" })
        const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
        return (stdout + (stderr ? "\n" + stderr : "") || "(no output)").slice(0, 12_000) + (code ? `\n(exit ${code})` : "")
      } })
    } catch (error: any) { addMessage("error", error?.message || String(error)); return }
    const text = prepared.text
    if (!text || loading()) return
    setView("session")
    const routed = routeProvider(text, settings())
    if (routed && (routed.local || apiKey(routed.id))) { setProvider(routed.id); setModel(defaultModelFor(routed.id)); addMessage("system", `Routed this request to ${routed.name}.`) }
    const wasEmpty = active().messages.length === 0
    addMessage("user", displayText, { agentText: text })
    if (prepared.attachments.length || prepared.commands.length) addMessage("system", [prepared.attachments.length ? "Attached: " + prepared.attachments.join(", ") : "", prepared.commands.length ? "Prompt command: " + prepared.commands.join(", ") : ""].filter(Boolean).join("\n"))
    if (wasEmpty) setActive((session) => ({ ...session, title: preview(displayText), updated: Date.now() }))
    setInput(""); setCommandOpen(false); setLoading(true)
    const assistantID = addMessage("assistant", "")
    const controller = new AbortController()
    const toolCards = new Map<string, string>()
    let reasoningID: string | undefined
    setAbortController(controller)
    try {
      const result = await runAgent({
        root: directory, provider: provider(), model: model(), apiKey: apiKey(provider()), mode: active().agent, summary: active().summary, learning: learning(), contextWindow: modelContextWindow(provider(), model()),
        messages: active().messages.filter((message) => (message.role === "user" || message.role === "assistant" || message.role === "system") && Boolean(message.text)).map((message) => ({ role: message.role as "user" | "assistant" | "system", text: message.agentText || message.text })),
        abortSignal: controller.signal, requestApproval: askApproval, askQuestion, permissions: settings().permissions,
        onFileChange: (change) => setActive((session) => recordSnapshot(session, { ...change, time: Date.now() })),
        onEvent: (event) => {
          if (event.kind === "text") updateMessage(assistantID, (message) => ({ ...message, text: message.text + event.delta }))
          if (event.kind === "reasoning") { if (!reasoningID) reasoningID = addMessage("reasoning", "", { hidden: !showReasoning() }); updateMessage(reasoningID, (message) => ({ ...message, text: message.text + event.delta, hidden: !showReasoning() })) }
          if (event.kind === "tool") { const existing = toolCards.get(event.id); const patch = { text: event.title, tool: event.tool, state: event.state, detail: event.detail, output: event.output, diff: event.diff, path: event.path }; if (existing) updateMessage(existing, (message) => ({ ...message, ...patch })); else toolCards.set(event.id, addMessage("tool", event.title, patch)) }
        },
      })
      if (!result.text) updateMessage(assistantID, (message) => ({ ...message, text: "NIMBL finished the tool run." }))
      setActive((session) => ({ ...session, contextTokens: result.usage.totalTokens, contextWindow: modelContextWindow(provider(), model()), updated: Date.now() }))
      const nextLearning = observeLearning(learning(), text, true); setLearning(nextLearning); saveLearning(directory, nextLearning)
      setTokens((value) => value + result.usage.totalTokens); setSaved((value) => value + estimateSavings(result.usage.inputTokens, result.usage.outputTokens))
    } catch (error: any) {
      const message = error?.message || String(error)
      const isTransient = /429|5\d\d|rate limit|timeout|network|econnrefused|econnreset|fetch failed/i.test(message)
      if (isTransient) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          await new Promise((r) => setTimeout(r, attempt * 1000))
          if (abortController()?.signal.aborted) break
          try {
            const retryResult = await runAgent({
              root: directory, provider: provider(), model: model(), apiKey: apiKey(provider()), mode: active().agent, summary: active().summary, learning: learning(), contextWindow: modelContextWindow(provider(), model()),
              messages: active().messages.filter((message) => (message.role === "user" || message.role === "assistant" || message.role === "system") && Boolean(message.text)).map((message) => ({ role: message.role as "user" | "assistant" | "system", text: message.agentText || message.text })),
              abortSignal: abortController()?.signal, requestApproval: askApproval, askQuestion, permissions: settings().permissions,
              onFileChange: (change) => setActive((session) => recordSnapshot(session, { ...change, time: Date.now() })),
              onEvent: (event) => {
                if (event.kind === "text") updateMessage(assistantID, (message) => ({ ...message, text: message.text + event.delta }))
                if (event.kind === "reasoning") { if (!reasoningID) reasoningID = addMessage("reasoning", "", { hidden: !showReasoning() }); updateMessage(reasoningID, (message) => ({ ...message, text: message.text + event.delta, hidden: !showReasoning() })) }
                if (event.kind === "tool") { const existing = toolCards.get(event.id); const patch = { text: event.title, tool: event.tool, state: event.state, detail: event.detail, output: event.output, diff: event.diff, path: event.path }; if (existing) updateMessage(existing, (message) => ({ ...message, ...patch })); else toolCards.set(event.id, addMessage("tool", event.title, patch)) }
              },
            })
            if (!retryResult.text) updateMessage(assistantID, (message) => ({ ...message, text: "NIMBL finished the tool run." }))
            setActive((session) => ({ ...session, contextTokens: retryResult.usage.totalTokens, contextWindow: modelContextWindow(provider(), model()), updated: Date.now() }))
            const retryLearning = observeLearning(learning(), text, true); setLearning(retryLearning); saveLearning(directory, retryLearning)
            setTokens((value) => value + retryResult.usage.totalTokens); setSaved((value) => value + estimateSavings(retryResult.usage.inputTokens, retryResult.usage.outputTokens))
            updateMessage(assistantID, (m) => ({ ...m, text: m.text + "\n\n_[retry " + attempt + " succeeded]_" }))
            return
          } catch (retryError: any) {
            const retryMsg = retryError?.message || String(retryError)
            updateMessage(assistantID, (m) => ({ ...m, text: m.text + "\n\n_[retry " + attempt + " failed: " + retryMsg + "]_" }))
            if (attempt === 3) { updateMessage(assistantID, (message) => ({ ...message, hidden: true })); addMessage("error", "Failed after 3 retries: " + message) }
            if (abortController()?.signal.aborted) break
          }
        }
      } else {
        updateMessage(assistantID, (message) => ({ ...message, hidden: true })); addMessage("error", message)
      }
    }
    finally { setAbortController(null); setLoading(false); persistNow() }
  }
  const execute = (name: string, argument = "") => {
    if (name === "new") return newSession()
    if (name === "sessions") return setDialog("sessions")
    if (name === "timeline") return setDialog("timeline")
    if (name === "rename") { if (!argument.trim()) return addMessage("system", "Usage: /rename <session title>"); setActive((session) => renameSession(session, argument)); return }
    if (name === "fork") { const copy = forkSession(active(), id()); setSessions((all) => [copy, ...all]); setActiveID(copy.id); setView("session"); persist(); return }
    if (name === "pin") { setActive((session) => ({ ...session, pinned: !session.pinned, updated: Date.now() })); return }
    if (name === "delete") { if (sessions().length === 1) return addMessage("error", "Keep at least one session open."); setPendingDelete(activeID()); setDialog("delete"); return }
    if (name === "model") return setDialog("model")
    if (name === "provider") return setDialog("provider")
    if (name === "theme") { const theme = argument.trim() as NimblSettings["theme"]; if (!(["nimbl", "opencode", "mono"] as const).includes(theme)) return addMessage("system", "Usage: /theme nimbl|opencode|mono"); persistSettings({ ...settings(), theme }); addMessage("system", `Theme '${theme}' saved. Restart NIMBL to apply it.`); return }
    if (name === "keybinds") { addMessage("system", Object.entries(settings().keybinds).map(([action, key]) => `${action}: ${key}`).join("\n")); return }
    if (name === "settings") { addMessage("system", ["Theme: " + settings().theme, "MCP servers: " + Object.keys(settings().mcp).length, "Plugins: " + settings().plugins.length, "LSP servers: " + Object.keys(settings().lsp).length, "Custom commands: " + Object.keys(settings().customCommands).length, "Edit permission: " + String(settings().permissions.edit || settings().permissions["*"]), "Shell permission: " + String(settings().permissions.bash || settings().permissions["*"])].join("\n")); return }
    if (name === "route") { const mode = argument.trim() as "local" | "fast" | "budget"; if (!(["local", "fast", "budget"] as const).includes(mode)) return addMessage("system", "Usage: /route local|fast|budget"); const routing = { preferLocal: mode === "local", preferFast: mode === "fast", preferLowCost: mode === "budget" }; persistSettings({ ...settings(), providerRouting: routing }); addMessage("system", `Provider routing now prefers ${mode}.`); return }
    if (name === "init") { const file = directory + "\\NIMBL.md"; if (existsSync(file)) return addMessage("system", "NIMBL.md already exists in this project."); writeFileSync(file, "# NIMBL project instructions\n\n## Goals\n- Prefer small, explainable changes.\n- Keep context focused and token-efficient.\n\n## Verification\n- Run the relevant tests before handoff.\n", "utf8"); addMessage("system", "Created NIMBL.md project instructions."); return }
    if (name === "share") { if (settings().share === "disabled") return addMessage("error", "Sharing is disabled for this project. Use /unshare only to keep it disabled."); const file = "nimbl-share-" + active().id + ".md"; writeFileSync(file, "# " + active().title + "\n\n" + active().messages.map((message) => "## " + message.role + "\n\n" + message.text).join("\n\n")); addMessage("system", "Created local share export " + file + "."); return }
    if (name === "unshare") { persistSettings({ ...settings(), share: "disabled" }); addMessage("system", "Local session sharing disabled for this project."); return }
    const custom = configuredCommands()[name]
    if (custom) { if (custom.agent) changeAgent(custom.agent); if (custom.model) setModel(custom.model); return send(expandCommand(custom, argument)) }
    if (name === "agent") return setDialog("agent")
    if (name === "context") return setDialog("context")
    if (name === "help") return setDialog("help")
    if (name === "details") return setDialog("details")
    if (name === "palette") return setDialog("palette")
    if (name === "thinking") { const next = !showReasoning(); setShowReasoning(next); setActive((session) => ({ ...session, messages: session.messages.map((message) => message.role === "reasoning" ? { ...message, hidden: !next } : message) })); return }
    if (name === "compact") { setActive((session) => compactSession(session)); addMessage("system", "Compacted older context. NIMBL retained a compact session summary and the 12 most recent events."); return }
    if (name === "undo" || name === "redo") { try { const result = name === "undo" ? undoSnapshot(directory, active()) : redoSnapshot(directory, active()); setActive(() => result.session); addMessage("system", result.snapshot ? `${name === "undo" ? "Undid" : "Redid"} ${result.snapshot.path}.` : `Nothing to ${name}.`); } catch (error: any) { addMessage("error", error?.message || String(error)) }; return }
    if (name === "clear") { setActive((session) => ({ ...session, messages: [] })); return }
    if (name === "status") { addMessage("system", "Provider: " + providerName(provider()) + "\nModel: " + model() + "\nAgent: " + active().agent + "\nSession: " + active().title); return }
    if (name === "stats") { addMessage("system", "Session tokens: " + tokens() + "\nEstimated spend: $" + saved().toFixed(4)); return }
    if (name === "export") { const filename = "nimbl-export-" + new Date().toISOString().replace(/[:.]/g, "-") + ".md"; writeFileSync(filename, active().messages.map((message) => "## " + message.role + "\n\n" + message.text).join("\n\n")); addMessage("system", "Exported session to " + filename); return }
    if (name === "quit") { persistNow(); renderer?.destroy(); process.exit(0) }
    if (name === "sidebar") { setSidebarOpen((open) => !open); return }
    if (name === "home") { setView("home"); return }
    if (argument) send("/" + name + " " + argument)
  }
  function submit(value: string) {
    const text = value.trim()
    if (commandOpen() && text.startsWith("/")) {
      const choice = commandMatches()[commandIndex()]
      if (choice && (text === "/" + choice[0] || text.startsWith("/" + choice[0] + " "))) {
        execute(choice[0]); setInput(""); setCommandOpen(false); return
      }
    }
    if (text.startsWith("/")) { const [slash, ...rest] = text.slice(1).split(/\s+/); if (availableCommands().some(([name]) => name === slash)) { execute(slash, rest.join(" ")); setInput(""); setCommandOpen(false); return } }
    send(text)
  }
  function inputChange(value: string) { setInput(value); setCommandOpen(value.startsWith("/") && !value.includes(" ")); setCommandIndex(0) }
  function inputKey(event: any) {
    if (event.key === "Escape") { event.preventDefault(); setCommandOpen(false); return }
    if (!commandOpen()) return
    const length = commandMatches().length
    if (event.key === "ArrowDown" && length) { event.preventDefault(); setCommandIndex((current) => (current + 1) % length) }
    if (event.key === "ArrowUp" && length) { event.preventDefault(); setCommandIndex((current) => (current - 1 + length) % length) }
  }
  const providerList = createMemo(() => [...PROVIDERS].sort((a, b) => Number(Boolean(apiKey(b.id))) - Number(Boolean(apiKey(a.id)))).map((item) => ({ value: item.id, title: item.name, description: item.description, connected: Boolean(apiKey(item.id)), current: provider() === item.id, category: apiKey(item.id) ? "Connected" : "Providers" })))
  const models = createMemo(() => modelOptions().map((item) => ({ ...item, current: item.value === provider() + "::" + model() })))
  const sessionList = createMemo(() => [...sessions()].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.updated || b.created) - (a.updated || a.created)).map((session) => ({ value: session.id, title: (session.pinned ? "● " : "") + session.title, description: session.id + " · " + session.messages.length + " messages", current: session.id === activeID() })))
  const timelineList = createMemo(() => active().messages.filter((message) => message.role === "user").slice().reverse().map((message) => ({ value: message.id, title: message.text.replace(/\s+/g, " ").slice(0, 80), description: new Date(message.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })))

  function Prompt(props: { home?: boolean } = {}) {
    // Focus follows the active view: blur when hidden or a dialog is open;
    // reclaim focus otherwise (OpenCode's pattern, prompt/index.tsx:634-644).
    let promptEl: any
    const visibleHere = () => (props.home ? view() === "home" : view() === "session")
    createEffect(() => {
      dialog()
      if (!promptEl || promptEl.isDestroyed) return
      if (!visibleHere() || dialog() !== null) { if (promptEl.focused) promptEl.blur?.(); return }
      if (!promptEl.focused) promptEl.focus?.()
    })
    // OpenCode-style prompt frame: SplitBorder left rail, ╹ chamfer, ▀ underline, space-between hint bar.
    return <box flexDirection="column" width="100%" height={7} position="relative">
      <Show when={commandOpen() && commandMatches().length > 0}>
        <box position="absolute" bottom={7} left={0} zIndex={200} width="100%" border={["left", "right"]} borderColor={C.dim} customBorderChars={LeftRule}>
          <box flexDirection="column" height={Math.min(10, commandMatches().length)} backgroundColor={C.promptSurface}>
            <For each={commandMatches()}>{(command, index) => {
              const selected = () => index() === commandIndex()
              return <box flexDirection="row" paddingLeft={1} paddingRight={1} backgroundColor={selected() ? C.accentHi : undefined} onMouseOver={() => setCommandIndex(index())} onMouseUp={() => { execute(command[0]); setInput(""); setCommandOpen(false) }}><text fg={selected() ? C.selFg : C.text} flexShrink={0}>/{command[0]}</text><text fg={selected() ? C.selFg : C.mute} wrapMode="none">{" " + command[1]}<span style={{ fg: selected() ? C.selFg : C.dim }}> — {command[2]}</span></text></box>
            }}</For>
          </box>
        </box>
      </Show>
      <box width="100%" height={5} border={["left"]} borderColor={modeAccent(active().agent)} customBorderChars={PromptRule}>
        <box width="100%" height={5} flexDirection="column" paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} backgroundColor={C.promptSurface}>
          <input height={1} flexShrink={0} value={input()} placeholder={props.home ? 'Ask anything... "Fix broken tests"' : active().agent === "plan" ? "Describe what you want to understand or plan..." : "Ask NIMBL to help with your code..."} placeholderColor={C.mute} fg={C.text} backgroundColor={C.promptSurface} focusedBackgroundColor={C.promptSurface} onInput={inputChange} onKeyDown={inputKey} onSubmit={submit} focused={visibleHere() && dialog() === null} ref={(node: any) => { promptEl = node; if (visibleHere()) inputEl = node }} />
          <box flexDirection="row" height={1} paddingTop={1} gap={1} justifyContent="space-between">
            <text fg={modeAccent(active().agent)} attributes="bold">{modeLabel(active().agent)}</text>
            <box flexDirection="row" gap={1}>
              <text fg={C.mute}>·</text>
              <text fg={C.text}>{model()}</text>
              <text fg={C.mute}>{providerName(provider())}</text>
            </box>
          </box>
        </box>
      </box>
      <box height={1} border={["left"]} borderColor={modeAccent(active().agent)} customBorderChars={PromptBottom}>
        <box height={1} border={["bottom"]} borderColor={C.promptSurface} customBorderChars={{ ...EmptyBorder, horizontal: "▀" }}/>
      </box>
      <box width="100%" flexDirection="row" height={1} justifyContent="space-between">
        <box flexDirection="row" gap={2}>
          <Show when={!loading()} fallback={<box flexDirection="row" gap={1}><Spinner/><text fg={C.mute}>interrupt</text></box>}>
            <text fg={C.text} attributes="bold">tab</text><text fg={C.mute}>agents</text>
          </Show>
          <text fg={C.text} attributes="bold">ctrl+p</text><text fg={C.mute}>commands</text>
        </box>
        <Show when={!props.home}><text fg={C.mute} wrapMode="none">{directory}</text></Show>
      </box>
    </box>
  }

  function Sidebar() {
    return <box width={28} flexShrink={0} flexDirection="column" backgroundColor={C.surface} paddingTop={1}>
      <box paddingLeft={2} paddingRight={1} flexDirection="row"><text fg={C.textHi} attributes="bold">Sessions</text><box flexGrow={1}/><text fg={C.accentHi} onMouseUp={newSession}>+ new</text></box>
      <box height={1}/><For each={sessions().slice(0, Math.max(3, dims().height - 8))}>{(session) => <box paddingLeft={2} paddingRight={1} backgroundColor={session.id === activeID() ? C.accentLo : undefined} onMouseUp={() => { setActiveID(session.id); setView("session") }}><text fg={session.id === activeID() ? C.textHi : C.text} attributes={session.id === activeID() ? "bold" : undefined} wrapMode="none">{session.title}</text></box>}</For>
      <box flexGrow={1}/><box paddingLeft={2} paddingBottom={1}><text fg={C.dim}>/sessions  /new</text></box>
    </box>
  }
  function Timeline() {
    return <box flexGrow={1} minHeight={0} flexDirection="column" paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
      <box flexDirection="row" height={1}><text fg={C.textHi} attributes="bold">{active().title}</text><box flexGrow={1}/></box>
      <scrollbox ref={(node: any) => { timelineScroll = node }} flexGrow={1} minHeight={0} paddingTop={1} scrollAcceleration={1} scrollbarOptions={{ visible: true }}><Show when={active().messages.length > 0} fallback={<box paddingLeft={1} paddingTop={2}><text fg={C.mute}>Start with a question, a bug, or a coding task. NIMBL will keep the session focused and token-aware.</text></box>}><box flexDirection="column">
        <For each={active().messages}>{(message) => {
          if (message.role === "user") return <Show when={!message.hidden}><box border={["left"]} borderColor={modeAccent(active().agent)} customBorderChars={LeftRule} backgroundColor={C.surface} paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} marginBottom={1} onMouseUp={() => openMessageActions(message.id)}><MarkdownText text={message.agentText || message.text}/></box></Show>
          if (message.role === "reasoning") return <Show when={!message.hidden}><box border={["left"]} borderColor={C.mute} customBorderChars={LeftRule} paddingLeft={2} paddingTop={1}><text fg={C.dim}>Thinking · {message.text.slice(0, 120)}{message.text.length > 120 ? "…" : ""}</text></box></Show>
          if (message.role === "error") return <Show when={!message.hidden}><box border={["left"]} borderColor={C.err} customBorderChars={LeftRule} backgroundColor={C.surface} paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} marginBottom={1}><text fg={C.err}>{message.text}</text></box></Show>
          if (message.role === "system") return <Show when={!message.hidden}><box paddingLeft={3} paddingTop={0} height={1}><text fg={C.dim}>{message.text.replace(/\s+/g, " ").slice(0, 120)}</text></box></Show>
          if (message.role === "tool") return <Show when={!message.hidden}><box flexDirection="column" paddingLeft={3}>
            <box flexDirection="row" gap={1} height={1}>
              <Show when={message.state === "running"} fallback={<Show when={message.state === "failed"} fallback={<text fg={C.dim}>✓</text>}><text fg={C.err}>✕</text></Show>}><Spinner/></Show>
              <text fg={C.dim}>{message.tool || "Tool"}</text>
              <text fg={C.mute} wrapMode="none">{message.text}</text>
              <Show when={message.diff}><text fg={C.info}>diff</text></Show>
            </box>
            <Show when={message.output}><scrollbox height={Math.min(6, (message.output?.match(/\n/g) || []).length + 1)} backgroundColor={C.bg} paddingLeft={1} scrollbarOptions={{visible: false}}><text fg={C.mute}>{message.output.length > 800 ? message.output.slice(0,800) + "…" : message.output}</text></scrollbox></Show>
            <Show when={!message.output && message.detail}><text fg={C.mute} wrapMode="none">{message.detail.slice(0, 200)}</text></Show>
          </box></Show>
          return <Show when={!message.hidden}><box paddingLeft={2} paddingRight={2} paddingTop={0} paddingBottom={1}><MarkdownText text={message.text}/></box></Show>
        }}</For>
        <Show when={loading()}><box border={["left"]} borderColor={modeAccent(active().agent)} customBorderChars={LeftRule} paddingLeft={2} flexDirection="row" gap={1}><Spinner/><text fg={C.mute}>NIMBL is working…</text></box></Show>
      </box></Show></scrollbox>
      <Prompt/>
    </box>
  }

  return <Show when={dims().width >= 60 && dims().height >= 18} fallback={<box width={dims().width} height={dims().height} alignItems="center" justifyContent="center" backgroundColor={C.bg}><box flexDirection="column"><text fg={C.textHi} attributes="bold">NIMBL needs more terminal space</text><text fg={C.mute}>Resize to at least 60 columns × 18 rows.</text></box></box>}><box width={dims().width} height={dims().height}>
    <box flexDirection="column" width={dims().width} height={dims().height} backgroundColor={C.bg}>
      <Show when={view() === "session"}><box position="absolute" top={0} left={0} width={dims().width} height={dims().height} flexDirection="row" minHeight={0}><Timeline/><Show when={sidebarOpen()}><Sidebar/></Show></box></Show>
      <Show when={view() === "home"}><box position="absolute" top={0} left={0} width={dims().width} height={dims().height} flexDirection="column" alignItems="center" paddingLeft={2} paddingRight={2} backgroundColor={C.bg}>
          <box flexGrow={1}/><box height={4} flexShrink={1}/><box flexDirection="column" padding={{ left: 2 }}><For each={homeLogo()}>{(line) => <text fg={C.accent}>{line}</text>}</For></box><box height={1}/><box padding={{ left: 2 }}><text fg={C.text}>Token-efficient AI coding companion</text></box><box padding={{ left: 2 }}><text fg={C.mute}>Learn more. Use fewer tokens.</text></box><box height={1}/>
          <box width={homePromptWidth()} paddingTop={1} flexShrink={0}><Prompt home/></box>
          <box flexGrow={1}/>
      </box></Show>
    </box>
    <Show when={dialog() !== null}><box position="absolute" zIndex={3000} width={dims().width} height={dims().height} alignItems="center" paddingTop={Math.floor(dims().height / 4)} left={0} top={0} backgroundColor={RGBA.fromInts(0, 0, 0, 150)} onMouseUp={() => dialog() === "approval" ? undefined : close()}><box width={60} maxWidth={dims().width - 2} backgroundColor={C.surface} paddingTop={1} onMouseUp={(event: any) => event.stopPropagation()}>
      <Show when={dialog() === "model"}><Picker title="Select model" options={models()} onSelect={chooseModel} onClose={close} footer={[["enter", "select"], ["esc", "close"]]} /></Show>
      <Show when={dialog() === "provider"}><Picker title="Connect a provider" options={providerList()} onSelect={chooseProvider} onClose={close} footer={[["enter", "connect"], ["esc", "close"]]} /></Show>
      <Show when={dialog() === "agent"}><Picker title="Select agent" options={[{ value: "build", title: "Build", description: "The only mode allowed to make approved changes", current: active().agent === "build" }, { value: "plan", title: "Plan", description: "Read-only investigation and implementation plan", current: active().agent === "plan" }, { value: "explain", title: "Explain", description: "Read-only code explanation and trade-offs", current: active().agent === "explain" }, { value: "learn", title: "Learn", description: "Read-only Socratic hints and practice", current: active().agent === "learn" }]} onSelect={changeAgent} onClose={close}/></Show>
      <Show when={dialog() === "sessions"}><Picker title="Sessions" options={sessionList()} onSelect={(value) => { setActiveID(value); setView("session"); persist(); close() }} onClose={close}/></Show>
      <Show when={dialog() === "timeline"}><Picker title="Timeline" options={timelineList()} onSelect={(value) => { setSelectedMessageID(value); setDialog("message") }} onClose={close}/></Show>
      <Show when={dialog() === "message" && selectedMessage()}><Picker title="Message actions" options={messageActionOptions()} onSelect={chooseMessageAction} onClose={close}/></Show>
      <Show when={dialog() === "connect"}><ApiKeyDialog onSubmit={connect} onClose={close}/></Show>
      <Show when={dialog() === "approval" && pendingApproval()}><box flexDirection="column" paddingLeft={3} paddingRight={3} paddingBottom={1} gap={1}><box flexDirection="row" justifyContent="space-between"><text fg={C.warn} attributes="bold">Approval required</text><text fg={C.dim}>esc reject</text></box><text fg={C.textHi} attributes="bold">{pendingApproval()!.request.title}</text><text fg={C.mute}>{pendingApproval()!.request.detail}</text><Show when={pendingApproval()!.request.diff}><scrollbox height={5} backgroundColor={C.bg} scrollbarOptions={{ visible: false }}><text fg={C.text}>{pendingApproval()!.request.diff}</text></scrollbox></Show><box flexDirection="row" gap={2} paddingTop={1}><text fg={C.ok} onMouseUp={() => answerApproval("once")}>[Enter] allow once</text><text fg={C.info} onMouseUp={() => answerApproval("always")}>[A] always</text><text fg={C.err} onMouseUp={() => answerApproval("reject")}>[Esc] reject</text></box></box></Show>
      <Show when={dialog() === "question" && pendingQuestion()}><Picker title={pendingQuestion()!.prompt} options={pendingQuestion()!.options.map((value) => ({ value, title: value }))} onSelect={answerQuestion} onClose={close}/></Show>
      <Show when={dialog() === "delete"}><Picker title="Delete this session?" options={[{ value: "cancel", title: "Keep session", description: "Esc also cancels" }, { value: "delete", title: "Delete session", description: "Remove its local conversation history" }]} onSelect={(value) => value === "delete" ? deleteSession() : close()} onClose={close}/></Show>
      <Show when={dialog() === "details"}><DetailDialog title="Session details" lines={["Provider: " + providerName(provider()), "Model: " + model(), "Mode: " + active().agent, "Messages: " + active().messages.length, "Last request context: " + formatTokens(active().contextTokens || 0) + " / " + formatTokens(active().contextWindow || modelContextWindow(provider(), model())) + " (" + Math.min(999, Math.round(((active().contextTokens || 0) / (active().contextWindow || modelContextWindow(provider(), model()))) * 100)) + "%)", "Session estimate: " + formatTokens(contextEstimate(active().messages.filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system"), active().summary || "")) + " tokens", "Observed model tokens: " + formatTokens(tokens()), "Estimated baseline cost: $" + saved().toFixed(4)]} onClose={close}/></Show>
      <Show when={dialog() === "palette"}><Picker title="Command palette" options={availableCommands().map(([value, title, description]) => ({ value, title, description }))} onSelect={(value) => { execute(value); close() }} onClose={close}/></Show>
      <Show when={dialog() === "context"}><DetailDialog title="Context" lines={["Model window: " + formatTokens(active().contextWindow || modelContextWindow(provider(), model())) + " max", "Last request: " + formatTokens(active().contextTokens || 0) + " (" + Math.min(999, Math.round(((active().contextTokens || 0) / (active().contextWindow || modelContextWindow(provider(), model()))) * 100)) + "%)", "", "NIMBL selects relevant local files and keeps a response reserve inside your model's own context window.", "It does not impose a separate 4K, 16K, or 30K context cap.", "", "Set NIMBL_CONTEXT_WINDOW to override the displayed limit for a custom local or routed model."]} onClose={close}/></Show>
      <Show when={dialog() === "help"}><DetailDialog title="Keyboard shortcuts" lines={["Tab        cycle Build / Plan / Explain / Learn", "/          commands", "Ctrl+P     command palette", "Ctrl+M     actions for the latest prompt", "/sidebar   toggle session sidebar", "/home      return to home screen", "Esc        return home (empty prompt) or close dialog", "↑ / ↓      move picker selection", "Enter      select", "Mouse wheel scroll picker", "/sessions  switch sessions"]} onClose={close}/></Show>
    </box></box></Show>
  </box></Show>
}

let renderer: any
if (process.env.NIMBL_TEST_RENDERER !== "1") {
  renderer = await createCliRenderer({ externalOutputMode: "passthrough", targetFps: 30 })
  try { await render(() => <App/>, renderer) }
  catch (error: any) { writeFileSync("nimbl-error.log", "TUI CRASH:\n" + (error?.stack || String(error))); process.exit(1) }
}

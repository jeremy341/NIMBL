// @ts-nocheck
import { render, useTerminalDimensions } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"
import { createSignal, For, Show, onCleanup, onMount, createMemo, Index } from "solid-js"
import { resolveConfig } from "@/config"
import { sendChat, estimateSavings } from "@/core/api"
import { DEFAULTS } from "@/core/provider-defaults"
import { writeFileSync } from "fs"

const C = {
  bg:       "#0a0a0a",
  surface:  "#111111",
  accent:   "#06402b",
  accentHi: "#0a5c3e",
  accentLo: "#042e1f",
  text:     "#e0e0e0",
  textHi:   "#ffffff",
  mute:     "#808080",
  dim:      "#505050",
  err:      "#e06c75",
  ok:       "#7fd88f",
  barText:  "#b4c8be",
}

const LOGO = [
  "  ███╗   ██╗ ██╗ ███╗   ███╗ ██████╗  ██╗",
  "  ████╗  ██║ ██║ ████╗ ████║ ██╔══██╗ ██║",
  "  ██╔██╗ ██║ ██║ ██╔████╔██║ ██████╔╝ ██║",
  "  ██║╚██╗██║ ██║ ██║╚██╔╝██║ ██╔══██╗ ██║",
  "  ██║ ╚████║ ██║ ██║ ╚═╝ ██║ ██████╔╝ ███████╗",
  "  ╚═╝  ╚═══╝ ╚═╝ ╚═╝     ╚═╝ ╚═════╝  ╚══════╝",
]

interface Msg { role: "user" | "nimb" | "err"; text: string }

const EmptyBorder = {
  topLeft: "", bottomLeft: "", vertical: "",
  topRight: "", bottomRight: "", horizontal: " ",
  bottomT: "", topT: "", cross: "", leftT: "", rightT: "",
}
const ChatBorder = { ...EmptyBorder, vertical: "┃" }
const PromptBorder = { ...EmptyBorder, vertical: "┃", bottomLeft: "╹" }
const PromptBottomBorder = { ...EmptyBorder, vertical: "╹" }

const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

function LoadingDots() {
  const [frame, setFrame] = createSignal(0)
  onMount(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % spinnerFrames.length), 80)
    onCleanup(() => clearInterval(id))
  })
  return <text fg={C.accent}>{spinnerFrames[frame()]}</text>
}

function statusBar(provider: string, model: string, tokens: number, saved: number) {
  return (
    <box flexDirection="row" backgroundColor={C.accent} height={1} flexShrink={0}>
      <text fg={C.textHi}> NIMBL </text>
      <text fg={C.barText}> {provider} / {model} </text>
      <box flexGrow={1} />
      <Show when={tokens > 0} fallback={<text fg={C.textHi}> </text>}>
        <text fg={C.textHi}> ⚡{tokens}t · ${saved.toFixed(4)} </text>
      </Show>
    </box>
  )
}

const SLASH_COMMANDS = [
  { slash: "quit",     title: "Quit",     desc: "Exit NIMBL" },
  { slash: "clear",    title: "Clear",    desc: "Clear all messages" },
  { slash: "help",     title: "Help",     desc: "Show available commands" },
  { slash: "model",    title: "Model",    desc: "Switch model (/model <name>)" },
  { slash: "provider", title: "Provider", desc: "Switch provider (/provider freellmapi|openrouter)" },
  { slash: "stats",    title: "Stats",    desc: "Show token usage statistics" },
  { slash: "status",   title: "Status",   desc: "Show current configuration" },
  { slash: "export",   title: "Export",   desc: "Export conversation to file" },
]

function getApiKey(provider: string): string {
  const key = provider === "openrouter"
    ? (process.env.OPENROUTER_KEY || DEFAULTS.fallback.apiKey)
    : (process.env.FREELLMAPI_KEY || DEFAULTS.primary.apiKey)
  if (!key) throw new Error(`No API key for ${provider}. Set ${provider === "openrouter" ? "OPENROUTER_KEY" : "FREELLMAPI_KEY"} env var.`)
  return key
}

function providerLabel(p: string): string {
  return p === "freellmapi" ? "FreeLLM API" : p === "openrouter" ? "OpenRouter" : p
}

function Autocomplete(props: {
  filter: string
  selected: number
  onSelect: (i: number) => void
  onHover: (i: number) => void
  visible: boolean
}) {
  const filtered = createMemo(() => {
    const q = props.filter.toLowerCase()
    if (!q) return SLASH_COMMANDS
    return SLASH_COMMANDS.filter((c) => c.slash.startsWith(q) || c.title.toLowerCase().startsWith(q))
  })

  return (
    <Show when={props.visible && filtered().length > 0}>
      <box
        border={["left"]}
        borderColor={C.accentHi}
        customBorderChars={ChatBorder}
        backgroundColor={C.surface}
      >
        <scrollbox height={Math.min(8, filtered().length)}>
          <Index each={filtered()}>
            {(cmd, i) => (
              <box
                flexDirection="row"
                paddingLeft={2}
                paddingRight={2}
                backgroundColor={i === props.selected ? C.accent : undefined}
                onMouseOver={() => props.onHover(i)}
                onMouseDown={() => props.onHover(i)}
                onMouseUp={() => props.onSelect(i)}
              >
                <text
                  fg={i === props.selected ? C.textHi : C.accentHi}
                  flexShrink={0}
                >
                  /{cmd().slash}
                </text>
                <text
                  fg={i === props.selected ? C.textHi : C.mute}
                  wrapMode="none"
                >
                  {"  "}{cmd().title} — {cmd().desc}
                </text>
              </box>
            )}
          </Index>
        </scrollbox>
      </box>
    </Show>
  )
}

function App() {
  const cliConfig = resolveConfig(process.argv)

  const [view, setView] = createSignal<"home" | "chat">("home")
  const [msgs, setMsgs] = createSignal<Msg[]>([])
  const [input, setInput] = createSignal("")
  const [loading, setLoading] = createSignal(false)
  const [tokens, setTokens] = createSignal(0)
  const [saved, setSaved] = createSignal(0)
  const [acVisible, setAcVisible] = createSignal(false)
  const [acSelected, setAcSelected] = createSignal(0)
  const [currentProvider, setCurrentProvider] = createSignal(cliConfig.provider)
  const [currentModel, setCurrentModel] = createSignal(cliConfig.model)

  const dims = useTerminalDimensions()
  let scrollEl: any
  let inputEl: any

  const curProviderLabel = createMemo(() => providerLabel(currentProvider()))

  function addMsg(m: Msg) {
    setMsgs((p) => [...p, m])
  }

  function filteredCommands(q: string) {
    const lq = q.toLowerCase()
    return SLASH_COMMANDS.filter((c) => c.slash.startsWith(lq) || c.title.toLowerCase().startsWith(lq))
  }

  function handleQuit() {
    renderer.setTerminalTitle("")
    if (!renderer.isDestroyed) renderer.destroy()
    process.exit(0)
  }

  function handleClear() {
    setMsgs([])
    setTokens(0)
    setSaved(0)
  }

  function handleHelp() {
    const lines = SLASH_COMMANDS.map((c) => `  /${c.slash}  ${c.title} — ${c.desc}`)
    addMsg({ role: "nimb", text: "Available commands:\n" + lines.join("\n") })
  }

  function handleModel(args: string) {
    if (!args) {
      addMsg({ role: "nimb", text: `Current model: ${currentModel()}\nUsage: /model <name>  (e.g., /model auto or /model deepseek/deepseek-chat)` })
      return
    }
    setCurrentModel(args)
    addMsg({ role: "nimb", text: `Switched model to: ${args}` })
  }

  function handleProvider(args: string) {
    if (!args) {
      addMsg({ role: "nimb", text: `Current provider: ${currentProvider()}\nUsage: /provider freellmapi | openrouter` })
      return
    }
    const p = args.toLowerCase()
    if (p !== "freellmapi" && p !== "openrouter") {
      addMsg({ role: "err", text: `Unknown provider: ${args}. Use: freellmapi or openrouter` })
      return
    }
    setCurrentProvider(p)
    addMsg({ role: "nimb", text: `Switched provider to: ${providerLabel(p)}` })
  }

  function handleStats() {
    const t = tokens()
    addMsg({
      role: "nimb",
      text: [
        `Session token usage:`,
        `  Total tokens: ${t}`,
        `  Est. cost saved: $${saved().toFixed(4)} (vs GPT-4o)`,
        `  Messages: ${msgs().length}`,
      ].join("\n"),
    })
  }

  function handleStatus() {
    const p = currentProvider()
    const key = getApiKey(p)
    const keyDisplay = key ? `${key.slice(0, 8)}...` : "(none)"
    addMsg({
      role: "nimb",
      text: [
        `Configuration:`,
        `  Provider: ${providerLabel(p)} (${p})`,
        `  Model: ${currentModel()}`,
        `  API Key: ${keyDisplay}`,
        `  Session tokens: ${tokens()}`,
        `  Est. cost saved: $${saved().toFixed(4)}`,
      ].join("\n"),
    })
  }

  function handleExport() {
    const ms = msgs()
    if (ms.length === 0) {
      addMsg({ role: "err", text: "No messages to export." })
      return
    }
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
    const filename = `nimbl-export-${ts}.md`
    const lines = ms.map((m) => {
      const label = m.role === "user" ? "**You**" : m.role === "err" ? "**Error**" : "**NIMBL**"
      return `${label}:\n${m.text}\n`
    })
    const content = `# NIMBL Conversation Export\n\nDate: ${new Date().toISOString()}\nProvider: ${providerLabel(currentProvider())} / ${currentModel()}\nTokens: ${tokens()}\nCost saved: $${saved().toFixed(4)}\n\n---\n\n${lines.join("\n")}`
    writeFileSync(filename, content, "utf-8")
    addMsg({ role: "nimb", text: `Exported ${ms.length} messages to ${filename}` })
  }

  const CMD_MAP: Record<string, (args: string) => void> = {
    quit: handleQuit,
    clear: handleClear,
    help: handleHelp,
    model: handleModel,
    provider: handleProvider,
    stats: handleStats,
    status: handleStatus,
    export: handleExport,
  }

  function handleCmd(t: string): boolean {
    const parts = t.slice(1).split(/\s+/)
    const cmd = parts[0].toLowerCase()
    const args = parts.slice(1).join(" ")
    const handler = CMD_MAP[cmd]
    if (handler) {
      // For quit/clear, handle synchronously and don't add a message
      if (cmd === "quit") handler(args)
      else if (cmd === "clear") handler(args)
      else {
        setView("chat")
        handler(args)
      }
      return true
    }
    return false
  }

  const handleSend = async (text: string) => {
    setView("chat")
    addMsg({ role: "user", text })
    setInput("")
    setLoading(true)
    try {
      const p = currentProvider()
      const cfg = { provider: p, model: currentModel(), apiKey: getApiKey(p) }
      const r = await sendChat(text, cfg)
      addMsg({ role: "nimb", text: r.text })
      setTokens((v) => v + r.usage.totalTokens)
      setSaved((v) => v + parseFloat(estimateSavings(r.usage.inputTokens, r.usage.outputTokens)))
    } catch (e: any) {
      addMsg({ role: "err", text: e.message || String(e) })
    } finally {
      setLoading(false)
      setTimeout(() => { if (scrollEl && !scrollEl.isDestroyed) scrollEl.scrollTo(scrollEl.scrollHeight) }, 50)
    }
  }

  const handleSubmit = async (text: string) => {
    const t = text.trim()
    if (!t) return

    if (acVisible()) {
      const q = input().slice(1)
      const filtered = filteredCommands(q)
      const idx = acSelected()
      // If filtered has exactly 1 match and Enter pressed, run it
      if (idx >= 0 && idx < filtered.length) {
        const cmd = filtered[idx]
        const cmdStr = "/" + cmd.slash
        if (t === cmdStr || t.startsWith(cmdStr + " ")) {
          handleCmd(t)
          setAcVisible(false)
          return
        }
      }
      // Otherwise fill input from autocomplete selection
      if (idx >= 0 && idx < filtered.length) {
        const cmd = filtered[idx]
        setInput("/" + cmd.slash + " ")
        setAcVisible(false)
      }
      return
    }

    if (handleCmd(t)) { setAcVisible(false); return }
    await handleSend(t)
  }

  function onInputHandler(v: string) {
    setInput(v)
    if (v.startsWith("/") && !v.includes(" ")) {
      const q = v.slice(1)
      // Check if it's an exact cmd match with no args → show autocomplete for sub-args
      const exactCmd = SLASH_COMMANDS.find((c) => c.slash === q)
      // If exact match and command takes args, still show autocomplete (to allow Enter to execute)
      setAcVisible(true)
      setAcSelected(0)
    } else {
      setAcVisible(false)
    }
  }

  function onKeyDownHandler(e: any) {
    if (acVisible()) {
      const q = input().slice(1)
      const filtered = filteredCommands(q)
      const len = filtered.length
      if (len === 0) return
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setAcSelected((i) => (i + 1) % len)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setAcSelected((i) => (i - 1 + len) % len)
      } else if (e.key === "Escape") {
        e.preventDefault()
        setAcVisible(false)
      }
    }
  }

  function onSubmitHandler(v: string) { handleSubmit(v) }

  function chatPrompt() {
    return (
      <box flexDirection="column" width="100%">
        <Autocomplete
          filter={input().slice(1)}
          selected={acSelected()}
          visible={acVisible()}
          onSelect={(i) => {
            const q = input().slice(1)
            const filtered = filteredCommands(q)
            const cmd = filtered[i]
            if (cmd) {
              setInput("/" + cmd.slash + " ")
              setAcVisible(false)
              if (inputEl) inputEl.focus()
            }
          }}
          onHover={(i) => setAcSelected(i)}
        />
        <box border={["left"]} borderColor={C.accentHi} customBorderChars={PromptBorder}>
          <box paddingLeft={2} paddingRight={2} backgroundColor={C.surface} width="100%">
            <input
              value={input()}
              width="100%"
              placeholder="Ask anything..."
              placeholderColor={C.dim}
              fg={C.text}
              onInput={onInputHandler}
              onSubmit={onSubmitHandler}
              onKeyDown={onKeyDownHandler}
              focused={true}
              backgroundColor={C.surface}
              ref={(r: any) => { inputEl = r }}
            />
          </box>
        </box>
        <box
          height={1}
          border={["left"]}
          borderColor={C.accentHi}
          customBorderChars={PromptBottomBorder}
        >
          <box
            height={1}
            border={["bottom"]}
            borderColor={C.surface}
            customBorderChars={{ ...EmptyBorder, horizontal: "▀" }}
          />
        </box>
      </box>
    )
  }

  return (
    <box flexDirection="column" width={dims().width} height={dims().height} backgroundColor={C.bg}>
      {statusBar(curProviderLabel(), currentModel(), tokens(), saved())}

      <Show when={view() === "home"} fallback={
        <box flexDirection="row" flexGrow={1} minHeight={0}>
          <box flexGrow={1} minHeight={0} paddingBottom={1} paddingLeft={2} paddingRight={2} gap={1} flexDirection="column">
            <scrollbox
              ref={(r: any) => { scrollEl = r }}
              flexGrow={1}
            >
              <box height={1} />
              <For each={msgs()}>
                {(m, i) => {
                  const isUser = m.role === "user"
                  const isErr = m.role === "err"
                  const label = isUser ? "You" : isErr ? "Error" : "NIMBL"
                  const bar = isUser ? C.accentHi : isErr ? C.err : C.dim
                  const bg = C.surface

                  if (isErr) {
                    return (
                      <box
                        border={["left"]}
                        borderColor={C.err}
                        customBorderChars={ChatBorder}
                        marginTop={i() === 0 ? 0 : 1}
                      >
                        <box paddingTop={1} paddingBottom={1} paddingLeft={2} backgroundColor={bg}>
                          <text fg={C.err}>{m.text}</text>
                        </box>
                      </box>
                    )
                  }

                  return (
                    <box
                      border={["left"]}
                      borderColor={bar}
                      customBorderChars={ChatBorder}
                      marginTop={i() === 0 ? 0 : 1}
                    >
                      <box paddingTop={1} paddingBottom={1} paddingLeft={2} backgroundColor={bg}>
                        <box flexDirection="row" gap={1} alignItems="center">
                          <box width={1} height={1} backgroundColor={bar} />
                          <text fg={bar}>{label}</text>
                        </box>
                        <box paddingTop={1}>
                          <text fg={C.text}>{m.text}</text>
                        </box>
                      </box>
                    </box>
                  )
                }}
              </For>
              <Show when={loading()}>
                <box marginTop={1} paddingLeft={3}>
                  <box flexDirection="row" gap={1}>
                    <LoadingDots />
                    <text fg={C.accent}>Thinking...</text>
                  </box>
                </box>
              </Show>
            </scrollbox>
            <box flexShrink={0}>
              {chatPrompt()}
            </box>
          </box>
        </box>
      }>
        <box flexDirection="column" flexGrow={1} alignItems="center" backgroundColor={C.bg}>
          <box flexGrow={1} />
          <box flexDirection="column" padding={{ left: 2 }}>
            {LOGO.map((line) => <text fg={C.accent}>{line}</text>)}
          </box>
          <box height={2} />
          <box padding={{ left: 2 }}><text fg={C.text}>Token-efficient AI coding companion</text></box>
          <box padding={{ left: 2 }}><text fg={C.mute}>Learn more. Use fewer tokens.</text></box>
          <box height={2} />
          <box width={Math.min(80, Math.floor(dims().width * 0.7))} flexDirection="column">
            <Autocomplete
              filter={input().slice(1)}
              selected={acSelected()}
              visible={acVisible() && view() === "home"}
              onSelect={(i) => {
                const q = input().slice(1)
                const filtered = filteredCommands(q)
                const cmd = filtered[i]
                if (cmd) {
                  setInput("/" + cmd.slash + " ")
                  setAcVisible(false)
                }
              }}
              onHover={(i) => setAcSelected(i)}
            />
            <box border={["left"]} borderColor={C.accentHi} customBorderChars={PromptBorder}>
              <box paddingLeft={2} paddingRight={2} backgroundColor={C.surface} width="100%">
                <input
                  value={input()}
                  width="100%"
                  placeholder="Ask anything or type a coding task..."
                  placeholderColor={C.dim}
                  fg={C.text}
                  onInput={onInputHandler}
                  onSubmit={onSubmitHandler}
                  onKeyDown={onKeyDownHandler}
                  focused={true}
                  backgroundColor={C.surface}
                  ref={(r: any) => { inputEl = r }}
                />
              </box>
            </box>
            <box height={1} />
            <box padding={{ left: 1 }}>
              <text fg={C.dim}>Commands: /help  /model  /provider  /stats  /status  /export  /clear  /quit</text>
            </box>
          </box>
          <box flexGrow={1} />
        </box>
      </Show>
    </box>
  )
}

const renderer = await createCliRenderer({
  externalOutputMode: "passthrough",
  targetFps: 30,
})

try {
  await render(() => <App />, renderer)
} catch (e: any) {
  const msg = e instanceof Error ? e.message : String(e)
  writeFileSync("nimbl-error.log", `TUI CRASH:\n${msg}\n\n${e instanceof Error ? e.stack || "" : ""}\n`)
  process.exit(1)
}

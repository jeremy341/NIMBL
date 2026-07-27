import React from "react"
import { Box, Text } from "ink"
import { C } from "./theme"
import { HomeScreen } from "./home"
import { ChatScreen, type Message } from "./chat"
import type { ResolvedConfig } from "@/config"
import { sendChat, estimateSavings } from "@/core/api"
import { DEFAULTS } from "@/core/provider-defaults"
import { writeFileSync } from "fs"

interface AppProps {
  config: ResolvedConfig
}

function getApiKey(provider: string): string {
  if (provider === "openrouter") {
    return process.env.OPENROUTER_KEY || DEFAULTS.fallback.apiKey
  }
  return process.env.FREELLMAPI_KEY || DEFAULTS.primary.apiKey
}

function providerLabel(p: string): string {
  return p === "freellmapi" ? "FreeLLM API" : p === "openrouter" ? "OpenRouter" : p
}

export function App({ config }: AppProps) {
  const [view, setView] = React.useState<"home" | "chat">("home")
  const [msgs, setMsgs] = React.useState<Message[]>([])
  const [loading, setLoading] = React.useState(false)
  const [totalTokens, setTotalTokens] = React.useState(0)
  const [totalSaved, setTotalSaved] = React.useState(0)
  const [currentProvider, setCurrentProvider] = React.useState(config.provider)
  const [currentModel, setCurrentModel] = React.useState(config.model)

  let nextId = 0
  const id = () => `m${++nextId}`

  function addMsg(m: Message) { setMsgs(prev => [...prev, m]) }

  const handleCmd = React.useCallback((t: string): boolean => {
    const parts = t.slice(1).split(/\s+/)
    const cmd = parts[0].toLowerCase()
    const args = parts.slice(1).join(" ")

    switch (cmd) {
      case "quit":
        process.exit(0)
        return true
      case "clear":
        setMsgs([])
        setTotalTokens(0)
        setTotalSaved(0)
        return true
      case "help": {
        const lines = [
          "/quit  Quit — Exit NIMBL",
          "/clear  Clear — Clear all messages",
          "/help  Help — Show available commands",
          "/model  Model — Switch model (/model <name>)",
          "/provider  Provider — Switch provider (/provider freellmapi|openrouter)",
          "/stats  Stats — Show token usage statistics",
          "/status  Status — Show current configuration",
          "/export  Export — Export conversation to file",
        ]
        addMsg({ id: id(), role: "nimb", content: "Available commands:\n\n" + lines.map(l => `  ${l}`).join("\n") })
        return true
      }
      case "model":
        if (!args) {
          addMsg({ id: id(), role: "nimb", content: `Current model: ${currentModel}\nUsage: /model <name> (e.g., /model auto)` })
          return true
        }
        setCurrentModel(args)
        addMsg({ id: id(), role: "nimb", content: `Switched model to: ${args}` })
        return true
      case "provider":
        if (!args) {
          addMsg({ id: id(), role: "nimb", content: `Current provider: ${currentProvider}\nUsage: /provider freellmapi | openrouter` })
          return true
        }
        if (args !== "freellmapi" && args !== "openrouter") {
          addMsg({ id: id(), role: "err", content: `Unknown provider: ${args}. Use: freellmapi or openrouter` })
          return true
        }
        setCurrentProvider(args)
        addMsg({ id: id(), role: "nimb", content: `Switched provider to: ${providerLabel(args)}` })
        return true
      case "stats":
        addMsg({
          id: id(), role: "nimb",
          content: `Session token usage:\n  Total tokens: ${totalTokens}\n  Est. cost saved: $${totalSaved.toFixed(4)} (vs GPT-4o)\n  Messages: ${msgs.length}`,
        })
        return true
      case "status": {
        const p = currentProvider
        const key = getApiKey(p)
        const keyDisplay = key ? `${key.slice(0, 8)}...` : "(none)"
        addMsg({
          id: id(), role: "nimb",
          content: `Configuration:\n  Provider: ${providerLabel(p)} (${p})\n  Model: ${currentModel}\n  API Key: ${keyDisplay}\n  Session tokens: ${totalTokens}\n  Est. cost saved: $${totalSaved.toFixed(4)}`,
        })
        return true
      }
      case "export": {
        if (msgs.length === 0) {
          addMsg({ id: id(), role: "err", content: "No messages to export." })
          return true
        }
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
        const fn = `nimbl-export-${ts}.md`
        const lines = msgs.map(m => {
          const label = m.role === "user" ? "**You**" : m.role === "err" ? "**Error**" : "**NIMBL**"
          return `${label}:\n${m.content}\n`
        })
        const content = `# NIMBL Conversation Export\n\nDate: ${new Date().toISOString()}\nProvider: ${providerLabel(currentProvider)} / ${currentModel}\nTokens: ${totalTokens}\nCost saved: $${totalSaved.toFixed(4)}\n\n---\n\n${lines.join("\n")}`
        writeFileSync(fn, content, "utf-8")
        addMsg({ id: id(), role: "nimb", content: `Exported ${msgs.length} messages to ${fn}` })
        return true
      }
      default:
        return false
    }
  }, [msgs, totalTokens, totalSaved, currentProvider, currentModel])

  const handleSubmit = async (text: string) => {
    const t = text.trim()
    if (!t) return

    if (t.startsWith("/") && handleCmd(t)) return

    setView("chat")
    addMsg({ id: id(), role: "user", content: t })
    setLoading(true)
    try {
      const p = currentProvider
      const result = await sendChat(t, {
        provider: p,
        model: currentModel,
        apiKey: getApiKey(p),
      })
      addMsg({ id: id(), role: "nimb", content: result.text })
      setTotalTokens(prev => prev + result.usage.totalTokens)
      setTotalSaved(prev => prev + estimateSavings(result.usage.inputTokens, result.usage.outputTokens))
    } catch (err: any) {
      addMsg({ id: id(), role: "err", content: err.message || String(err) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Status bar */}
      <Box flexDirection="row">
        <Text bold backgroundColor={C.accent} color={C.text}> NIMBL </Text>
        <Text backgroundColor={C.accent} color={C.dim}> {providerLabel(currentProvider)} / {currentModel} </Text>
        {totalTokens > 0 && (
          <Text backgroundColor={C.accent} color={C.ok}> ⚡ {totalTokens}t · ${totalSaved.toFixed(4)} </Text>
        )}
      </Box>

      {/* Main content area */}
      {view === "home" ? (
        <HomeScreen onSubmit={handleSubmit} />
      ) : (
        <ChatScreen
          messages={msgs}
          loading={loading}
          onSubmit={handleSubmit}
        />
      )}
    </Box>
  )
}

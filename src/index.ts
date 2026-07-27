#!/usr/bin/env bun
import * as readline from "node:readline"
import { sendChat, estimateSavings } from "@/core/api"
import { resolveConfig } from "@/config"
import { DEFAULTS } from "@/core/provider-defaults"
import { writeFileSync } from "fs"

const LOGO = `  ███╗   ██╗ ██╗ ███╗   ███╗ ██████╗  ██╗
  ████╗  ██║ ██║ ████╗ ████║ ██╔══██╗ ██║
  ██╔██╗ ██║ ██║ ██╔████╔██║ ██████╔╝ ██║
  ██║╚██╗██║ ██║ ██║╚██╔╝██║ ██╔══██╗ ██║
  ██║ ╚████║ ██║ ██║ ╚═╝ ██║ ██████╔╝ ███████╗
  ╚═╝  ╚═══╝ ╚═╝ ╚═╝     ╚═╝ ╚═════╝  ╚══════╝

  Token-efficient AI coding that teaches.
  Learn more. Use fewer tokens.`

console.log(LOGO + "\n")

let cliConfig
try {
  cliConfig = resolveConfig(process.argv.slice(2))
} catch (err) {
  console.error(`\x1b[31mConfiguration Error:\x1b[0m ${err instanceof Error ? err.message : err}`)
  console.error("Usage: nimbl [--provider openrouter] [--model MODEL] [--api-key KEY]")
  process.exit(1)
}

let currentProvider = cliConfig.provider
let currentModel = cliConfig.model
let totalTokens = 0
let totalSaved = 0

function getApiKey(provider: string): string {
  if (provider === "openrouter") {
    return process.env.OPENROUTER_KEY || DEFAULTS.fallback.apiKey
  }
  return process.env.FREELLMAPI_KEY || DEFAULTS.primary.apiKey
}

function providerLabel(p: string): string {
  return p === "freellmapi" ? "FreeLLM API" : p === "openrouter" ? "OpenRouter" : p
}

function handleCmd(t: string): boolean {
  const parts = t.slice(1).split(/\s+/)
  const cmd = parts[0].toLowerCase()
  const args = parts.slice(1).join(" ")

  switch (cmd) {
    case "quit":
      console.log("Goodbye!")
      process.exit(0)
    case "clear":
      totalTokens = 0
      totalSaved = 0
      console.log("\x1b[32mSession cleared.\x1b[0m")
      return true
    case "help": {
      const lines = [
        "  /quit  Quit — Exit NIMBL",
        "  /clear  Clear — Clear all messages",
        "  /help  Help — Show available commands",
        '  /model  Model — Switch model (/model <name>, e.g. /model auto)',
        "  /provider  Provider — Switch provider (/provider freellmapi|openrouter)",
        "  /stats  Stats — Show token usage statistics",
        "  /status  Status — Show current configuration",
        "  /export  Export — Export conversation to file",
      ]
      console.log("\nAvailable commands:\n" + lines.join("\n") + "\n")
      return true
    }
    case "model":
      if (!args) {
        console.log(`Current model: ${currentModel}`)
        console.log("Usage: /model <name>  (e.g., /model auto or /model deepseek/deepseek-chat)")
        return true
      }
      currentModel = args
      console.log(`\x1b[32mSwitched model to: ${args}\x1b[0m`)
      return true
    case "provider":
      if (!args) {
        console.log(`Current provider: ${currentProvider}`)
        console.log("Usage: /provider freellmapi | openrouter")
        return true
      }
      if (args !== "freellmapi" && args !== "openrouter") {
        console.log(`\x1b[31mUnknown provider: ${args}. Use: freellmapi or openrouter\x1b[0m`)
        return true
      }
      currentProvider = args
      console.log(`\x1b[32mSwitched provider to: ${providerLabel(args)}\x1b[0m`)
      return true
    case "stats":
      console.log(`\n\x1b[32mSession token usage:\x1b[0m`)
      console.log(`  Total tokens: ${totalTokens}`)
      console.log(`  Est. cost saved: $${totalSaved.toFixed(4)} (vs GPT-4o)`)
      return true
    case "status": {
      const key = getApiKey(currentProvider)
      const keyDisplay = key ? `${key.slice(0, 8)}...` : "(none)"
      console.log(`\n\x1b[32mConfiguration:\x1b[0m`)
      console.log(`  Provider: ${providerLabel(currentProvider)} (${currentProvider})`)
      console.log(`  Model: ${currentModel}`)
      console.log(`  API Key: ${keyDisplay}`)
      console.log(`  Session tokens: ${totalTokens}`)
      console.log(`  Est. cost saved: $${totalSaved.toFixed(4)}`)
      return true
    }
    case "export": {
      console.log("Export not available in REPL mode. Use the TUI (/tui to launch).")
      return true
    }
    default:
      return false
  }
}

console.log(`Using provider: ${providerLabel(currentProvider)} (${currentModel})`)
console.log("Type /help for commands.\n")

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
rl.setPrompt(`\x1b[32mnimbl>\x1b[0m `)
rl.prompt()

rl.on("line", async (input) => {
  const text = input.trim()
  if (!text) { rl.prompt(); return }

  if (text.startsWith("/") && handleCmd(text)) { rl.prompt(); return }

  try {
    process.stdout.write("\n")
    const p = currentProvider
    const result = await sendChat(text, { provider: p, model: currentModel, apiKey: getApiKey(p) })
    console.log(result.text)
    totalTokens += result.usage.totalTokens
    totalSaved += estimateSavings(result.usage.inputTokens, result.usage.outputTokens)
    console.log(`\n\x1b[32m⚡ ${result.usage.totalTokens} tokens · ~$${estimateSavings(result.usage.inputTokens, result.usage.outputTokens).toFixed(4)} (vs GPT-4o)\x1b[0m`)
  } catch (err) {
    console.error(`\x1b[31mError: ${err instanceof Error ? err.message : err}\x1b[0m`)
  }

  console.log("")
  rl.prompt()
})

rl.on("close", () => { console.log("\nGoodbye!"); process.exit(0) })

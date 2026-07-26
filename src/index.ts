#!/usr/bin/env bun
import * as readline from "node:readline"
import { sendChat, estimateSavings } from "@/core/api"
import { resolveConfig } from "@/config"

const LOGO = `  ███╗   ██╗ ██╗ ███╗   ███╗ ██████╗  ██╗
  ████╗  ██║ ██║ ████╗ ████║ ██╔══██╗ ██║
  ██╔██╗ ██║ ██║ ██╔████╔██║ ██████╔╝ ██║
  ██║╚██╗██║ ██║ ██║╚██╔╝██║ ██╔══██╗ ██║
  ██║ ╚████║ ██║ ██║ ╚═╝ ██║ ██████╔╝ ███████╗
  ╚═╝  ╚═══╝ ╚═╝ ╚═╝     ╚═╝ ╚═════╝  ╚══════╝

  Token-efficient AI coding that teaches.
  Learn more. Use fewer tokens.`

console.log(LOGO + "\n")

let config
try {
  config = resolveConfig(process.argv.slice(2))
} catch (err) {
  console.error(`\x1b[31mConfiguration Error:\x1b[0m ${err instanceof Error ? err.message : err}`)
  console.error("Usage: nimbl [--provider openrouter] [--model MODEL] [--api-key KEY]")
  process.exit(1)
}

const provider = config.provider === "freellmapi" ? "FreeLLM API" : "OpenRouter"
console.log(`Using provider: ${provider} (${config.model})\n`)

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
rl.setPrompt(`\x1b[32mnimbl>\x1b[0m `)
rl.prompt()

rl.on("line", async (input) => {
  const text = input.trim()
  if (!text) {
    rl.prompt()
    return
  }
  if (text === "/quit" || text === "/exit") {
    console.log("Goodbye!")
    process.exit(0)
  }

  try {
    process.stdout.write("\n")
    const result = await sendChat(text, config)
    console.log(result.text)
    const saved = estimateSavings(result.usage.inputTokens, result.usage.outputTokens)
    console.log(
      `\n\x1b[32m⚡ ${result.usage.totalTokens} tokens · ~$${saved} (vs GPT-4o)\x1b[0m`
    )
  } catch (err) {
    console.error(
      `\x1b[31mError: ${err instanceof Error ? err.message : err}\x1b[0m`
    )
  }

  console.log("")
  rl.prompt()
})

rl.on("close", () => {
  console.log("\nGoodbye!")
  process.exit(0)
})

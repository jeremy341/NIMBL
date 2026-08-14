import { existsSync, readFileSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { loadSessionStore, saveSessionStore, type SessionStore, type StoredSession } from "./core/sessions"
import { PROVIDERS, defaultModelFor, getProvider, providerApiKey } from "./core/providers"
import { BUILTIN_AGENTS, effectiveAgent } from "./core/agent-config"
import { loadSettings } from "./core/settings"
import { permissionFor } from "./core/permissions"
import { NimblBackend } from "./core/backend"
import { loadGlobalConfig } from "./core/global-config"
import type { AgentMode } from "./core/agent"

function value(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

async function runPrompt(args: string[], root: string): Promise<void> {
  const prompt = value(args, "--prompt") || value(args, "-p") || args.slice(1).find((arg) => !arg.startsWith("-")) || ""
  if (!prompt.trim()) {
    console.error("Usage: nimbl run <prompt> [--provider <id>] [--model <id>] [--agent build|plan|explain|learn] [--yes]")
    process.exitCode = 1
    return
  }
  const globalConfig = loadGlobalConfig()
  const providerID = value(args, "--provider") || process.env.NIMBL_PROVIDER || globalConfig.provider || "freellmapi"
  const definition = getProvider(providerID)
  const savedModel = globalConfig.model && definition.models.some((item) => item.id === globalConfig.model) ? globalConfig.model : undefined
  const model = value(args, "--model") || process.env.NIMBL_MODEL || savedModel || defaultModelFor(providerID)
  const apiKey = value(args, "--api-key") || providerApiKey(providerID) || globalConfig.providerKeys?.[providerID] || ""
  if (!definition.local && !apiKey) {
    console.error(`Provider ${providerID} requires an API key. Set ${definition.envKey} or pass --api-key.`)
    process.exitCode = 1
    return
  }
  const settings = loadSettings(root)
  const agentArg = value(args, "--agent") || "build"
  const agentID = (["build", "plan", "explain", "learn"] as const).includes(agentArg as AgentMode) ? agentArg as string : agentArg
  const agent = effectiveAgent(agentID, Object.values(settings.agents || {}))
  const autoAllow = args.includes("--yes") || args.includes("-y")
  const backend = new NimblBackend(root, { watch: false })
  try {
    const result = await backend.run({
      root,
      provider: providerID,
      model,
      apiKey,
      mode: agent.mode,
      settings,
      permissions: settings.permissions,
      messages: [{ role: "user", text: prompt }],
      onEvent: () => {},
      requestApproval: (request) => {
        const policy = permissionFor(settings.permissions, { tool: request.tool, target: request.target || request.detail })
        if (policy === "allow") return Promise.resolve("always")
        if (autoAllow) return Promise.resolve("always")
        if (policy === "deny") throw new Error(`${request.tool} is blocked by project policy.`)
        throw new Error(`Headless run cannot approve "${request.title}". Pass --yes to allow, or configure a permission.`)
      },
    })
    process.stdout.write((result.text || result.reasoning || "(no text output)").trimEnd() + "\n")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`nimbl: ${message.split("\n")[0] || message}`)
    process.exitCode = 1
  } finally {
    backend.close()
  }
}

function printSessions(root: string, args: string[]) {
  const loaded = loadSessionStore(root)
  if (loaded.status !== "valid") return console.log("No sessions found.")
  const max = Number(value(args, "--max-count") || value(args, "-n") || 0)
  const sessions = [...loaded.store.sessions].sort((a, b) => (b.updated || b.created) - (a.updated || a.created)).slice(0, max || undefined)
  if (args.includes("--format") && value(args, "--format") === "json") return console.log(JSON.stringify(sessions, null, 2))
  if (!sessions.length) return console.log("No sessions found.")
  console.log(`${"Session ID".padEnd(38)}  ${"Title".padEnd(32)}  Updated`)
  console.log("─".repeat(84))
  for (const session of sessions) console.log(`${session.id.padEnd(38)}  ${session.title.slice(0, 32).padEnd(32)}  ${new Date(session.updated || session.created).toLocaleString()}`)
}

function findSession(root: string, id: string): { store: SessionStore; session: StoredSession } | undefined {
  const loaded = loadSessionStore(root)
  if (loaded.status !== "valid") return undefined
  const session = loaded.store.sessions.find((item) => item.id === id || item.id.startsWith(id))
  return session ? { store: loaded.store, session } : undefined
}

export async function runCliCommand(args: string[], root: string): Promise<boolean> {
  const command = args[0]
  if (command === "--print" || command === "-p" || command === "--prompt") {
    await runPrompt(args, root)
    return true
  }
  if (!command || command.startsWith("-")) return false
  if (command === "run") { await runPrompt(args.slice(1), root); return true }
  if (command === "session") {
    const action = args[1] || "list"
    if (action === "list") printSessions(root, args.slice(2))
    else if (action === "delete") {
      const found = findSession(root, args[2] || "")
      if (!found) console.error("Session not found.")
      else { found.store.sessions = found.store.sessions.filter((item) => item.id !== found.session.id); found.store.activeID = found.store.sessions[0]?.id || ""; found.store.revision++; saveSessionStore(root, found.store); console.log(`Deleted ${found.session.id}`) }
    } else if (action === "rename") {
      const found = findSession(root, args[2] || "")
      if (!found) console.error("Session not found.")
      else { found.session.title = args.slice(3).join(" ") || found.session.title; found.session.updated = Date.now(); found.store.revision++; saveSessionStore(root, found.store); console.log(found.session.title) }
    } else console.error("Usage: nimbl session list|delete <id>|rename <id> <name>")
    return true
  }
  if (command === "providers") { console.table(PROVIDERS.map((p) => ({ id: p.id, name: p.name, models: p.models.length, local: Boolean(p.local) }))); return true }
  if (command === "models") { console.table(PROVIDERS.flatMap((p) => p.models.map((m) => ({ provider: p.id, id: m.id, context: m.contextWindow, free: Boolean(m.free) })))); return true }
  if (command === "agent") { console.table(BUILTIN_AGENTS.map((a) => ({ id: a.id, description: a.description }))); return true }
  if (command === "stats") {
    const loaded = loadSessionStore(root)
    if (loaded.status !== "valid") { console.log("No session usage recorded."); return true }
    const messages = loaded.store.sessions.flatMap((s) => s.messages)
    const usage = messages.flatMap((m) => m.usage ? [m.usage] : [])
    console.table({ sessions: loaded.store.sessions.length, messages: messages.length, inputTokens: usage.reduce((n, u) => n + u.inputTokens, 0), outputTokens: usage.reduce((n, u) => n + u.outputTokens, 0), providerCostUsd: usage.reduce((n, u) => n + (u.providerCostUsd || 0), 0) })
    return true
  }
  if (command === "export") {
    const found = findSession(root, args[1] || "")
    if (!found) { console.error("Session not found."); return true }
    const lines = [`# ${found.session.title}`, "", `Session: ${found.session.id}`, ""]
    for (const message of found.session.messages) lines.push(`## ${message.role}`, "", message.text || message.error || "", "")
    console.log(lines.join("\n"))
    return true
  }
  if (command === "run") { await runPrompt(args.slice(1), root); return true }
  if (command === "config") { console.log(`project: ${root}\nstate: ${join(root, ".nimbl")}\nconfig: ${existsSync(join(root, "NIMBL.md")) ? "NIMBL.md" : "defaults"}`); return true }
  if (command === "doctor") { const state = join(root, ".nimbl"); console.log(`root: ${root}\nstate: ${existsSync(state) ? "ok" : "not initialized"}\nsessions: ${existsSync(join(state, "sessions.json")) ? "ok" : "none"}`); return true }
  return false
}

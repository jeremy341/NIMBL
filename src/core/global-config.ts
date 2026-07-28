import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export interface GlobalConfig {
  provider?: string
  model?: string
  providerKeys?: Record<string, string>
}

export function globalConfigPath() {
  const base = process.platform === "win32"
    ? process.env.APPDATA || join(homedir(), "AppData", "Roaming")
    : process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
  return join(base, "nimbl", "config.json")
}

export function loadGlobalConfig(file = globalConfigPath()): GlobalConfig {
  if (!existsSync(file)) return {}
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const value = parsed as Record<string, unknown>
    const providerKeys = value.providerKeys && typeof value.providerKeys === "object" && !Array.isArray(value.providerKeys)
      ? Object.fromEntries(Object.entries(value.providerKeys).filter(([, key]) => typeof key === "string" && Boolean(key.trim()))) as Record<string, string>
      : undefined
    return {
      provider: typeof value.provider === "string" ? value.provider : undefined,
      model: typeof value.model === "string" ? value.model : undefined,
      providerKeys,
    }
  } catch {
    return {}
  }
}

export function saveGlobalConfig(config: GlobalConfig, file = globalConfigPath()) {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify(config, null, 2) + "\n", { encoding: "utf8", mode: 0o600 })
  renameSync(temporary, file)
}

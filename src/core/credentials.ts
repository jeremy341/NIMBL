import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { globalConfigPath, loadGlobalConfig, saveGlobalConfig } from "./global-config"
import type { ProviderDefinition } from "./providers"

export interface CredentialRecord { provider: string; source: "env" | "saved" | "session"; configured: boolean; lastValidated?: number }
export function redactSecret(value: string) { return value.replace(/.{4}(?=.{4})/g, "*") }
export function resolveCredential(provider: ProviderDefinition, options: { apiKey?: string; env?: NodeJS.ProcessEnv; file?: string } = {}) {
  const explicit = options.apiKey?.trim(); if (explicit) return { key: explicit, source: "session" as const }
  const envKey = (options.env || process.env)[provider.envKey]?.trim(); if (envKey) return { key: envKey, source: "env" as const }
  const saved = loadGlobalConfig(options.file).providerKeys?.[provider.id]?.trim(); return saved ? { key: saved, source: "saved" as const } : undefined
}
export function credentialStatus(providers: readonly ProviderDefinition[], options: { env?: NodeJS.ProcessEnv; file?: string } = {}): CredentialRecord[] { return providers.map((provider) => { const resolved = resolveCredential(provider, options); return { provider: provider.id, source: resolved?.source || "env", configured: Boolean(resolved) } }) }
export function saveCredential(provider: string, key: string, file = globalConfigPath()) { if (!key.trim()) throw new Error("Credential cannot be empty."); const config = loadGlobalConfig(file); saveGlobalConfig({ ...config, providerKeys: { ...config.providerKeys, [provider]: key.trim() } }, file); return file }
export function removeCredential(provider: string, file = globalConfigPath()) { const config = loadGlobalConfig(file); const providerKeys = { ...(config.providerKeys || {}) }; delete providerKeys[provider]; saveGlobalConfig({ ...config, providerKeys }, file) }
export function credentialDiagnostics(providers: readonly ProviderDefinition[], options: { env?: NodeJS.ProcessEnv; file?: string } = {}) { return credentialStatus(providers, options).map((item) => `${item.provider}: ${item.configured ? "configured" : "missing"}`) }

export async function discoverProviderModels(provider: ProviderDefinition, apiKey: string, signal?: AbortSignal) {
  if (!provider.discovery) return []
  const auth: Record<string, string> = provider.local ? {} : provider.protocol === "anthropic"
    ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
    : { Authorization: `Bearer ${apiKey}` }
  const response = await fetch(new URL(provider.discovery.path, provider.baseURL), { signal, headers: { ...auth, ...(provider.headers || {}) } })
  if (!response.ok) throw new Error(`${provider.name} model discovery failed with HTTP ${response.status}.`)
  const body = await response.json() as { data?: { id?: string }[]; models?: { id?: string }[] }
  return (body.data || body.models || []).map((item) => item.id).filter((id): id is string => typeof id === "string")
}

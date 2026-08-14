import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { createHash, randomBytes, randomUUID } from "node:crypto"

export interface AuthSession { provider: string; account?: string; accessToken: string; refreshToken?: string; expiresAt?: number; created: number; updated: number }
export interface OAuthChallenge { state: string; verifier: string; created: number; redirectURI: string }
function hash(value: string) { return createHash("sha256").update(value).digest("base64url") }
export function createOAuthChallenge(redirectURI: string): OAuthChallenge { return { state: randomUUID(), verifier: randomBytes(32).toString("base64url"), created: Date.now(), redirectURI } }
export function oauthCodeChallenge(verifier: string) { return hash(verifier) }

/** Provider-agnostic auth registry. OAuth exchange is intentionally delegated to provider adapters. */
export class AuthRegistry {
  private readonly sessions = new Map<string, AuthSession>()
  login(session: Omit<AuthSession, "created" | "updated">) { const next = { ...session, created: this.sessions.get(session.provider)?.created || Date.now(), updated: Date.now() }; this.sessions.set(session.provider, next); return next }
  logout(provider: string) { return this.sessions.delete(provider) }
  get(provider: string) { const session = this.sessions.get(provider); if (!session) return undefined; if (session.expiresAt !== undefined && session.expiresAt <= Date.now()) return undefined; return session }
  list() { return [...this.sessions.values()].map((session) => ({ provider: session.provider, account: session.account, expiresAt: session.expiresAt, configured: Boolean(this.get(session.provider)) })) }
  exportMetadata() { return JSON.stringify(this.list(), null, 2) + "\n" }
  save(file: string) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify([...this.sessions.values()], null, 2) + "\n", { encoding: "utf8", mode: 0o600 }) }
  load(file: string) { if (!existsSync(file)) return this; try { const values = JSON.parse(readFileSync(file, "utf8")) as AuthSession[]; for (const session of values) if (session?.provider && session.accessToken) this.sessions.set(session.provider, session) } catch { /* Invalid auth data is ignored; callers can re-authenticate. */ } return this }
}

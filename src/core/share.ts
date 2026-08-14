import { exportSession, redactSecrets } from "./export"
import type { SessionStore } from "./sessions"

export interface HostedShare {
  id: string
  url: string
  deleteToken?: string
  sharedAt: number
}

interface ShareResponse { id?: unknown; url?: unknown; deleteToken?: unknown }
type ShareFetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

function endpoint(value: string) {
  const normalized = value.trim().replace(/\/$/, "")
  if (!/^https?:\/\//i.test(normalized)) throw new Error("NIMBL_SHARE_URL must be an HTTP(S) URL.")
  return normalized
}

export async function createHostedShare(
  serviceURL: string,
  store: SessionStore,
  sessionID = store.activeID,
  options: { fetcher?: ShareFetcher; signal?: AbortSignal } = {},
): Promise<HostedShare> {
  const session = store.sessions.find((item) => item.id === sessionID)
  if (!session) throw new Error(`Session "${sessionID}" was not found.`)
  const body = redactSecrets(JSON.stringify({
    version: 1,
    session: {
      id: session.id,
      title: session.title,
      created: session.created,
      updated: session.updated,
      agent: session.agent,
      summary: session.summary,
      transcript: exportSession(store, sessionID, { format: "markdown", redactSecrets: true }),
    },
  }))
  const response = await (options.fetcher ?? fetch)(`${endpoint(serviceURL)}/shares`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: options.signal,
  })
  if (!response.ok) throw new Error(`Hosted sharing failed with HTTP ${response.status}.`)
  const value = await response.json() as ShareResponse
  if (typeof value.id !== "string" || typeof value.url !== "string" || !/^https?:\/\//i.test(value.url)) {
    throw new Error("Hosted sharing service returned an invalid response.")
  }
  return { id: value.id, url: value.url, deleteToken: typeof value.deleteToken === "string" ? value.deleteToken : undefined, sharedAt: Date.now() }
}

export async function deleteHostedShare(serviceURL: string, share: HostedShare, options: { fetcher?: ShareFetcher; signal?: AbortSignal } = {}) {
  const response = await (options.fetcher ?? fetch)(`${endpoint(serviceURL)}/shares/${encodeURIComponent(share.id)}`, {
    method: "DELETE",
    headers: share.deleteToken ? { Authorization: `Bearer ${share.deleteToken}` } : undefined,
    signal: options.signal,
  })
  if (!response.ok && response.status !== 404) throw new Error(`Removing hosted share failed with HTTP ${response.status}.`)
}

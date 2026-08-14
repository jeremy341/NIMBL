export type NotificationKind = "completion" | "permission" | "question" | "failure" | "info"
export interface NimblNotification { id: string; kind: NotificationKind; title: string; body?: string; time: number; read: boolean; attention: boolean }

export class NotificationCenter {
  private readonly entries: NimblNotification[] = []
  private readonly listeners = new Set<(notification: NimblNotification) => void>()
  notify(kind: NotificationKind, title: string, body?: string) { const item = { id: crypto.randomUUID(), kind, title: redact(title), body: body ? redact(body) : undefined, time: Date.now(), read: false, attention: kind !== "info" }; this.entries.push(item); if (this.entries.length > 200) this.entries.shift(); for (const listener of this.listeners) listener(item); return item }
  subscribe(listener: (notification: NimblNotification) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  list(unreadOnly = false) { return this.entries.filter((item) => !unreadOnly || !item.read) }
  markRead(id?: string) { for (const item of this.entries) if (!id || item.id === id) { item.read = true; item.attention = false } }
  clear() { this.entries.length = 0 }
}

function redact(value: string) { return value.replace(/(Bearer\s+|(?:api[_-]?key|token|secret)\s*[:=]\s*)([^\s,;]+)/gi, "$1[REDACTED]").replace(/sk-[A-Za-z0-9_-]{12,}/g, "[REDACTED]") }

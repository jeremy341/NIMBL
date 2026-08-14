import type { AgentEvent } from "./agent"
import type { StoredAssistantPart, StoredMessage } from "./sessions"

export function assistantParts(message: StoredMessage): StoredAssistantPart[] {
  return message.parts || (message.text
    ? [{ id: `${message.id}-text`, type: "text", text: message.text }]
    : [])
}

export function reduceAssistantEvents(
  message: StoredMessage,
  events: AgentEvent[],
  createID: () => string,
  now: () => number = Date.now,
): StoredMessage {
  let text = message.text
  const parts: StoredAssistantPart[] = [...assistantParts(message)]

  for (const event of events) {
    if (event.kind === "text") {
      text += event.delta
      const last = parts.at(-1)
      if (last?.type === "text") parts[parts.length - 1] = { ...last, text: last.text + event.delta }
      else parts.push({ id: createID(), type: "text", text: event.delta })
      continue
    }
    if (event.kind === "reasoning") {
      const last = parts.at(-1)
      if (last?.type === "reasoning" && last.ended === undefined) {
        parts[parts.length - 1] = { ...last, text: last.text + event.delta }
      }
      else parts.push({ id: createID(), type: "reasoning", text: event.delta, started: now() })
      continue
    }

    const existing = parts.findIndex((part) => part.type === "tool" && part.id === event.id)
    const prior = existing >= 0 ? parts[existing] as Extract<StoredAssistantPart, { type: "tool" }> : undefined
    const terminal = event.state === "completed" || event.state === "failed" || event.state === "rejected"
    const next: StoredAssistantPart = {
      id: event.id,
      type: "tool",
      tool: event.tool,
      state: event.state,
      title: event.title,
      detail: event.detail,
      output: event.output,
      diff: event.diff,
      path: event.path,
      started: prior?.started ?? now(),
      ended: terminal ? (prior?.ended ?? now()) : prior?.ended,
    }
    if (existing >= 0) parts[existing] = next
    else parts.push(next)
  }

  return { ...message, text, parts }
}

export function finishAssistant(message: StoredMessage, completed = Date.now()): StoredMessage {
  return {
    ...message,
    completed,
    parts: assistantParts(message).map((part) => {
      if (part.type === "reasoning" && part.ended === undefined) return { ...part, ended: completed }
      if (part.type === "tool" && part.state === "running") return { ...part, state: "completed", ended: completed }
      return part
    }),
  }
}

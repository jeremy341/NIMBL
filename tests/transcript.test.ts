import { describe, expect, it } from "vitest"
import type { AgentEvent } from "@/core/agent"
import type { StoredMessage } from "@/core/sessions"
import { finishAssistant, reduceAssistantEvents } from "@/core/transcript"

describe("assistant transcript parts", () => {
  it("preserves stream order and updates an existing tool part", () => {
    const message: StoredMessage = {
      id: "assistant",
      role: "assistant",
      text: "",
      time: 100,
      parts: [],
    }
    const events: AgentEvent[] = [
      { kind: "text", delta: "Before" },
      { kind: "tool", id: "tool-1", tool: "read", state: "running", title: "Read src/a.ts" },
      { kind: "tool", id: "tool-1", tool: "read", state: "completed", title: "Read src/a.ts", output: "file" },
      { kind: "text", delta: " after" },
    ]
    let sequence = 0
    const updated = reduceAssistantEvents(message, events, () => `part-${++sequence}`, () => 200)

    expect(updated.text).toBe("Before after")
    expect(updated.parts?.map((part) => part.type)).toEqual(["text", "tool", "text"])
    expect(updated.parts?.filter((part) => part.type === "tool")).toHaveLength(1)
    expect(updated.parts?.find((part) => part.type === "tool")).toMatchObject({
      id: "tool-1",
      state: "completed",
      output: "file",
    })
  })

  it("closes active reasoning parts when an assistant turn finishes", () => {
    const message: StoredMessage = {
      id: "assistant",
      role: "assistant",
      text: "",
      time: 100,
      parts: [{ id: "thought", type: "reasoning", text: "Checking", started: 120 }],
    }

    expect(finishAssistant(message, 300)).toMatchObject({
      completed: 300,
      parts: [{ id: "thought", type: "reasoning", ended: 300 }],
    })
  })
})

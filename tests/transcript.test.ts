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

  it("preserves unchanged part identity during text streaming", () => {
    const tool = { id: "tool", type: "tool", tool: "read", state: "completed", title: "Read", output: "done" } as const
    const text = { id: "text", type: "text", text: "Hello" } as const
    const message: StoredMessage = {
      id: "assistant",
      role: "assistant",
      text: "Hello",
      time: 100,
      parts: [tool, text],
    }

    const updated = reduceAssistantEvents(message, [{ kind: "text", delta: " world" }], () => "unused")
    expect(updated.parts?.[0]).toBe(tool)
    expect(updated.parts?.[1]).not.toBe(text)
    expect(updated.parts?.[1]).toMatchObject({ text: "Hello world" })
  })

  it("stamps started/ended timestamps on tool parts for duration display", () => {
    const message: StoredMessage = {
      id: "assistant",
      role: "assistant",
      text: "",
      time: 100,
      parts: [],
    }
    const events: AgentEvent[] = [
      { kind: "tool", id: "task-1", tool: "delegate", state: "running", title: "Subagent Task — investigate" },
      { kind: "tool", id: "task-1", tool: "delegate", state: "completed", title: "Subagent Task — investigate", output: "done" },
    ]
    let sequence = 0
    const updated = reduceAssistantEvents(message, events, () => `part-${++sequence}`, () => 500)

    const toolPart = updated.parts?.find((part) => part.type === "tool")
    expect(toolPart).toMatchObject({ id: "task-1", started: 500, ended: 500, state: "completed" })
    // The running event stamps `started`; the completed event keeps it and adds `ended`.
    expect((toolPart as { started?: number }).started).toBe(500)
    expect((toolPart as { ended?: number }).ended).toBe(500)
  })

  it("finishAssistant closes running tool parts like reasoning parts", () => {
    const message: StoredMessage = {
      id: "assistant",
      role: "assistant",
      text: "",
      time: 100,
      parts: [
        { id: "running-tool", type: "tool", tool: "bash", state: "running", title: "Run command", started: 150 },
        { id: "done-tool", type: "tool", tool: "read", state: "completed", title: "Read", started: 160, ended: 170 },
      ],
    }

    expect(finishAssistant(message, 300).parts).toMatchObject([
      { id: "running-tool", state: "completed", ended: 300 },
      { id: "done-tool", state: "completed", ended: 170 },
    ])
  })
})

import { describe, expect, it } from "vitest"
import { RGBA, type BoxRenderable } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { createSignal } from "solid-js"
import { DialogOverlay, SelectDialog, SessionPrompt, SessionScreen, theme, type ChatSession, type SessionPromptRef } from "@/tui-opencode-ui"

const session: ChatSession = {
  id: "session",
  title: "OpenCode layout smoke test",
  agent: "build",
  created: 1,
  contextTokens: 1200,
  contextWindow: 128000,
  messages: [
    { id: "user", role: "user", text: "Explain this project", time: 1, agent: "build" },
    {
      id: "assistant",
      role: "assistant",
      text: "",
      time: 2,
      completed: 102,
      agent: "build",
      model: "test-model",
      parts: [],
    },
    { id: "notice", role: "system", text: "The project is ready.", time: 103 },
  ],
}

describe("OpenCode-derived TUI", () => {
  it("renders the session transcript, prompt, and wide sidebar", async () => {
    const setup = await testRender(() => (
      <SessionScreen
        session={session}
        providerLabel="Test Provider"
        model="test-model"
        cwd="C:/project"
        loading={false}
        promptValue=""
        onPromptInput={() => {}}
        onPromptSubmit={() => {}}
        onAbort={() => {}}
        commands={[]}
        onCommand={() => {}}
        onMessageAction={() => {}}
        sidebarVisible
        cost={0.01}
      />
    ), { width: 140, height: 36 })
    try {
      await setup.flush()
      const frame = setup.captureCharFrame()
      expect(frame).toContain("Explain this project")
      expect(frame).toContain("The project is ready.")
      expect(frame).toContain("OpenCode layout smoke test")
      expect(frame).toContain("Context")
      expect(frame).toContain("test-model")
      await setup.waitForVisualIdle()
    } finally {
      setup.renderer.destroy()
    }
  })

  it("renders the OpenCode dialog geometry and searchable options", async () => {
    const setup = await testRender(() => (
      <DialogOverlay open onClose={() => {}}>
        <SelectDialog
          title="Select model"
          options={[{ value: "model", title: "Test Model", category: "Provider", footer: "Free" }]}
          onSelect={() => {}}
          onClose={() => {}}
        />
      </DialogOverlay>
    ), { width: 100, height: 30 })
    try {
      await setup.flush()
      const frame = setup.captureCharFrame()
      expect(frame).toContain("Select model")
      expect(frame).toContain("Provider")
      expect(frame).toContain("Test Model")
      expect(frame).toContain("Free")
      const rows = frame.split("\n")
      expect(rows.find((row) => row.includes("Select model"))?.indexOf("Select model")).toBe(24)
      expect(rows.find((row) => row.includes("Provider"))?.indexOf("Provider")).toBe(24)
      expect(rows.find((row) => row.includes("Test Model"))?.indexOf("Test Model")).toBe(24)
      const backdrop = setup.renderer.root.findDescendantById("dialog-backdrop") as BoxRenderable | undefined
      expect(backdrop?.width).toBe(100)
      expect(backdrop?.height).toBe(30)
      await setup.waitForVisualIdle()
    } finally {
      setup.renderer.destroy()
    }
  })

  it("shows suggested commands and starts on the current option", async () => {
    const setup = await testRender(() => (
      <DialogOverlay open onClose={() => {}}>
        <SelectDialog
          title="Commands"
          options={[
            { value: "new", title: "New session", category: "Session", suggested: true },
            { value: "current", title: "Current session", category: "Session", current: true },
          ]}
          showSuggested
          onSelect={() => {}}
          onClose={() => {}}
        />
      </DialogOverlay>
    ), { width: 100, height: 30 })
    try {
      await setup.flush()
      await new Promise((resolve) => setTimeout(resolve, 5))
      await setup.flush()
      expect(setup.captureCharFrame()).toContain("Suggested")
      const current = setup.captureSpans().lines.flatMap((line) => line.spans)
        .find((span) => span.text.includes("Current session"))
      expect(current?.bg.equals(RGBA.fromHex(theme.primary))).toBe(true)
    } finally {
      setup.renderer.destroy()
    }
  })

  it("executes built-in slash commands on the autocomplete Enter press", async () => {
    let executed = ""
    let prompt: SessionPromptRef | undefined
    const setup = await testRender(() => {
      const [value, setValue] = createSignal("/mod")
      return (
        <SessionPrompt
          value={value()}
          onInput={setValue}
          onSubmit={() => {}}
          onAbort={() => {}}
          onCommand={(command) => { executed = command }}
          commands={[{ value: "model", title: "Model" }]}
          agent="build"
          provider="Test Provider"
          model="test-model"
          cwd="C:/project"
          status="idle"
          ref={(value) => { prompt = value }}
        />
      )
    }, { width: 100, height: 30 })
    try {
      await setup.flush()
      await new Promise((resolve) => setTimeout(resolve, 5))
      await setup.flush()
      prompt?.focus()
      setup.mockInput.pressEnter()
      await setup.flush()
      expect(executed).toBe("/model")
    } finally {
      setup.renderer.destroy()
    }
  })

  it("keeps project commands in the prompt so arguments can be entered", async () => {
    let executed = ""
    let current = ""
    let prompt: SessionPromptRef | undefined
    const setup = await testRender(() => {
      const [value, setValue] = createSignal("/tes")
      current = value()
      return (
        <SessionPrompt
          value={value()}
          onInput={(next) => { current = next; setValue(next) }}
          onSubmit={() => {}}
          onAbort={() => {}}
          onCommand={(command) => { executed = command }}
          commands={[{ value: "test", title: "Test", autocomplete: "insert" }]}
          agent="build"
          provider="Test Provider"
          model="test-model"
          cwd="C:/project"
          status="idle"
          ref={(value) => { prompt = value }}
        />
      )
    }, { width: 100, height: 30 })
    try {
      await setup.flush()
      await new Promise((resolve) => setTimeout(resolve, 5))
      await setup.flush()
      prompt?.focus()
      setup.mockInput.pressEnter()
      await setup.flush()
      expect(executed).toBe("")
      expect(current).toBe("/test ")
    } finally {
      setup.renderer.destroy()
    }
  })

  it("completes slash autocomplete with Tab instead of changing agent", async () => {
    let current = ""
    let prompt: SessionPromptRef | undefined
    const setup = await testRender(() => {
      const [value, setValue] = createSignal("/tes")
      current = value()
      return (
        <SessionPrompt
          value={value()}
          onInput={(next) => { current = next; setValue(next) }}
          onSubmit={() => {}}
          onAbort={() => {}}
          onCommand={() => {}}
          commands={[{ value: "test", title: "Test", autocomplete: "insert" }]}
          agent="build"
          provider="Test Provider"
          model="test-model"
          cwd="C:/project"
          status="idle"
          ref={(value) => { prompt = value }}
        />
      )
    }, { width: 100, height: 30 })
    try {
      await setup.flush()
      await new Promise((resolve) => setTimeout(resolve, 5))
      prompt?.focus()
      setup.mockInput.pressTab()
      await setup.flush()
      expect(current).toBe("/test ")
    } finally {
      setup.renderer.destroy()
    }
  })

  it("summarizes multiline bracketed paste and expands it on submit", async () => {
    let submitted = ""
    let prompt: SessionPromptRef | undefined
    const setup = await testRender(() => (
      <SessionPrompt
        value=""
        onInput={() => {}}
        onSubmit={(value) => { submitted = value }}
        onAbort={() => {}}
        onCommand={() => {}}
        commands={[]}
        agent="build"
        provider="Test Provider"
        model="test-model"
        cwd="C:/project"
        status="idle"
        ref={(value) => { prompt = value }}
      />
    ), { width: 100, height: 30 })
    try {
      await setup.flush()
      await new Promise((resolve) => setTimeout(resolve, 5))
      prompt?.focus()
      await setup.mockInput.pasteBracketedText("first\nsecond\nthird")
      await setup.flush()
      const frame = setup.captureCharFrame()
      expect(frame).toContain("[Pasted ~3 lines]")
      const marker = setup.captureSpans().lines.flatMap((line) => line.spans)
        .find((span) => span.text.includes("[Pasted ~3 lines]"))
      expect(marker?.fg.equals(RGBA.fromHex(theme.primaryForeground))).toBe(true)
      setup.mockInput.pressEnter()
      await setup.flush()
      expect(submitted).toBe("first\nsecond\nthird")
    } finally {
      setup.renderer.destroy()
    }
  })

})

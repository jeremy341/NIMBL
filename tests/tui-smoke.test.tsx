import { describe, expect, it } from "vitest"
import { RGBA, type BoxRenderable } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { createSignal } from "solid-js"
import { AlertDialog, DialogOverlay, DiffDialog, ExportOptionsDialog, HelpDialog, PermissionPrompt, QuestionPrompt, SelectDialog, SessionPrompt, SessionScreen, StashDialog, theme, type ChatSession, type SessionPromptRef } from "@/tui-opencode-ui"

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

  it("keeps the composer and dialogs inside the minimum supported terminal", async () => {
    const promptSetup = await testRender(() => (
      <SessionPrompt
        value="/mo"
        onInput={() => {}}
        onSubmit={() => {}}
        onAbort={() => {}}
        onCommand={() => {}}
        commands={[{ value: "model", title: "Model" }]}
        agent="build"
        provider="Test Provider"
        model="test-model"
        cwd="C:/project"
        status="idle"
      />
    ), { width: 60, height: 18 })
    const dialogSetup = await testRender(() => (
      <DialogOverlay open onClose={() => {}}>
        <SelectDialog
          title="Select provider"
          options={[{ value: "provider", title: "Test Provider" }]}
          onSelect={() => {}}
          onClose={() => {}}
        />
      </DialogOverlay>
    ), { width: 60, height: 18 })
    try {
      await promptSetup.flush()
      await dialogSetup.flush()
      expect(promptSetup.captureCharFrame()).toContain("/mo")
      expect(dialogSetup.captureCharFrame()).toContain("Select provider")
    } finally {
      promptSetup.renderer.destroy()
      dialogSetup.renderer.destroy()
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

  it("completes OpenCode-style file mentions above the prompt", async () => {
    let current = ""
    let prompt: SessionPromptRef | undefined
    const setup = await testRender(() => {
      const [value, setValue] = createSignal("Review @src/tui")
      current = value()
      return (
        <box height={30} justifyContent="flex-end">
          <SessionPrompt
            value={value()}
            onInput={(next) => { current = next; setValue(next) }}
            onSubmit={() => {}}
            onAbort={() => {}}
            onCommand={() => {}}
            commands={[]}
            files={["src/tui-opencode.tsx", "src/core/agent.ts"]}
            agent="build"
            provider="Test Provider"
            model="test-model"
            cwd="C:/project"
            status="idle"
            ref={(value) => { prompt = value }}
          />
        </box>
      )
    }, { width: 100, height: 30 })
    try {
      await setup.flush()
      await new Promise((resolve) => setTimeout(resolve, 5))
      expect(setup.captureCharFrame()).toContain("@src/tui-opencode.tsx")
      prompt?.focus()
      setup.mockInput.pressTab()
      await setup.flush()
      expect(current).toBe("Review @src/tui-opencode.tsx ")
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

  it("renders markdown, fenced code, native diffs, and child-agent navigation", async () => {
    const rich: ChatSession = {
      ...session,
      parentID: "parent",
      runState: "running",
      messages: [{ id: "assistant-rich", role: "assistant", text: "", time: 1, parts: [{ id: "text", type: "text", text: "## Result\n\n```ts\nconst answer: number = 42\n```\n\n[Docs](https://example.com)" }] }],
    }
    const transcript = await testRender(() => (
      <SessionScreen session={rich} providerLabel="Provider" model="model" cwd="C:/project" loading={false} promptValue="" onPromptInput={() => {}} onPromptSubmit={() => {}} onAbort={() => {}} commands={[]} onCommand={() => {}} onMessageAction={() => {}} sidebarVisible={false} subagentNavigation={{ index: 1, total: 2, parentTitle: "Parent", label: "Parent", onParent() {}, onPrevious() {}, onNext() {} }} conceal={false} />
    ), { width: 100, height: 30 })
    const diff = await testRender(() => (
      <DiffDialog title="Diff · a.ts" diff={"--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,1 @@\n-const a = 1\n+const a = 2"} filetype="typescript" onClose={() => {}} />
    ), { width: 100, height: 30 })
    try {
      await transcript.flush(); await diff.flush()
      await transcript.waitForVisualIdle(); await diff.waitForVisualIdle()
      expect(transcript.captureCharFrame()).toContain("Result")
      expect(transcript.captureCharFrame()).toContain("const answer")
      expect(transcript.captureCharFrame()).toContain("Parent (1 of 2)")
      expect(diff.captureCharFrame()).toContain("const a = 2")
    } finally { transcript.renderer.destroy(); diff.renderer.destroy() }
  })

  it("shows the permission prompt with per-tool info and fullscreen hint", async () => {
    const setup = await testRender(() => (
      <PermissionPrompt title="Write src/app.ts" detail="src/app.ts" tool="write" diff="--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-a\n+b" contentWidth={80} onOnce={() => {}} onAlways={() => {}} onReject={() => {}} />
    ), { width: 100, height: 30 })
    try {
      await setup.flush(); await setup.waitForVisualIdle()
      const frame = setup.captureCharFrame()
      expect(frame).toContain("Permission required")
      expect(frame).toContain("Write src/app.ts")
      expect(frame).toContain("Allow once")
      expect(frame).toContain("Allow always")
      expect(frame).toContain("Reject")
      expect(frame).toContain("fullscreen")
    } finally { setup.renderer.destroy() }
  })

  it("renders alert, help, export-options, and stash dialogs", async () => {
    const alert = await testRender(() => <AlertDialog title="Update Complete" message="Successfully updated." onClose={() => {}} />, { width: 80, height: 24 })
    const help = await testRender(() => <HelpDialog commandShortcut="ctrl+p" onClose={() => {}} />, { width: 80, height: 24 })
    const exportOptions = await testRender(() => <ExportOptionsDialog value="session-abc.md" onConfirm={() => {}} onClose={() => {}} />, { width: 80, height: 24 })
    const stash = await testRender(() => <StashDialog entries={[{ id: "s1", text: "first prompt", created: Date.now() }]} onSelect={() => {}} onDelete={() => {}} onClose={() => {}} />, { width: 80, height: 24 })
    try {
      await Promise.all([alert.flush(), help.flush(), exportOptions.flush(), stash.flush()])
      await Promise.all([alert.waitForVisualIdle(), help.waitForVisualIdle(), exportOptions.waitForVisualIdle(), stash.waitForVisualIdle()])
      expect(alert.captureCharFrame()).toContain("Update Complete")
      expect(help.captureCharFrame()).toContain("Help")
      expect(exportOptions.captureCharFrame()).toContain("Export Options")
      expect(exportOptions.captureCharFrame()).toContain("Include thinking")
      expect(stash.captureCharFrame()).toContain("Stash")
      expect(stash.captureCharFrame()).toContain("first prompt")
    } finally { alert.renderer.destroy(); help.renderer.destroy(); exportOptions.renderer.destroy(); stash.renderer.destroy() }
  })

  it("offers a Type your own answer option on the question prompt", async () => {
    const setup = await testRender(() => <QuestionPrompt prompt="Which approach?" options={["Option A", "Option B"]} onAnswer={() => {}} onCancel={() => {}} />, { width: 80, height: 24 })
    try {
      await setup.flush(); await setup.waitForVisualIdle()
      expect(setup.captureCharFrame()).toContain("Type your own answer")
      expect(setup.captureCharFrame()).toContain("Which approach?")
    } finally { setup.renderer.destroy() }
  })

  it("shows the retry countdown banner in the busy prompt footer", async () => {
    const setup = await testRender(() => (
      <SessionPrompt value="" onInput={() => {}} onSubmit={() => {}} onAbort={() => {}} onCommand={() => {}} commands={[]} agent="build" provider="Provider" model="model" cwd="C:/project" status="busy" retry={{ message: "Rate limit exceeded", attempt: 2, next: Date.now() + 10_000 }} onRetryClick={() => {}} />
    ), { width: 100, height: 30 })
    try {
      await setup.flush(); await setup.waitForVisualIdle()
      const frame = setup.captureCharFrame()
      expect(frame).toContain("Rate limit exceeded")
      expect(frame).toContain("retrying")
      expect(frame).toContain("attempt #2")
      expect(frame).toContain("interrupt")
    } finally { setup.renderer.destroy() }
  })

  it("measures the assistant turn end-to-end from the parent user message", async () => {
    const endToEnd: ChatSession = {
      ...session,
      messages: [
        { id: "user-time", role: "user", text: "Explain", time: 100, agent: "build" },
        { id: "assistant-time", role: "assistant", text: "Answer", time: 150, completed: 120_000, agent: "build", model: "test-model" },
      ],
    }
    const setup = await testRender(() => (
      <SessionScreen session={endToEnd} providerLabel="Provider" model="model" cwd="C:/project" loading={false} promptValue="" onPromptInput={() => {}} onPromptSubmit={() => {}} onAbort={() => {}} commands={[]} onCommand={() => {}} onMessageAction={() => {}} sidebarVisible={false} />
    ), { width: 100, height: 30 })
    try {
      await setup.flush(); await setup.waitForVisualIdle()
      // 120000 - 100 = 119900ms → "1m 59s"
      expect(setup.captureCharFrame()).toContain("1m 59s")
    } finally { setup.renderer.destroy() }
  })

})

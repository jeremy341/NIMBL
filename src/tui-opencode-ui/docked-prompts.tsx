import { TextAttributes, type BoxRenderable, type ScrollBoxRenderable, type TextareaRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import { SplitBorder, setBorder } from "./border"
import { NativeDiff } from "./native"
import { theme } from "./theme"

function keyName(event: any): string {
  return String(event?.name ?? event?.key ?? "").toLowerCase()
}

export interface PermissionPromptProps {
  title: string
  detail: string
  diff?: string
  tool?: string
  onOnce: () => void
  onAlways: () => void
  onReject: () => void
  onRejectWithMessage?: (message: string) => void
  disabled?: boolean
  contentWidth?: number
}

const PERMISSION_INFO: Record<string, { icon: string; label: string }> = {
  read: { icon: "→", label: "Read" },
  glob: { icon: "✱", label: "Glob" },
  grep: { icon: "✱", label: "Grep" },
  write: { icon: "←", label: "Write" },
  edit: { icon: "→", label: "Edit" },
  apply_patch: { icon: "%", label: "Apply patch" },
  bash: { icon: "#", label: "Shell command" },
  webfetch: { icon: "%", label: "WebFetch" },
  websearch: { icon: "◈", label: "WebSearch" },
  skill: { icon: "→", label: "Skill" },
  question: { icon: "→", label: "Question" },
  todowrite: { icon: "⚙", label: "Todos" },
  delegate: { icon: "│", label: "Delegate task" },
}

export function PermissionPrompt(props: PermissionPromptProps) {
  const dimensions = useTerminalDimensions()
  const renderer = useRenderer()
  const [stage, setStage] = createSignal<"permission" | "always" | "reject">("permission")
  const [fullscreen, setFullscreen] = createSignal(false)
  const [rejectMessage, setRejectMessage] = createSignal("")
  const [selected, setSelected] = createSignal<"once" | "always" | "reject">("once")
  const [alwaysSelected, setAlwaysSelected] = createSignal<"confirm" | "cancel">("confirm")
  let rejectTextarea: TextareaRenderable | undefined
  const info = () => PERMISSION_INFO[props.tool || ""] || { icon: "⚙", label: props.title }
  const options: Array<{ value: "once" | "always" | "reject"; label: string }> = [
    { value: "once", label: "Allow once" },
    { value: "always", label: "Allow always" },
    { value: "reject", label: "Reject" },
  ]

  function click(action: () => void) {
    if (renderer.getSelection()?.getSelectedText()) return
    action()
  }

  function choose(value: "once" | "always" | "reject") {
    if (value === "always") { setStage("always"); return }
    if (value === "reject") { setStage("reject"); queueMicrotask(() => rejectTextarea?.focus()); return }
    props.onOnce()
  }

  function confirmReject() {
    const message = rejectMessage().trim()
    if (message && props.onRejectWithMessage) props.onRejectWithMessage(message)
    else props.onReject()
  }

  useKeyboard((event) => {
    if (props.disabled) return
    const key = keyName(event)
    if (key === "escape" || key === "esc") {
      event.preventDefault()
      event.stopPropagation()
      if (stage() === "permission") props.onReject()
      else if (stage() === "always") setStage("permission")
      else setStage("permission")
      return
    }
    if (stage() === "reject") {
      if (key === "return" || key === "enter") {
        event.preventDefault()
        event.stopPropagation()
        confirmReject()
      }
      return
    }
    if (stage() === "always") {
      if (key === "return" || key === "enter") {
        event.preventDefault()
        event.stopPropagation()
        if (alwaysSelected() === "confirm") props.onAlways()
        else setStage("permission")
        return
      }
      if (key === "left" || key === "arrowleft" || key === "h") { setAlwaysSelected("cancel"); return }
      if (key === "right" || key === "arrowright" || key === "l") { setAlwaysSelected("confirm"); return }
      return
    }
    if (key === "return" || key === "enter") {
      event.preventDefault()
      event.stopPropagation()
      choose(selected())
      return
    }
    if ((key === "left" || key === "arrowleft" || key === "h") && selected() !== "once") { setSelected("once"); return }
    if ((key === "right" || key === "arrowright" || key === "l") && selected() !== "reject") { setSelected("reject"); return }
    if (key === "f" && event.ctrl) {
      event.preventDefault()
      event.stopPropagation()
      setFullscreen((value) => !value)
      return
    }
    if (key === "a" && !event.ctrl && !event.meta) { setSelected("always"); return }
  })

  const selectedLabel = () => options.find((option) => option.value === selected())?.label || "Allow once"

  return (
    <box
      maxHeight={fullscreen() ? undefined : 15}
      position={fullscreen() ? "absolute" : "relative"}
      top={fullscreen() ? 0 : undefined}
      left={fullscreen() ? 0 : undefined}
      right={fullscreen() ? 0 : undefined}
      bottom={fullscreen() ? 0 : undefined}
      zIndex={fullscreen() ? 2000 : undefined}
      backgroundColor={theme.backgroundPanel}
      borderColor={stage() === "reject" ? theme.error : theme.warning}
      customBorderChars={SplitBorder.customBorderChars}
      ref={(value: BoxRenderable) => setBorder(value, ["left"], SplitBorder.customBorderChars)}
    >
      <Show when={stage() === "always"}>
        <box gap={1} paddingLeft={1} paddingRight={3} paddingTop={1} paddingBottom={1}>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>Always allow</text>
          <text fg={theme.textMuted}>This will allow {props.title} until NIMBL is restarted.</text>
          <box flexDirection="row" gap={1} justifyContent="flex-end" paddingTop={1}>
            <box paddingLeft={1} paddingRight={1} backgroundColor={alwaysSelected() === "confirm" ? theme.primary : theme.backgroundMenu} onMouseUp={() => click(() => props.onAlways())}>
              <text fg={alwaysSelected() === "confirm" ? theme.selectedListItemText : theme.textMuted}>Confirm</text>
            </box>
            <box paddingLeft={1} paddingRight={1} backgroundColor={alwaysSelected() === "cancel" ? theme.warning : theme.backgroundMenu} onMouseUp={() => click(() => setStage("permission"))}>
              <text fg={alwaysSelected() === "cancel" ? theme.selectedListItemText : theme.textMuted}>Cancel</text>
            </box>
          </box>
        </box>
        <box flexDirection="row" gap={2} flexShrink={0} paddingLeft={2} paddingRight={3} paddingBottom={1}>
          <text fg={theme.text}><span style={{ fg: theme.textMuted }}>←→ </span>select</text>
          <text fg={theme.text}>enter <span style={{ fg: theme.textMuted }}>confirm</span></text>
          <text fg={theme.text}>esc <span style={{ fg: theme.textMuted }}>cancel</span></text>
        </box>
      </Show>

      <Show when={stage() === "reject"}>
        <box gap={1} paddingLeft={1} paddingRight={3} paddingTop={1} paddingBottom={1}>
          <box flexDirection="row" gap={1}>
            <text fg={theme.error}>△</text>
            <text fg={theme.error}>Reject permission</text>
          </box>
          <text fg={theme.textMuted}>Tell NIMBL what to do differently</text>
          <textarea
            height={3}
            ref={(value: TextareaRenderable) => { rejectTextarea = value }}
            initialValue=""
            placeholder="Reason for rejection..."
            placeholderColor={theme.textMuted}
            textColor={props.disabled ? theme.textMuted : theme.text}
            focusedTextColor={props.disabled ? theme.textMuted : theme.text}
            backgroundColor={theme.backgroundElement}
            focusedBackgroundColor={theme.backgroundElement}
            cursorColor={props.disabled ? theme.backgroundElement : theme.text}
            onContentChange={() => { if (rejectTextarea && !rejectTextarea.isDestroyed) setRejectMessage(rejectTextarea.plainText) }}
            onSubmit={confirmReject}
          />
        </box>
        <box flexDirection="row" gap={2} flexShrink={0} paddingLeft={2} paddingRight={3} paddingBottom={1}>
          <text fg={theme.text}>enter <span style={{ fg: theme.textMuted }}>confirm</span></text>
          <text fg={theme.text}>esc <span style={{ fg: theme.textMuted }}>cancel</span></text>
        </box>
      </Show>

      <Show when={stage() === "permission"}>
        <box gap={1} paddingLeft={1} paddingRight={3} paddingTop={1} paddingBottom={1} flexGrow={1}>
          <box flexDirection="row" gap={1} paddingLeft={1} flexShrink={0}>
            <text fg={theme.warning}>△</text>
            <text fg={theme.text}>Permission required</text>
          </box>
          <box flexDirection="row" gap={1} paddingLeft={2} flexShrink={0}>
            <text fg={theme.textMuted} flexShrink={0}>{info().icon}</text>
            <text fg={theme.text}>{info().label === props.title ? props.title : `${info().label} ${props.title}`}</text>
          </box>
          <Show when={props.detail && props.tool !== "bash"}>
            <box paddingLeft={2}>
              <text fg={theme.textMuted}>{props.detail}</text>
            </box>
          </Show>
          <Show when={props.tool === "bash" && props.detail}>
            <box paddingLeft={2}>
              <text fg={theme.text}>$ {props.detail}</text>
            </box>
          </Show>
          <Show when={props.diff}>
            {(diff) => (
              <scrollbox
                maxHeight={fullscreen() ? 24 : 7}
                ref={(value: ScrollBoxRenderable) => {
                  value.verticalScrollbarOptions = {
                    trackOptions: {
                      backgroundColor: theme.background,
                      foregroundColor: theme.borderActive,
                    },
                  }
                }}
              >
                <NativeDiff diff={diff()} width={props.contentWidth} />
              </scrollbox>
            )}
          </Show>
        </box>
        <box
          flexDirection={dimensions().width < 80 ? "column" : "row"}
          flexShrink={0}
          gap={1}
          paddingTop={1}
          paddingLeft={2}
          paddingRight={3}
          paddingBottom={1}
          backgroundColor={theme.backgroundElement}
          justifyContent={dimensions().width < 80 ? "flex-start" : "space-between"}
          alignItems={dimensions().width < 80 ? "flex-start" : "center"}
        >
          <box flexDirection="row" gap={1} flexShrink={0}>
            {options.map((option) => (
              <box
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={selected() === option.value ? theme.warning : theme.backgroundMenu}
                onMouseUp={() => click(() => choose(option.value))}
              >
                <text fg={selected() === option.value ? theme.selectedListItemText : theme.textMuted}>{option.label}</text>
              </box>
            ))}
          </box>
          <box flexDirection="row" gap={2} flexShrink={0}>
            <text fg={theme.text}>
              ←→ <span style={{ fg: theme.textMuted }}>select</span>
            </text>
            <text fg={theme.text}>
              enter <span style={{ fg: theme.textMuted }}>{selectedLabel().toLowerCase()}</span>
            </text>
            <text fg={theme.text}>
              ctrl+f <span style={{ fg: theme.textMuted }}>{fullscreen() ? "minimize" : "fullscreen"}</span>
            </text>
          </box>
        </box>
      </Show>
    </box>
  )
}

export interface QuestionPromptProps {
  prompt: string
  options: string[]
  freeform?: boolean
  onAnswer: (answer: string) => void
  onCancel?: () => void
  disabled?: boolean
}

export function QuestionPrompt(props: QuestionPromptProps) {
  const renderer = useRenderer()
  const [selected, setSelected] = createSignal(0)
  const [mouseActive, setMouseActive] = createSignal(false)
  const [custom, setCustom] = createSignal("")
  const [editingCustom, setEditingCustom] = createSignal(false)
  let textarea: TextareaRenderable | undefined
  const freeform = () => Boolean(props.freeform) || props.options.length === 0
  const count = createMemo(() => props.options.length)
  const customIndex = () => count()

  createEffect(() => {
    props.options
    setSelected(0)
    setEditingCustom(false)
  })

  function cancel() {
    if (props.onCancel) props.onCancel()
    else props.onAnswer("")
  }

  function choose(index = selected()) {
    const answer = props.options[index]
    if (answer !== undefined) props.onAnswer(answer)
  }

  function chooseCustom() {
    const value = custom().trim()
    if (!value) return cancel()
    props.onAnswer(value)
  }

  function submitCustom() {
    const value = custom().trim()
    if (!value) return cancel()
    props.onAnswer(value)
  }

  useKeyboard((event) => {
    if (props.disabled) return
    setMouseActive(false)
    const key = keyName(event)
    if (editingCustom() && textarea) {
      if (key === "return" || key === "enter") {
        event.preventDefault()
        event.stopPropagation()
        submitCustom()
        return
      }
      if (key === "escape" || key === "esc") {
        event.preventDefault()
        event.stopPropagation()
        setEditingCustom(false)
        return
      }
      return
    }
    if (freeform() && textarea) {
      if (key === "return" || key === "enter") {
        event.preventDefault()
        event.stopPropagation()
        submitCustom()
        return
      }
      if (key === "escape" || key === "esc") {
        event.preventDefault()
        event.stopPropagation()
        cancel()
        return
      }
      return
    }
    if ((key === "up" || key === "arrowup" || key === "k") && count()) {
      event.preventDefault()
      event.stopPropagation()
      setSelected((value) => (value - 1 + count() + 1) % (count() + 1))
      return
    }
    if ((key === "down" || key === "arrowdown" || key === "j") && count()) {
      event.preventDefault()
      event.stopPropagation()
      setSelected((value) => (value + 1) % (count() + 1))
      return
    }
    if (/^[1-9]$/.test(key)) {
      const number = Number(key)
      if (number >= 1 && number <= count()) {
        event.preventDefault()
        event.stopPropagation()
        setSelected(number - 1)
        choose(number - 1)
        return
      }
    }
    if (key === "return" || key === "enter") {
      event.preventDefault()
      event.stopPropagation()
      if (selected() === customIndex()) { setEditingCustom(true); queueMicrotask(() => textarea?.focus()); return }
      choose()
      return
    }
    if (key === "escape" || key === "esc") {
      event.preventDefault()
      event.stopPropagation()
      cancel()
    }
  })

  return (
    <box
      backgroundColor={theme.backgroundPanel}
      borderColor={theme.accent}
      customBorderChars={SplitBorder.customBorderChars}
      ref={(value: BoxRenderable) => setBorder(value, ["left"], SplitBorder.customBorderChars)}
    >
      <box gap={1} paddingLeft={1} paddingRight={3} paddingTop={1} paddingBottom={1}>
        <box paddingLeft={1}>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            {props.prompt}
          </text>
        </box>
        <Show when={!freeform()}>
          <box>
            <For each={props.options}>
              {(option, index) => {
                const active = () => index() === selected()
                return (
                  <box
                    onMouseMove={() => setMouseActive(true)}
                    onMouseOver={() => mouseActive() && setSelected(index())}
                    onMouseDown={() => { setMouseActive(true); setSelected(index()) }}
                    onMouseUp={() => {
                      if (renderer.getSelection()?.getSelectedText()) return
                      choose(index())
                    }}
                  >
                    <box flexDirection="row">
                      <box backgroundColor={active() ? theme.backgroundElement : undefined} paddingRight={1}>
                        <text fg={theme.textMuted}>{index() + 1}.</text>
                      </box>
                      <box backgroundColor={active() ? theme.backgroundElement : undefined}>
                        <text fg={active() ? theme.secondary : theme.text}>{option}</text>
                      </box>
                    </box>
                  </box>
                )
              }}
            </For>
            <box
              onMouseMove={() => setMouseActive(true)}
              onMouseOver={() => mouseActive() && setSelected(customIndex())}
              onMouseDown={() => { setMouseActive(true); setSelected(customIndex()) }}
              onMouseUp={() => {
                if (renderer.getSelection()?.getSelectedText()) return
                setEditingCustom(true)
                queueMicrotask(() => textarea?.focus())
              }}
            >
              <box flexDirection="row">
                <box backgroundColor={selected() === customIndex() ? theme.backgroundElement : undefined} paddingRight={1}>
                  <text fg={theme.textMuted}>{count() + 1}.</text>
                </box>
                <box backgroundColor={selected() === customIndex() ? theme.backgroundElement : undefined}>
                  <text fg={selected() === customIndex() ? theme.secondary : theme.text}>Type your own answer</text>
                </box>
              </box>
            </box>
          </box>
        </Show>
        <Show when={editingCustom() || freeform()}>
          <textarea
            height={3}
            ref={(value: TextareaRenderable) => { textarea = value }}
            initialValue=""
            placeholder="Type your own answer"
            placeholderColor={theme.textMuted}
            textColor={props.disabled ? theme.textMuted : theme.text}
            focusedTextColor={props.disabled ? theme.textMuted : theme.text}
            backgroundColor={theme.backgroundElement}
            focusedBackgroundColor={theme.backgroundElement}
            cursorColor={props.disabled ? theme.backgroundElement : theme.text}
            onContentChange={() => {
              if (textarea && !textarea.isDestroyed) setCustom(textarea.plainText)
            }}
            onSubmit={submitCustom}
          />
        </Show>
      </box>
      <box
        flexDirection="row"
        flexShrink={0}
        gap={1}
        paddingLeft={2}
        paddingRight={3}
        paddingBottom={1}
        justifyContent="space-between"
      >
        <box flexDirection="row" gap={2}>
          {freeform() || editingCustom()
            ? (
              <>
                <text fg={theme.text}>
                  enter <span style={{ fg: theme.textMuted }}>submit</span>
                </text>
                <text fg={theme.text}>
                  esc <span style={{ fg: theme.textMuted }}>dismiss</span>
                </text>
              </>
            )
            : (
              <>
                <text fg={theme.text}>
                  ↑↓ <span style={{ fg: theme.textMuted }}>select</span>
                </text>
                <text fg={theme.text}>
                  1-{count()} <span style={{ fg: theme.textMuted }}>answer</span>
                </text>
                <text fg={theme.text}>
                  enter <span style={{ fg: theme.textMuted }}>submit</span>
                </text>
                <text fg={theme.text}>
                  esc <span style={{ fg: theme.textMuted }}>dismiss</span>
                </text>
              </>
            )}
        </box>
      </box>
    </box>
  )
}

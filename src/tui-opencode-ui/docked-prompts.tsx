import { TextAttributes, type BoxRenderable, type ScrollBoxRenderable } from "@opentui/core"
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
  onOnce: () => void
  onAlways: () => void
  onReject: () => void
  disabled?: boolean
  contentWidth?: number
}

export function PermissionPrompt(props: PermissionPromptProps) {
  const dimensions = useTerminalDimensions()
  const renderer = useRenderer()

  function click(action: () => void) {
    if (renderer.getSelection()?.getSelectedText()) return
    action()
  }

  useKeyboard((event) => {
    if (props.disabled) return
    const key = keyName(event)
    if (key === "return" || key === "enter") {
      event.preventDefault()
      event.stopPropagation()
      props.onOnce()
      return
    }
    if (key === "a" && !event.ctrl && !event.meta) {
      event.preventDefault()
      event.stopPropagation()
      props.onAlways()
      return
    }
    if (key === "escape" || key === "esc") {
      event.preventDefault()
      event.stopPropagation()
      props.onReject()
    }
  })

  return (
    <box
      maxHeight={15}
      backgroundColor={theme.backgroundPanel}
      borderColor={theme.warning}
      customBorderChars={SplitBorder.customBorderChars}
      ref={(value: BoxRenderable) => setBorder(value, ["left"], SplitBorder.customBorderChars)}
    >
      <box gap={1} paddingLeft={1} paddingRight={3} paddingTop={1} paddingBottom={1} flexGrow={1}>
        <box flexDirection="row" gap={1} paddingLeft={1} flexShrink={0}>
          <text fg={theme.warning}>△</text>
          <text fg={theme.text}>Permission required</text>
        </box>
        <box flexDirection="row" gap={1} paddingLeft={2} flexShrink={0}>
          <text fg={theme.textMuted} flexShrink={0}>
            →
          </text>
          <text fg={theme.text}>{props.title}</text>
        </box>
        <Show when={props.detail}>
          <box paddingLeft={2}>
            <text fg={theme.textMuted}>{props.detail}</text>
          </box>
        </Show>
        <Show when={props.diff}>
          {(diff) => (
            <scrollbox
              maxHeight={7}
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
          <box paddingLeft={1} paddingRight={1} backgroundColor={theme.warning} onMouseUp={() => click(props.onOnce)}>
            <text fg={theme.selectedListItemText}>Allow once</text>
          </box>
          <box paddingLeft={1} paddingRight={1} backgroundColor={theme.backgroundMenu} onMouseUp={() => click(props.onAlways)}>
            <text fg={theme.textMuted}>Allow always</text>
          </box>
          <box paddingLeft={1} paddingRight={1} backgroundColor={theme.backgroundMenu} onMouseUp={() => click(props.onReject)}>
            <text fg={theme.textMuted}>Reject</text>
          </box>
        </box>
        <box flexDirection="row" gap={2} flexShrink={0}>
          <text fg={theme.text}>
            enter <span style={{ fg: theme.textMuted }}>once</span>
          </text>
          <text fg={theme.text}>
            a <span style={{ fg: theme.textMuted }}>always</span>
          </text>
          <text fg={theme.text}>
            esc <span style={{ fg: theme.textMuted }}>reject</span>
          </text>
        </box>
      </box>
    </box>
  )
}

export interface QuestionPromptProps {
  prompt: string
  options: string[]
  onAnswer: (answer: string) => void
  onCancel?: () => void
  disabled?: boolean
}

export function QuestionPrompt(props: QuestionPromptProps) {
  const renderer = useRenderer()
  const [selected, setSelected] = createSignal(0)
  const [mouseActive, setMouseActive] = createSignal(false)
  const count = createMemo(() => props.options.length)

  createEffect(() => {
    props.options
    setSelected(0)
  })

  function cancel() {
    if (props.onCancel) props.onCancel()
    else props.onAnswer("")
  }

  function choose(index = selected()) {
    const answer = props.options[index]
    if (answer !== undefined) props.onAnswer(answer)
  }

  useKeyboard((event) => {
    if (props.disabled) return
    setMouseActive(false)
    const key = keyName(event)
    if ((key === "up" || key === "arrowup") && count()) {
      event.preventDefault()
      event.stopPropagation()
      setSelected((value) => (value - 1 + count()) % count())
      return
    }
    if ((key === "down" || key === "arrowdown") && count()) {
      event.preventDefault()
      event.stopPropagation()
      setSelected((value) => (value + 1) % count())
      return
    }
    if (key === "return" || key === "enter") {
      event.preventDefault()
      event.stopPropagation()
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
        </box>
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
          <text fg={theme.text}>
            ↑↓ <span style={{ fg: theme.textMuted }}>select</span>
          </text>
          <text fg={theme.text}>
            enter <span style={{ fg: theme.textMuted }}>submit</span>
          </text>
          <text fg={theme.text}>
            esc <span style={{ fg: theme.textMuted }}>dismiss</span>
          </text>
        </box>
      </box>
    </box>
  )
}

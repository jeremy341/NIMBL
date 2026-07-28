import { TextAttributes, type BoxRenderable, type TextareaRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { EmptyBorder, SplitBorder, setBorder } from "./border"
import { Spinner } from "./spinner"
import { agentColor, theme } from "./theme"
import type { AgentMode, CommandOption, SessionPromptRef } from "./types"

const SUBMIT_KEY_BINDINGS = [
  { name: "return", action: "submit" as const },
  { name: "kpenter", action: "submit" as const },
  { name: "return", shift: true, action: "newline" as const },
]

export interface SessionPromptProps {
  value: string
  onInput(value: string): void
  onSubmit(value: string): void
  onAbort(): void
  onCommand(value: string): void
  commands: CommandOption[]
  agent: AgentMode
  provider: string
  model: string
  cwd: string
  status: "idle" | "busy"
  context?: string
  showCwd?: boolean
  disabled?: boolean
  ref?: (value: SessionPromptRef | undefined) => void
}

function keyName(event: any): string {
  return String(event?.name ?? event?.key ?? "").toLowerCase()
}

function commandName(value: string): string {
  return value.startsWith("/") ? value : `/${value}`
}

function titlecase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function commandMatches(option: CommandOption, query: string): boolean {
  const value = commandName(option.value).slice(1).toLowerCase()
  const title = option.title.toLowerCase()
  if (!query || value.startsWith(query) || title.startsWith(query)) return true
  let cursor = 0
  for (const character of `${value} ${title} ${option.description ?? ""}`.toLowerCase()) {
    if (character === query[cursor]) cursor++
    if (cursor === query.length) return true
  }
  return false
}

export function SessionPrompt(props: SessionPromptProps) {
  const dimensions = useTerminalDimensions()
  const [selected, setSelected] = createSignal(0)
  const [dismissed, setDismissed] = createSignal<string>()
  const [currentValue, setCurrentValue] = createSignal(props.value)
  let textarea: TextareaRenderable | undefined
  let syncing = false

  const maxHeight = createMemo(() => Math.max(6, Math.floor(dimensions().height / 3)))
  const slashQuery = createMemo(() => {
    const value = currentValue()
    if (!value.startsWith("/")) return undefined
    const beforeWhitespace = value.match(/^\/(\S*)$/)
    return beforeWhitespace?.[1]?.toLowerCase()
  })
  const matches = createMemo(() => {
    const query = slashQuery()
    if (query === undefined) return []
    return props.commands.filter((option) => commandMatches(option, query)).slice(0, 10)
  })
  const autocompleteOpen = createMemo(
    () => slashQuery() !== undefined && dismissed() !== currentValue() && matches().length > 0,
  )

  createEffect(() => {
    const value = props.value
    setCurrentValue(value)
    if (textarea && !textarea.isDestroyed && textarea.plainText !== value) {
      syncing = true
      textarea.setText(value)
      textarea.gotoBufferEnd()
      syncing = false
    }
  })

  createEffect(() => {
    currentValue()
    setSelected(0)
  })

  createEffect(() => {
    if (!textarea || textarea.isDestroyed) return
    if (props.disabled) textarea.blur()
  })

  function setValue(value: string) {
    setCurrentValue(value)
    if (textarea && !textarea.isDestroyed) {
      syncing = true
      textarea.setText(value)
      textarea.gotoBufferEnd()
      syncing = false
    }
    props.onInput(value)
  }

  function selectCommand(index = selected()) {
    const option = matches()[index]
    if (!option) return
    const command = commandName(option.value)
    if (option.autocomplete !== "insert") {
      setDismissed(command)
      setValue("")
      props.onCommand(command)
      return
    }
    const value = command + " "
    setDismissed(value)
    setValue(value)
    queueMicrotask(() => textarea?.focus())
  }

  function submit() {
    if (props.disabled) return
    const value = (textarea?.plainText ?? currentValue()).trim()
    if (!value) return
    if (value.startsWith("/")) props.onCommand(value)
    else props.onSubmit(value)
  }

  function onKeyDown(event: any) {
    const key = keyName(event)
    if (autocompleteOpen()) {
      if (key === "down" || key === "arrowdown") {
        event.preventDefault?.()
        event.stopPropagation?.()
        setSelected((value) => (value + 1) % matches().length)
        return
      }
      if (key === "up" || key === "arrowup") {
        event.preventDefault?.()
        event.stopPropagation?.()
        setSelected((value) => (value - 1 + matches().length) % matches().length)
        return
      }
      if (key === "return" || key === "enter") {
        event.preventDefault?.()
        event.stopPropagation?.()
        selectCommand()
        return
      }
      if (key === "escape" || key === "esc") {
        event.preventDefault?.()
        event.stopPropagation?.()
        setDismissed(currentValue())
        return
      }
    }

    if ((key === "escape" || key === "esc") && props.status === "busy") {
      event.preventDefault?.()
      event.stopPropagation?.()
      props.onAbort()
      return
    }

    if (props.disabled) event.preventDefault?.()
    // Tab intentionally bubbles to the app-level agent-mode handler.
  }

  const promptRef: SessionPromptRef = {
    focus() {
      textarea?.focus()
    },
    blur() {
      textarea?.blur()
    },
    set(value) {
      setValue(value)
    },
  }

  onMount(() => {
    const timer = setTimeout(() => {
      if (!textarea || textarea.isDestroyed || props.disabled) return
      textarea.focus()
    }, 1)
    onCleanup(() => {
      clearTimeout(timer)
      props.ref?.(undefined)
    })
  })

  return (
    <box width="100%" position="relative">
      <Show when={autocompleteOpen()}>
        <box
          position="absolute"
          top={-Math.min(10, matches().length)}
          left={0}
          zIndex={100}
          width="100%"
          borderColor={theme.border}
          ref={(value: BoxRenderable) => setBorder(value, ["left", "right"], SplitBorder.customBorderChars)}
        >
          <box backgroundColor={theme.backgroundMenu} height={Math.min(10, matches().length)}>
            <For each={matches()}>
              {(option, index) => {
                const active = () => index() === selected()
                return (
                  <box
                    paddingLeft={1}
                    paddingRight={1}
                    flexDirection="row"
                    backgroundColor={active() ? theme.primary : undefined}
                    onMouseOver={() => setSelected(index())}
                    onMouseDown={(event: any) => {
                      event.stopPropagation?.()
                      setSelected(index())
                    }}
                    onMouseUp={(event: any) => {
                      event.stopPropagation?.()
                      selectCommand(index())
                    }}
                  >
                    <text
                      flexShrink={0}
                      fg={active() ? theme.selectedListItemText : theme.text}
                      attributes={active() ? TextAttributes.BOLD : undefined}
                    >
                      {commandName(option.value)}
                    </text>
                    <text fg={active() ? theme.selectedListItemText : theme.textMuted} wrapMode="none">
                      {" " + option.title}
                      <Show when={option.description}>
                        <span style={{ fg: active() ? theme.selectedListItemText : theme.textMuted }}>
                          {" · " + option.description}
                        </span>
                      </Show>
                    </text>
                  </box>
                )
              }}
            </For>
          </box>
        </box>
      </Show>

      <box
        width="100%"
        borderColor={agentColor(props.agent)}
        customBorderChars={{
          ...SplitBorder.customBorderChars,
          bottomLeft: "╹",
        }}
        ref={(value: BoxRenderable) =>
          setBorder(value, ["left"], { ...SplitBorder.customBorderChars, bottomLeft: "╹" })
        }
      >
        <box
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          flexShrink={0}
          backgroundColor={theme.backgroundElement}
          flexGrow={1}
          width="100%"
        >
          <textarea
            width="100%"
            initialValue={props.value}
            placeholder="Ask anything..."
            placeholderColor={theme.textMuted}
            textColor={props.disabled ? theme.textMuted : theme.text}
            focusedTextColor={props.disabled ? theme.textMuted : theme.text}
            backgroundColor={theme.backgroundElement}
            focusedBackgroundColor={theme.backgroundElement}
            minHeight={1}
            maxHeight={maxHeight()}
            onContentChange={() => {
              if (!textarea || syncing) return
              const value = textarea.plainText
              setCurrentValue(value)
              props.onInput(value)
            }}
            onKeyDown={onKeyDown}
            onSubmit={submit}
            onMouseDown={(event: any) => event.target?.focus?.()}
            cursorColor={props.disabled ? theme.backgroundElement : theme.text}
            ref={(value: TextareaRenderable) => {
              textarea = value
              value.keyBindings = SUBMIT_KEY_BINDINGS
              props.ref?.(promptRef)
            }}
          />
          <box flexDirection="row" flexShrink={0} paddingTop={1} gap={1} justifyContent="space-between">
            <box flexDirection="row" gap={1}>
              <text fg={agentColor(props.agent)}>{titlecase(props.agent)}</text>
              <text fg={theme.textMuted}>·</text>
              <text flexShrink={0} fg={theme.text}>
                {props.model}
              </text>
              <text fg={theme.textMuted}>{props.provider}</text>
            </box>
          </box>
        </box>
      </box>
      <box
        height={1}
        borderColor={agentColor(props.agent)}
        customBorderChars={{
          ...EmptyBorder,
          vertical: "╹",
        }}
        ref={(value: BoxRenderable) => setBorder(value, ["left"], { ...EmptyBorder, vertical: "╹" })}
      >
        <box
          height={1}
          borderColor={theme.backgroundElement}
          customBorderChars={{
            ...EmptyBorder,
            horizontal: "▀",
          }}
          ref={(value: BoxRenderable) => setBorder(value, ["bottom"], { ...EmptyBorder, horizontal: "▀" })}
        />
      </box>
      <box width="100%" flexDirection="row" justifyContent="space-between">
        <Show
          when={props.status === "idle"}
          fallback={
            <>
              <box marginLeft={1} flexDirection="row" gap={1}>
                <Spinner color={agentColor(props.agent)} />
              </box>
              <text fg={theme.text} onMouseUp={props.onAbort}>
                esc <span style={{ fg: theme.textMuted }}>interrupt</span>
              </text>
            </>
          }
        >
          <Show when={props.showCwd !== false} fallback={<box />}>
            <box marginLeft={1}>
              <text fg={theme.textMuted} wrapMode="none">
                {props.cwd}
              </text>
            </box>
          </Show>
          <box gap={2} flexDirection="row">
            <Show
              when={props.context}
              fallback={
                <text fg={theme.text}>
                  tab <span style={{ fg: theme.textMuted }}>agents</span>
                </text>
              }
            >
              {(context) => (
                <text fg={theme.textMuted} wrapMode="none">
                  {context()}
                </text>
              )}
            </Show>
            <text fg={theme.text}>
              ctrl+p <span style={{ fg: theme.textMuted }}>commands</span>
            </text>
          </box>
        </Show>
      </box>
    </box>
  )
}

import { TextAttributes, decodePasteBytes, type BoxRenderable, type PasteEvent, type TextareaRenderable } from "@opentui/core"
import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { EmptyBorder, SplitBorder, setBorder } from "./border"
import { Spinner } from "./spinner"
import { syntaxStyle } from "./syntax"
import { agentColor, theme } from "./theme"
import type { AgentMode, CommandOption, SessionPromptRef } from "./types"

const SUBMIT_KEY_BINDINGS = [
  { name: "return", action: "submit" as const },
  { name: "kpenter", action: "submit" as const },
  { name: "return", shift: true, action: "newline" as const },
]
const PROMPT_PLACEHOLDERS = ["Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests"]
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

function promptOffsetWidth(value: string) {
  let width = 0
  for (const part of graphemes.segment(value)) width += part.segment === "\n" ? 1 : Bun.stringWidth(part.segment)
  return width
}

function displayOffsetIndex(value: string, offset: number) {
  if (offset <= 0) return 0
  let width = 0
  for (const part of graphemes.segment(value)) {
    const next = width + promptOffsetWidth(part.segment)
    if (next > offset) return part.index
    width = next
  }
  return value.length
}

export interface SessionPromptProps {
  value: string
  onInput(value: string): void
  onSubmit(value: string): void
  onAbort(): void
  onCommand(value: string): void
  onQuit?(): void
  onHistory?(direction: "previous" | "next"): void
  commands: CommandOption[]
  agents?: CommandOption[]
  files?: string[]
  agent: AgentMode
  provider: string
  model: string
  cwd: string
  status: "idle" | "busy"
  context?: string
  showCwd?: boolean
  disabled?: boolean
  retry?: { message: string; attempt: number; next: number }
  onRetryClick?: () => void
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
  const aliases = option.aliases?.map((alias) => alias.toLowerCase()) ?? []
  if (!query || value.startsWith(query) || title.startsWith(query) || aliases.some((alias) => alias.startsWith(query))) return true
  let cursor = 0
  for (const character of `${value} ${aliases.join(" ")} ${title} ${option.description ?? ""}`.toLowerCase()) {
    if (character === query[cursor]) cursor++
    if (cursor === query.length) return true
  }
  return false
}

export function SessionPrompt(props: SessionPromptProps) {
  const dimensions = useTerminalDimensions()
  const renderer = useRenderer()
  const [selected, setSelected] = createSignal(0)
  const [dismissed, setDismissed] = createSignal<string>()
  const [currentValue, setCurrentValue] = createSignal(props.value)
  const [interruptArmed, setInterruptArmed] = createSignal(false)
  const [retrySeconds, setRetrySeconds] = createSignal(0)
  const [placeholderIndex, setPlaceholderIndex] = createSignal(Math.floor(Math.random() * PROMPT_PLACEHOLDERS.length))
  let textarea: TextareaRenderable | undefined
  let root: BoxRenderable | undefined
  let interruptTimer: ReturnType<typeof setTimeout> | undefined
  let retryTimer: ReturnType<typeof setInterval> | undefined
  let placeholderTimer: ReturnType<typeof setInterval> | undefined
  let pasteTypeID = 0
  const pastedBlocks = new Map<number, string>()
  let syncing = false
  const pasteStyleID = syntaxStyle.getStyleId("extmark.paste")!
  const placeholderText = () => `Ask anything... "${PROMPT_PLACEHOLDERS[placeholderIndex() % PROMPT_PLACEHOLDERS.length]}"`
  const retryText = () => {
    const retry = props.retry
    if (!retry) return ""
    const message = retry.message.includes("exceeded your current quota") && retry.message.includes("gemini")
      ? "gemini is way too hot right now"
      : retry.message.length > 80 ? retry.message.slice(0, 80) + "..." : retry.message
    const truncatedHint = retry.message.length > 120 ? " (click to expand)" : ""
    const seconds = Math.max(0, retrySeconds())
    const duration = seconds > 0 ? `${seconds}s` : ""
    return `${message}${truncatedHint} [retrying ${duration ? `in ${duration} ` : ""}attempt #${retry.attempt}]`
  }

  createEffect(() => {
    const retry = props.retry
    if (retry) {
      setRetrySeconds(Math.max(0, Math.round((retry.next - Date.now()) / 1000)))
      if (retryTimer) clearInterval(retryTimer)
      retryTimer = setInterval(() => setRetrySeconds(Math.max(0, Math.round((retry.next - Date.now()) / 1000))), 1000)
      retryTimer.unref?.()
      return
    }
    if (retryTimer) clearInterval(retryTimer)
    retryTimer = undefined
    setRetrySeconds(0)
  })
  onCleanup(() => { if (retryTimer) clearInterval(retryTimer) })

  const maxHeight = createMemo(() => Math.max(6, Math.floor(dimensions().height / 3)))
  const autocompleteQuery = createMemo(() => {
    const value = currentValue()
    const slash = value.match(/^\/(\S*)$/)
    if (slash) return { mode: "/" as const, query: slash[1]!.toLowerCase(), start: 0 }
    const mention = value.match(/(?:^|\s)@([^\s]*)$/)
    if (!mention) return undefined
    return { mode: "@" as const, query: mention[1]!.toLowerCase(), start: value.lastIndexOf("@") }
  })
  const matches = createMemo(() => {
    const state = autocompleteQuery()
    if (!state) return []
    if (state.mode === "/") return props.commands.filter((option) => commandMatches(option, state.query)).slice(0, 10)
    const agentMatches = (props.agents ?? [])
      .filter((option) => option.value.toLowerCase().includes(state.query))
      .slice(0, 5)
      .map((option): CommandOption => ({ ...option, description: "agent" }))
    const fileMatches = (props.files ?? [])
      .filter((path) => path.toLowerCase().includes(state.query))
      .slice(0, 8)
      .map((path): CommandOption => ({ value: path, title: path, description: "file" }))
    return [...agentMatches, ...fileMatches].slice(0, 10)
  })
  const autocompleteOpen = createMemo(
    () => autocompleteQuery() !== undefined && dismissed() !== currentValue() && matches().length > 0,
  )
  const autocompleteHeight = createMemo(() => {
    dimensions()
    currentValue()
    return Math.min(10, matches().length, Math.max(1, root?.y ?? 10))
  })

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

  createEffect(() => {
    if (props.status === "busy") return
    setInterruptArmed(false)
    if (interruptTimer) clearTimeout(interruptTimer)
    interruptTimer = undefined
  })

  function setValue(value: string) {
    setCurrentValue(value)
    if (textarea && !textarea.isDestroyed) {
      syncing = true
      textarea.extmarks.clear()
      pastedBlocks.clear()
      textarea.setText(value)
      textarea.gotoBufferEnd()
      syncing = false
    }
    props.onInput(value)
  }

  function syncTextareaValue() {
    if (!textarea || textarea.isDestroyed) return
    const value = textarea.plainText
    setCurrentValue(value)
    props.onInput(value)
  }

  function expandPastedBlocks(value: string): string {
    if (!textarea || !pasteTypeID || pastedBlocks.size === 0) return value
    const ranges = textarea.extmarks.getAllForTypeId(pasteTypeID)
      .flatMap((mark) => {
        const content = pastedBlocks.get(mark.id)
        return content === undefined ? [] : [{ start: mark.start, end: mark.end, content }]
      })
      .sort((left, right) => right.start - left.start)
    let expanded = value
    for (const range of ranges) {
      const start = displayOffsetIndex(expanded, range.start)
      const end = displayOffsetIndex(expanded, range.end)
      expanded = expanded.slice(0, start) + range.content + expanded.slice(end)
    }
    return expanded
  }

  function onPaste(event: PasteEvent) {
    if (props.disabled || !textarea || textarea.isDestroyed) {
      event.preventDefault()
      return
    }
    const normalized = decodePasteBytes(event.bytes).replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    const content = normalized.trim()
    if (!content) return
    event.preventDefault()
    const lineCount = (content.match(/\n/g)?.length ?? 0) + 1
    if (lineCount >= 3 || content.length > 150) {
      const marker = `[Pasted ~${lineCount} lines]`
      const start = textarea.cursorOffset
      textarea.insertText(marker + " ")
      const id = textarea.extmarks.create({
        start,
        end: start + promptOffsetWidth(marker),
        virtual: true,
        styleId: pasteStyleID,
        typeId: pasteTypeID,
      })
      pastedBlocks.set(id, content)
    } else {
      textarea.insertText(normalized)
    }
    syncTextareaValue()
  }

  function selectCommand(index = selected()) {
    const option = matches()[index]
    if (!option) return
    const state = autocompleteQuery()
    if (state?.mode === "@") {
      const path = option.value.includes(" ") ? `"${option.value}"` : option.value
      const value = currentValue().slice(0, state.start) + `@${path} `
      setDismissed(value)
      setValue(value)
      queueMicrotask(() => textarea?.focus())
      return
    }
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
    const value = expandPastedBlocks(textarea?.plainText ?? currentValue()).trim()
    if (!value) return
    if (value === "exit" || value === "quit" || value === ":q") {
      props.onQuit?.()
      return
    }
    if (value.startsWith("/")) props.onCommand(value)
    else props.onSubmit(value)
    pastedBlocks.clear()
  }

  function requestInterrupt() {
    if (interruptArmed()) {
      setInterruptArmed(false)
      if (interruptTimer) clearTimeout(interruptTimer)
      interruptTimer = undefined
      props.onAbort()
      return
    }
    setInterruptArmed(true)
    if (interruptTimer) clearTimeout(interruptTimer)
    interruptTimer = setTimeout(() => {
      interruptTimer = undefined
      setInterruptArmed(false)
    }, 2_000)
  }

  function onKeyDown(event: any) {
    const key = keyName(event)
    if (autocompleteOpen()) {
      if (key === "tab") {
        event.preventDefault?.()
        event.stopPropagation?.()
        selectCommand()
        return
      }
      if (event.ctrl && key === "n") {
        event.preventDefault?.()
        event.stopPropagation?.()
        setSelected((value) => (value + 1) % matches().length)
        return
      }
      if (event.ctrl && key === "p") {
        event.preventDefault?.()
        event.stopPropagation?.()
        setSelected((value) => (value - 1 + matches().length) % matches().length)
        return
      }
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

    if ((key === "escape" || key === "esc") && renderer.getSelection()?.getSelectedText()) {
      event.preventDefault?.()
      event.stopPropagation?.()
      renderer.clearSelection()
      return
    }

    if ((key === "escape" || key === "esc") && props.status === "busy") {
      event.preventDefault?.()
      event.stopPropagation?.()
      requestInterrupt()
      return
    }

    if (props.status === "idle" && props.onHistory && !autocompleteOpen()) {
      if (event.ctrl && (key === "up" || key === "arrowup")) {
        event.preventDefault?.()
        event.stopPropagation?.()
        props.onHistory("previous")
        return
      }
      if (event.ctrl && (key === "down" || key === "arrowdown")) {
        event.preventDefault?.()
        event.stopPropagation?.()
        props.onHistory("next")
        return
      }
    }

    if (props.status === "idle" && !props.disabled && !autocompleteOpen() && !currentValue().trim()) {
      const name = String(event?.name ?? event?.key ?? "").toLowerCase()
      if (event.ctrl && name === "j" && textarea) {
        event.preventDefault?.()
        event.stopPropagation?.()
        textarea.insertText("\n")
        return
      }
    }

    if (props.disabled) event.preventDefault?.()
    // Tab intentionally bubbles to the app-level agent-mode handler when autocomplete is closed.
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
    placeholderTimer = setInterval(() => setPlaceholderIndex((value) => value + 1), 10_000)
    placeholderTimer.unref?.()
    onCleanup(() => {
      clearTimeout(timer)
      if (placeholderTimer) clearInterval(placeholderTimer)
      if (interruptTimer) clearTimeout(interruptTimer)
      props.ref?.(undefined)
    })
  })

  return (
    <box ref={(value: BoxRenderable) => { root = value }} width="100%" position="relative">
      <Show when={autocompleteOpen()}>
        <box
          position="absolute"
          top={-autocompleteHeight()}
          left={0}
          zIndex={100}
          width="100%"
          borderColor={theme.border}
          ref={(value: BoxRenderable) => setBorder(value, ["left", "right"], SplitBorder.customBorderChars)}
        >
          <box backgroundColor={theme.backgroundMenu} height={autocompleteHeight()}>
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
                      {autocompleteQuery()?.mode === "@" ? `@${option.value}` : commandName(option.value)}
                    </text>
                    <text fg={active() ? theme.selectedListItemText : theme.textMuted} wrapMode="none">
                      {autocompleteQuery()?.mode === "@" ? "" : " " + option.title}
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
            placeholder={placeholderText()}
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
            onPaste={onPaste}
            onSubmit={submit}
            onMouseDown={(event: any) => event.target?.focus?.()}
            cursorColor={props.disabled ? theme.backgroundElement : theme.text}
            ref={(value: TextareaRenderable) => {
              textarea = value
              value.keyBindings = SUBMIT_KEY_BINDINGS
              value.syntaxStyle = syntaxStyle
              pasteTypeID = value.extmarks.registerType("prompt-paste")
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
              <Show when={props.retry}>
                <text fg={theme.error} onMouseUp={props.onRetryClick} flexGrow={1}>{retryText()}</text>
              </Show>
              <text fg={theme.text} onMouseUp={requestInterrupt}>
                esc <span style={{ fg: theme.textMuted }}>{interruptArmed() ? "again to interrupt" : "interrupt"}</span>
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
                  tab <span style={{ fg: theme.textMuted }}>modes</span>
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

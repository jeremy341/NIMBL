import { RGBA, TextAttributes, type InputRenderable, type ScrollBoxRenderable, type TextareaRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type JSX,
  type ParentProps,
} from "solid-js"
import { Spinner } from "./spinner"
import { theme } from "./theme"
import type { CommandOption } from "./types"

const SUBMIT_KEY_BINDINGS = [
  { name: "return", action: "submit" as const },
  { name: "kpenter", action: "submit" as const },
  { name: "return", shift: true, action: "newline" as const },
]

function eventName(event: any): string {
  return String(event?.name ?? event?.key ?? "").toLowerCase()
}

function isKey(event: any, ...names: string[]): boolean {
  const name = eventName(event)
  return names.some((item) => name === item.toLowerCase())
}

export interface DialogOverlayProps {
  open: boolean
  size?: "medium" | "large" | "xlarge"
  onClose: () => void
}

export function DialogOverlay(props: ParentProps<DialogOverlayProps>) {
  const dimensions = useTerminalDimensions()
  const renderer = useRenderer()
  let dismiss = false

  const width = () => {
    if (props.size === "xlarge") return 116
    if (props.size === "large") return 88
    return 60
  }

  return (
    <Show when={props.open}>
      <box
        id="dialog-backdrop"
        onMouseDown={() => {
          dismiss = Boolean(renderer.getSelection())
        }}
        onMouseUp={() => {
          if (dismiss) {
            dismiss = false
            return
          }
          props.onClose()
        }}
        width={dimensions().width}
        height={dimensions().height}
        alignItems="center"
        position="absolute"
        zIndex={3000}
        paddingTop={dimensions().height / 4}
        left={0}
        top={0}
        backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
      >
        <box
          onMouseUp={(event: any) => {
            if (renderer.getSelection()?.getSelectedText()) return
            dismiss = false
            event.stopPropagation()
          }}
          width={width()}
          maxWidth={dimensions().width - 2}
          backgroundColor={theme.backgroundPanel}
          paddingTop={1}
        >
          {props.children}
        </box>
      </box>
    </Show>
  )
}

export interface SelectDialogProps {
  title: string
  options: CommandOption[]
  onSelect: (value: string, option: CommandOption) => void
  onClose: () => void
  footer?: JSX.Element
  footerRight?: JSX.Element
  renderFilter?: boolean
  flat?: boolean
  showSuggested?: boolean
  preserveSelection?: boolean
  onMove?: (value: string, option: CommandOption) => void
  actions?: Array<{
    key: string
    title: string
    onTrigger: (value: string, option: CommandOption) => void
  }>
}

function matches(option: CommandOption, query: string): boolean {
  if (!query) return true
  const haystack = [option.title, option.value, ...(option.aliases ?? []), option.description, option.category].filter(Boolean).join(" ").toLowerCase()
  if (haystack.includes(query)) return true
  let cursor = 0
  for (const character of haystack) {
    if (character === query[cursor]) cursor++
    if (cursor === query.length) return true
  }
  return false
}

function matchesShortcut(event: any, shortcut: string) {
  const parts = shortcut.toLowerCase().split("+")
  return eventName(event) === parts.at(-1)
    && Boolean(event.ctrl) === parts.includes("ctrl")
    && Boolean(event.shift) === parts.includes("shift")
    && Boolean(event.meta) === parts.includes("alt")
}

export function SelectDialog(props: SelectDialogProps) {
  const dimensions = useTerminalDimensions()
  const renderer = useRenderer()
  const [query, setQuery] = createSignal("")
  const [mouseActive, setMouseActive] = createSignal(false)
  const initialCurrent = props.options.findIndex((option) => option.current)
  const suggestedOffset = props.showSuggested ? props.options.filter((option) => option.suggested).length : 0
  const [selected, setSelected] = createSignal(initialCurrent >= 0 ? initialCurrent + suggestedOffset : 0)
  const [selectedValue, setSelectedValue] = createSignal(
    initialCurrent >= 0 ? props.options[initialCurrent]?.value : props.options[0]?.value,
  )
  let input: InputRenderable | undefined
  let scroll: ScrollBoxRenderable | undefined

  const source = createMemo(() => {
    if (!props.showSuggested || query().trim()) return props.options
    return [
      ...props.options.filter((option) => option.suggested).map((option) => ({ ...option, category: "Suggested" })),
      ...props.options,
    ]
  })
  const filtered = createMemo(() => {
    const needle = query().trim().toLowerCase()
    return source().filter((option) => matches(option, needle))
  })

  const grouped = createMemo(() => {
    if (props.flat && query().trim()) {
      return [["", filtered().map((option, index) => ({ option, index }))]] as Array<[string, Array<{ option: CommandOption; index: number }>]>
    }
    const groups = new Map<string, Array<{ option: CommandOption; index: number }>>()
    for (const [index, option] of filtered().entries()) {
      const category = option.category ?? ""
      const options = groups.get(category)
      const item = { option, index }
      if (options) options.push(item)
      else groups.set(category, [item])
    }
    return [...groups.entries()]
  })

  const rows = createMemo(() => {
    const headers = grouped().reduce((count, [category], index) => {
      if (!category) return count
      return count + (index > 0 ? 2 : 1)
    }, 0)
    return filtered().reduce((count, option) => count + 1 + (option.details?.length || 0), headers)
  })
  const listHeight = createMemo(() => Math.min(rows(), Math.floor(dimensions().height / 2) - 6))

  createEffect(() => {
    const options = filtered()
    const current = query().trim() ? -1 : options.findIndex((option) => option.current)
    const preserved = props.preserveSelection
      ? options.findIndex((option) => option.value === selectedValue())
      : -1
    const index = preserved >= 0 ? preserved : current >= 0 ? current : 0
    setSelected(index)
    const option = options[index]
    setSelectedValue(option?.value)
    if (option) props.onMove?.(option.value, option)
    queueMicrotask(scrollToSelection)
  })

  function scrollToSelection() {
    queueMicrotask(() => scroll?.scrollChildIntoView(`select-option-${selected()}`))
  }

  function move(next: number) {
    const count = filtered().length
    if (!count) return
    const wrapped = (next + count) % count
    setSelected(wrapped)
    const option = filtered()[wrapped]
    if (option) {
      setSelectedValue(option.value)
      props.onMove?.(option.value, option)
    }
    scrollToSelection()
  }

  function choose(index = selected()) {
    const option = filtered()[index]
    if (option) props.onSelect(option.value, option)
  }

  function onKeyDown(event: any) {
    setMouseActive(false)
    const action = props.actions?.find((item) => matchesShortcut(event, item.key))
    const option = filtered()[selected()]
    if (action && option) {
      event.preventDefault?.()
      event.stopPropagation?.()
      action.onTrigger(option.value, option)
      return
    }
    if (isKey(event, "escape", "esc")) {
      event.preventDefault?.()
      event.stopPropagation?.()
      props.onClose()
      return
    }
    if (isKey(event, "down", "arrowdown")) {
      event.preventDefault?.()
      event.stopPropagation?.()
      move(selected() + 1)
      return
    }
    if (isKey(event, "up", "arrowup")) {
      event.preventDefault?.()
      event.stopPropagation?.()
      move(selected() - 1)
      return
    }
    if (isKey(event, "home")) {
      event.preventDefault?.()
      event.stopPropagation?.()
      move(0)
      return
    }
    if (isKey(event, "end")) {
      event.preventDefault?.()
      event.stopPropagation?.()
      move(filtered().length - 1)
      return
    }
    if (isKey(event, "return", "enter")) {
      event.preventDefault?.()
      event.stopPropagation?.()
      choose()
    }
  }

  onMount(() => {
    const timer = setTimeout(() => input?.focus(), 1)
    onCleanup(() => clearTimeout(timer))
  })

  return (
    <box gap={1} paddingBottom={1} flexGrow={1}>
      <box paddingLeft={4} paddingRight={4}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            {props.title}
          </text>
          <text fg={theme.textMuted} onMouseUp={props.onClose}>
            esc
          </text>
        </box>
        <Show when={props.renderFilter !== false}>
          <box paddingTop={1}>
            <input
              ref={(value: InputRenderable) => {
                input = value
              }}
              value={query()}
              onInput={(value: string) => { setMouseActive(false); setQuery(value) }}
              onKeyDown={onKeyDown}
              focusedBackgroundColor={theme.backgroundPanel}
              backgroundColor={theme.backgroundPanel}
              cursorColor={theme.primaryForeground}
              textColor={theme.textMuted}
              focusedTextColor={theme.textMuted}
              placeholder="Search"
              placeholderColor={theme.textMuted}
            />
          </box>
        </Show>
      </box>
      <box flexGrow={1} flexShrink={1}>
        <Show
          when={grouped().length > 0}
          fallback={
            <box paddingLeft={4} paddingRight={4} paddingTop={1}>
              <text fg={theme.textMuted}>No results found</text>
            </box>
          }
        >
          <scrollbox
            ref={(value: ScrollBoxRenderable) => {
              scroll = value
              value.scrollbarOptions = { visible: false }
            }}
            paddingLeft={1}
            paddingRight={1}
            maxHeight={listHeight()}
          >
            <For each={grouped()}>
              {([category, options], groupIndex) => (
                <>
                  <Show when={category}>
                    <box paddingTop={groupIndex() > 0 ? 1 : 0} paddingLeft={3}>
                      <text fg={theme.accent} attributes={TextAttributes.BOLD}>
                        {category}
                      </text>
                    </box>
                  </Show>
                  <For each={options}>
                    {(item) => {
                      const option = item.option
                      const index = item.index
                      const active = () => index === selected()
                      return (
                        <box
                          id={`select-option-${index}`}
                          flexDirection="column"
                          position="relative"
                          onMouseMove={() => setMouseActive(true)}
                          onMouseOver={() => mouseActive() && move(index)}
                          onMouseDown={(event: any) => {
                            event.stopPropagation?.()
                            setMouseActive(true)
                            move(index)
                          }}
                          onMouseUp={(event: any) => {
                            event.stopPropagation?.()
                            if (renderer.getSelection()?.getSelectedText()) return
                            choose(index)
                          }}
                        >
                          <box
                            flexDirection="row"
                            paddingLeft={option.current || option.gutter || option.connected ? 1 : 3}
                            paddingRight={3}
                            gap={1}
                            backgroundColor={active() ? theme.primary : undefined}
                          >
                            <Show when={option.current && !option.gutter && !option.connected}>
                              <text flexShrink={0} fg={active() ? theme.selectedListItemText : theme.primaryForeground} marginRight={0}>
                                ●
                              </text>
                            </Show>
                            <Show when={option.gutter || option.connected}>
                              <box flexShrink={0} marginRight={0}>
                                <text fg={active() ? theme.selectedListItemText : theme.success}>{option.gutter || "✓"}</text>
                              </box>
                            </Show>
                            <text
                              flexGrow={1}
                              overflow="hidden"
                              wrapMode="none"
                              fg={active() ? theme.selectedListItemText : option.current ? theme.primaryForeground : theme.text}
                              attributes={active() ? TextAttributes.BOLD : undefined}
                              paddingLeft={3}
                            >
                              {truncateTitle(option.title, option.titleWidth || 61, option.truncateTitle)}
                              <Show when={option.description && option.description !== category}>
                                <span style={{ fg: active() ? theme.selectedListItemText : theme.textMuted }}>
                                  {" " + option.description}
                                </span>
                              </Show>
                            </text>
                            <Show when={(props.flat && query().trim() ? option.category : option.footer)}>
                              <box flexShrink={0}>
                                <text fg={active() ? theme.selectedListItemText : theme.textMuted}>
                                  {props.flat && query().trim() ? option.category : option.footer}
                                </text>
                              </box>
                            </Show>
                          </box>
                          <For each={option.details}>
                            {(detail) => (
                              <box paddingLeft={3} paddingRight={3}>
                                <text fg={theme.textMuted} wrapMode="none">
                                  {truncateMiddle(detail, Math.max(1, Math.min(76, dimensions().width - 12)))}
                                </text>
                              </box>
                            )}
                          </For>
                        </box>
                      )
                    }}
                  </For>
                </>
              )}
            </For>
          </scrollbox>
        </Show>
      </box>
      <Show when={props.footer || props.footerRight || props.actions?.length} fallback={<box flexShrink={0} />}>
        <box paddingRight={2} paddingLeft={4} flexDirection="row" justifyContent="space-between" flexShrink={0}>
          <box flexDirection="row" gap={2}>
            <For each={props.actions}>
              {(action) => (
                <text fg={theme.text}>
                  {action.key} <span style={{ fg: theme.textMuted }}>{action.title}</span>
                </text>
              )}
            </For>
            {props.footer}
          </box>
          <box flexDirection="row" gap={2}>{props.footerRight}</box>
        </box>
      </Show>
    </box>
  )
}

function truncateTitle(value: string, width: number, mode?: boolean | "left") {
  if (mode === false || value.length <= width) return value
  if (width <= 1) return "…"
  if (mode === "left") return "…" + value.slice(-(width - 1))
  return value.slice(0, width - 1) + "…"
}

function truncateMiddle(value: string, width: number) {
  if (value.length <= width) return value
  if (width <= 1) return "…"
  const left = Math.ceil((width - 1) / 2)
  const right = Math.floor((width - 1) / 2)
  return value.slice(0, left) + "…" + value.slice(value.length - right)
}

export interface DetailDialogProps {
  title: string
  lines: string[]
  footer?: string
  onClose: () => void
}

export function DetailDialog(props: DetailDialogProps) {
  const dimensions = useTerminalDimensions()
  const contentHeight = () =>
    Math.max(1, dimensions().height - Math.ceil(dimensions().height / 4) - (props.footer ? 6 : 4))

  useKeyboard((event) => {
    if (!isKey(event, "escape", "esc")) return
    event.preventDefault()
    event.stopPropagation()
    props.onClose()
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          {props.title}
        </text>
        <text fg={theme.textMuted} onMouseUp={props.onClose}>
          esc
        </text>
      </box>
      <scrollbox maxHeight={contentHeight()} flexShrink={1}>
        <For each={props.lines}>{(line) => <text fg={theme.text}>{line}</text>}</For>
      </scrollbox>
      <Show when={props.footer}>
        <text flexShrink={0} fg={theme.textMuted}>{props.footer}</text>
      </Show>
    </box>
  )
}

export interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel?: () => void
  onClose: () => void
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const [active, setActive] = createSignal<"confirm" | "cancel">("confirm")

  function confirm() {
    props.onConfirm()
  }

  function cancel() {
    props.onCancel?.()
    props.onClose()
  }

  useKeyboard((event) => {
    if (isKey(event, "escape", "esc")) {
      event.preventDefault()
      event.stopPropagation()
      cancel()
      return
    }
    if (isKey(event, "left", "arrowleft", "right", "arrowright")) {
      event.preventDefault()
      event.stopPropagation()
      setActive((value) => (value === "confirm" ? "cancel" : "confirm"))
      return
    }
    if (isKey(event, "return", "enter")) {
      event.preventDefault()
      event.stopPropagation()
      if (active() === "confirm") confirm()
      else cancel()
    }
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {props.title}
        </text>
        <text fg={theme.textMuted} onMouseUp={cancel}>
          esc
        </text>
      </box>
      <box paddingBottom={1}>
        <text fg={theme.textMuted}>{props.message}</text>
      </box>
      <box flexDirection="row" justifyContent="flex-end" paddingBottom={1}>
        <For each={["cancel", "confirm"] as const}>
          {(key) => (
            <box
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={key === active() ? theme.primary : undefined}
              onMouseOver={() => setActive(key)}
              onMouseUp={() => (key === "confirm" ? confirm() : cancel())}
            >
              <text fg={key === active() ? theme.selectedListItemText : theme.textMuted}>
                {key === "confirm" ? (props.confirmLabel ?? "Confirm") : (props.cancelLabel ?? "Cancel")}
              </text>
            </box>
          )}
        </For>
      </box>
    </box>
  )
}

export interface TextPromptDialogProps {
  title: string
  description?: JSX.Element
  placeholder?: string
  value?: string
  secret?: boolean
  busy?: boolean
  busyText?: string
  onConfirm: (value: string) => void
  onClose: () => void
}

export function TextPromptDialog(props: TextPromptDialogProps) {
  let textarea: TextareaRenderable | undefined
  let secretValue = props.value ?? ""
  let masking = false

  function maskSecretInput() {
    if (!props.secret || !textarea || masking) return
    const next = textarea.plainText
    const previous = "•".repeat(secretValue.length)
    if (next === previous) return
    let prefix = 0
    while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix++
    let suffix = 0
    while (
      suffix < previous.length - prefix
      && suffix < next.length - prefix
      && previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
    ) suffix++
    secretValue = secretValue.slice(0, prefix) + next.slice(prefix, next.length - suffix) + secretValue.slice(secretValue.length - suffix)
    masking = true
    textarea.setText("•".repeat(secretValue.length))
    textarea.gotoBufferEnd()
    masking = false
  }

  function confirm() {
    if (props.busy) return
    props.onConfirm(props.secret ? secretValue : textarea?.plainText ?? "")
  }

  onMount(() => {
    const timer = setTimeout(() => {
      if (!textarea || textarea.isDestroyed || props.busy) return
      textarea.focus()
      textarea.gotoLineEnd()
    }, 1)
    onCleanup(() => clearTimeout(timer))
  })

  createEffect(() => {
    if (!textarea || textarea.isDestroyed) return
    if (props.busy) textarea.blur()
    else textarea.focus()
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {props.title}
        </text>
        <text fg={theme.textMuted} onMouseUp={props.onClose}>
          esc
        </text>
      </box>
      <box gap={1}>
        {props.description}
        <textarea
          height={3}
          ref={(value: TextareaRenderable) => {
            textarea = value
            value.keyBindings = SUBMIT_KEY_BINDINGS
          }}
          initialValue={props.secret ? "•".repeat(secretValue.length) : props.value}
          placeholder={props.placeholder ?? (props.secret ? "API key" : "Enter text")}
          placeholderColor={theme.textMuted}
          textColor={props.busy ? theme.textMuted : theme.text}
          focusedTextColor={props.busy ? theme.textMuted : theme.text}
          cursorColor={props.busy ? theme.backgroundElement : theme.text}
          onContentChange={maskSecretInput}
          onSubmit={confirm}
          onKeyDown={(event: any) => {
            if (!isKey(event, "escape", "esc")) return
            event.preventDefault?.()
            event.stopPropagation?.()
            props.onClose()
          }}
        />
        <Show when={props.busy}>
          <Spinner color={theme.textMuted}>{props.busyText ?? "Working..."}</Spinner>
        </Show>
      </box>
      <box paddingBottom={1} gap={1} flexDirection="row">
        <Show when={!props.busy} fallback={<text fg={theme.textMuted}>processing...</text>}>
          <text fg={theme.text}>
            enter <span style={{ fg: theme.textMuted }}>submit</span>
          </text>
        </Show>
      </box>
    </box>
  )
}

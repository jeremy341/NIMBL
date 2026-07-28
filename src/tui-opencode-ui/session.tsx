import { RGBA, TextAttributes, type BoxRenderable, type ScrollBoxRenderable } from "@opentui/core"
import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { For, Show, createEffect, createMemo, createSignal, type JSX } from "solid-js"
import { Dynamic } from "solid-js/web"
import { SplitBorder, setBorder } from "./border"
import { PermissionPrompt, QuestionPrompt } from "./docked-prompts"
import { NativeDiff, NativeMarkdown } from "./native"
import { SessionPrompt } from "./prompt"
import { Sidebar } from "./sidebar"
import { Spinner } from "./spinner"
import { agentColor, theme } from "./theme"
import type { AgentMode, AssistantPart, ChatMessage, ChatSession, CommandOption, SessionPromptRef } from "./types"

type ToolPart = Extract<AssistantPart, { type: "tool" }>

export interface SessionScreenProps {
  session: ChatSession
  providerLabel: string
  model: string
  cwd: string
  loading: boolean
  promptValue: string
  onPromptInput(v: string): void
  onPromptSubmit(v: string): void
  onAbort(): void
  commands: CommandOption[]
  onCommand(v: string): void
  onMessageAction(id: string): void
  focusMessageID?: string
  sidebarVisible: boolean
  contextText?: string
  cost: number
  pendingApproval?: { title: string; detail: string; diff?: string }
  onApproval?(choice: "once" | "always" | "reject"): void
  pendingQuestion?: { prompt: string; options: string[] }
  onQuestion?(answer: string): void
  promptRef?: (value: SessionPromptRef | undefined) => void
}

function titlecase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function duration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${Math.max(0, Math.round(milliseconds))}ms`
  const seconds = Math.round(milliseconds / 1_000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
}

function collapseToolOutput(output: string, maxLines: number, maxChars: number) {
  const lines = output.split("\n")
  if (lines.length <= maxLines && Array.from(output).length <= maxChars) return { output, overflow: false }
  const preview = lines.slice(0, maxLines).join("\n")
  if (Array.from(preview).length > maxChars) {
    return {
      output: Array.from(preview).slice(0, Math.max(0, maxChars - 1)).join("") + "…",
      overflow: true,
    }
  }
  return { output: [...lines.slice(0, maxLines), "…"].join("\n"), overflow: true }
}

function canonicalTool(value: string): string {
  const tool = value.split(".").at(-1)?.toLowerCase().replace(/[\s-]+/g, "_") ?? "generic"
  if (tool === "applypatch") return "apply_patch"
  if (tool === "todo_write") return "todowrite"
  return tool
}

function filetype(path: string | undefined): string | undefined {
  const filename = path?.split(/[\\/]/).at(-1)
  const extension = filename?.includes(".") ? filename.split(".").at(-1)?.toLowerCase() : undefined
  if (!extension) return undefined
  const aliases: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "tsx",
    md: "markdown",
    py: "python",
    rb: "ruby",
    rs: "rust",
    yml: "yaml",
  }
  return aliases[extension] ?? extension
}

function hasSelection(renderer: ReturnType<typeof useRenderer>): boolean {
  return Boolean(renderer.getSelection()?.getSelectedText())
}

function OutputPreview(props: { output: string; maxLines: number; color?: string }) {
  const dimensions = useTerminalDimensions()
  const renderer = useRenderer()
  const [expanded, setExpanded] = createSignal(false)
  const collapsed = createMemo(() =>
    collapseToolOutput(stripAnsi(props.output.trim()), props.maxLines, props.maxLines * Math.max(20, dimensions().width - 6)),
  )
  const visible = createMemo(() => (expanded() || !collapsed().overflow ? stripAnsi(props.output.trim()) : collapsed().output))

  return (
    <box
      gap={1}
      onMouseUp={(event: any) => {
        if (!collapsed().overflow || hasSelection(renderer)) return
        event.stopPropagation?.()
        setExpanded((value) => !value)
      }}
    >
      <text fg={props.color ?? theme.text}>{visible()}</text>
      <Show when={collapsed().overflow}>
        <text fg={theme.textMuted}>{expanded() ? "Click to collapse" : "Click to expand"}</text>
      </Show>
    </box>
  )
}

export interface InlineToolProps {
  part: ToolPart
  icon: string
  pending: string
  children: JSX.Element
  iconColor?: string
  separate?: boolean
}

export function InlineTool(props: InlineToolProps) {
  const [expanded, setExpanded] = createSignal(false)
  const failed = () => props.part.state === "failed"
  const rejected = () => props.part.state === "rejected"
  const running = () => props.part.state === "running"
  const color = () => (failed() ? theme.error : running() ? theme.text : theme.textMuted)
  const clickable = () => failed() && Boolean(props.part.detail || props.part.output)

  return (
    <box
      paddingLeft={3}
      marginTop={props.separate ? 1 : 0}
      onMouseUp={() => clickable() && setExpanded((value) => !value)}
    >
      <Show
        when={!running()}
        fallback={<Spinner color={color()}>{props.pending}</Spinner>}
      >
        <box flexDirection="row">
          <text
            width={2}
            fg={failed() ? theme.error : (props.iconColor ?? color())}
            attributes={rejected() ? TextAttributes.STRIKETHROUGH : undefined}
          >
            {failed() ? "✕" : props.icon}
          </text>
          <text
            flexGrow={1}
            fg={color()}
            attributes={rejected() ? TextAttributes.STRIKETHROUGH : undefined}
          >
            {props.children}
            <Show when={rejected()}>
              <span style={{ fg: theme.textMuted }}> (rejected)</span>
            </Show>
            <Show when={failed()}>
              <span style={{ fg: theme.error }}> (failed)</span>
            </Show>
          </text>
        </box>
      </Show>
      <Show when={expanded()}>
        <box paddingLeft={2}>
          <text fg={theme.error}>{props.part.output ?? props.part.detail}</text>
        </box>
      </Show>
    </box>
  )
}

export interface BlockToolProps {
  part: ToolPart
  title?: string
  children: JSX.Element
  onClick?: () => void
}

export function BlockTool(props: BlockToolProps) {
  const renderer = useRenderer()
  const [hover, setHover] = createSignal(false)
  const running = () => props.part.state === "running"
  const failed = () => props.part.state === "failed"
  const rejected = () => props.part.state === "rejected"

  return (
    <box
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      marginTop={1}
      gap={1}
      backgroundColor={hover() ? theme.backgroundMenu : theme.backgroundPanel}
      customBorderChars={SplitBorder.customBorderChars}
      borderColor={failed() ? theme.error : theme.background}
      ref={(value: BoxRenderable) => setBorder(value, ["left"], SplitBorder.customBorderChars)}
      onMouseOver={() => props.onClick && setHover(true)}
      onMouseOut={() => setHover(false)}
      onMouseUp={() => {
        if (hasSelection(renderer)) return
        props.onClick?.()
      }}
    >
      <Show when={props.title}>
        {(title) => (
          <Show
            when={!running()}
            fallback={<Spinner color={theme.textMuted}>{title().replace(/^# /, "")}</Spinner>}
          >
            <text
              paddingLeft={3}
              fg={failed() ? theme.error : theme.textMuted}
              attributes={rejected() ? TextAttributes.STRIKETHROUGH : undefined}
            >
              {title()}
              <Show when={rejected()}> (rejected)</Show>
              <Show when={failed()}> (failed)</Show>
            </text>
          </Show>
        )}
      </Show>
      {props.children}
      <Show when={failed() && props.part.detail}>
        <text fg={theme.error}>{props.part.detail}</text>
      </Show>
    </box>
  )
}

function DiffView(props: { diff: string; path?: string }) {
  return (
    <box paddingLeft={1}>
      <NativeDiff diff={props.diff} filetype={filetype(props.path)} />
    </box>
  )
}

function toolText(part: ToolPart, verb?: string): string {
  const target = part.path ?? part.title
  const lower = target.toLowerCase()
  const label = verb?.toLowerCase()
  const prefix = verb && lower !== label && !lower.startsWith(`${label} `) ? `${verb} ` : ""
  const detail = part.detail && part.detail !== target ? ` ${part.detail}` : ""
  return `${prefix}${target}${detail}`.trim()
}

function ToolPartView(props: { part: ToolPart }) {
  const tool = createMemo(() => canonicalTool(props.part.tool))
  const output = () => props.part.output?.trim()

  return (
    <Show when={tool()} keyed>
      {(name) => {
        if (name === "bash" || name === "shell") {
          if (output()) {
            return (
              <BlockTool part={props.part} title={props.part.path ? `# Running in ${props.part.path}` : undefined}>
                <box gap={1}>
                  <text fg={theme.text}>$ {props.part.detail ?? props.part.title}</text>
                  <OutputPreview output={output()!} maxLines={10} />
                </box>
              </BlockTool>
            )
          }
          return (
            <InlineTool part={props.part} icon="$" pending="Writing command...">
              {props.part.detail ?? props.part.title}
            </InlineTool>
          )
        }

        if (name === "read") {
          return (
            <InlineTool part={props.part} icon="→" pending="Reading file...">
              {toolText(props.part, "Read")}
            </InlineTool>
          )
        }

        if (name === "glob") {
          return (
            <InlineTool part={props.part} icon="✱" pending="Finding files...">
              {toolText(props.part, "Glob")}
            </InlineTool>
          )
        }

        if (name === "grep") {
          return (
            <InlineTool part={props.part} icon="✱" pending="Searching content...">
              {toolText(props.part, "Grep")}
            </InlineTool>
          )
        }

        if (name === "write") {
          if (props.part.diff || output()) {
            return (
              <BlockTool part={props.part} title={`# Wrote ${props.part.path ?? props.part.title}`}>
                {props.part.diff ? (
                  <DiffView diff={props.part.diff} path={props.part.path} />
                ) : (
                  <OutputPreview output={output()!} maxLines={10} />
                )}
              </BlockTool>
            )
          }
          return (
            <InlineTool part={props.part} icon="←" pending="Preparing write...">
              {toolText(props.part, "Write")}
            </InlineTool>
          )
        }

        if (name === "edit" || name === "apply_patch") {
          if (props.part.diff) {
            return (
              <BlockTool
                part={props.part}
                title={`${name === "edit" ? "← Edit" : "← Patched"} ${props.part.path ?? props.part.title}`}
              >
                <DiffView diff={props.part.diff} path={props.part.path} />
              </BlockTool>
            )
          }
          return (
            <InlineTool part={props.part} icon={name === "edit" ? "←" : "%"} pending={name === "edit" ? "Preparing edit..." : "Preparing patch..."}>
              {toolText(props.part, name === "edit" ? "Edit" : "Patch")}
            </InlineTool>
          )
        }

        if (name === "webfetch") {
          return (
            <InlineTool part={props.part} icon="%" pending="Fetching from the web...">
              {toolText(props.part, "WebFetch")}
            </InlineTool>
          )
        }

        if (name === "todowrite") {
          if (output()) {
            return (
              <BlockTool part={props.part} title="# Todos">
                <OutputPreview output={output()!} maxLines={10} color={theme.textMuted} />
              </BlockTool>
            )
          }
          return (
            <InlineTool part={props.part} icon="⚙" pending="Updating todos...">
              Updating todos...
            </InlineTool>
          )
        }

        if (name === "question") {
          if (output()) {
            return (
              <BlockTool part={props.part} title="# Questions">
                <OutputPreview output={output()!} maxLines={10} />
              </BlockTool>
            )
          }
          return (
            <InlineTool part={props.part} icon="→" pending="Asking questions...">
              {props.part.title}
            </InlineTool>
          )
        }

        if (name === "skill") {
          return (
            <InlineTool part={props.part} icon="→" pending="Loading skill...">
              {toolText(props.part, "Skill")}
            </InlineTool>
          )
        }

        if (output()) {
          return (
            <BlockTool part={props.part} title={`# ${props.part.tool} ${props.part.title}`}>
              <OutputPreview output={output()!} maxLines={3} />
            </BlockTool>
          )
        }

        return (
          <InlineTool part={props.part} icon="⚙" pending="Running tool...">
            {props.part.tool} {props.part.title}
          </InlineTool>
        )
      }}
    </Show>
  )
}

function reasoningSummary(value: string): string {
  const line = value
    .replace(/\[REDACTED\]/g, "")
    .split("\n")
    .map((item) => item.replace(/^#+\s*/, "").trim())
    .find(Boolean)
  if (!line) return "Thinking"
  return line.length > 96 ? line.slice(0, 95) + "…" : line
}

function ReasoningPartView(props: { part: Extract<AssistantPart, { type: "reasoning" }> }) {
  const [expanded, setExpanded] = createSignal(false)
  const running = () => props.part.ended === undefined
  const summary = createMemo(() => reasoningSummary(props.part.text))
  const elapsed = createMemo(() =>
    props.part.ended === undefined ? undefined : duration(Math.max(0, props.part.ended - props.part.started)),
  )

  return (
    <Show when={props.part.text.trim()}>
      <box paddingLeft={3} marginTop={1} flexShrink={0}>
        <box onMouseUp={() => setExpanded((value) => !value)}>
          <Show
            when={!running()}
            fallback={<Spinner color={theme.warning}>Thinking: {summary()}</Spinner>}
          >
            <text fg={theme.warning} wrapMode="none">
              {expanded() ? "- " : "+ "}Thought: {summary()}
              <Show when={elapsed()}>
                {(value) => <span style={{ fg: theme.textMuted }}> · {value()}</span>}
              </Show>
            </text>
          </Show>
        </box>
        <Show when={expanded()}>
          <box paddingLeft={2} marginTop={1}>
            <NativeMarkdown content={props.part.text.trim()} color={theme.textMuted} />
          </box>
        </Show>
      </box>
    </Show>
  )
}

function AssistantTextPart(props: { text: string }) {
  return (
    <Show when={props.text.trim()}>
      <box paddingLeft={3} marginTop={1} flexShrink={0}>
        <NativeMarkdown content={props.text.trim()} />
      </box>
    </Show>
  )
}

function UserMessage(props: {
  message: ChatMessage
  index: number
  fallbackAgent: AgentMode
  onAction: (id: string) => void
}) {
  const renderer = useRenderer()
  const [hover, setHover] = createSignal(false)
  const color = () => agentColor(props.message.agent ?? props.fallbackAgent)

  return (
    <box
      id={props.message.id}
      borderColor={color()}
      customBorderChars={SplitBorder.customBorderChars}
      marginTop={props.index === 0 ? 0 : 1}
      ref={(value: BoxRenderable) => setBorder(value, ["left"], SplitBorder.customBorderChars)}
    >
      <box
        onMouseOver={() => setHover(true)}
        onMouseOut={() => setHover(false)}
        onMouseUp={() => {
          if (hasSelection(renderer)) return
          props.onAction(props.message.id)
        }}
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        backgroundColor={hover() ? theme.backgroundElement : theme.backgroundPanel}
        flexShrink={0}
      >
        <text fg={theme.text}>{props.message.text}</text>
        <Show when={props.message.attachments?.length}>
          <box flexDirection="row" paddingTop={1} gap={1} flexWrap="wrap">
            <For each={props.message.attachments}>
              {(attachment) => {
                const directory = /[\\/]$/.test(attachment)
                return (
                  <text fg={theme.text}>
                    <span style={{ bg: theme.secondary, fg: theme.background }}>
                      {directory ? " Directory " : " File "}
                    </span>
                    <span style={{ bg: theme.backgroundElement, fg: theme.textMuted }}> {attachment} </span>
                  </text>
                )
              }}
            </For>
          </box>
        </Show>
      </box>
    </box>
  )
}

function AssistantMessage(props: { message: ChatMessage; fallbackAgent: AgentMode; fallbackModel: string }) {
  const parts = createMemo<AssistantPart[]>(() => {
    if (props.message.parts?.length) return props.message.parts
    if (!props.message.text) return []
    return [{ id: `${props.message.id}-text`, type: "text", text: props.message.text }]
  })
  const mode = () => props.message.agent ?? props.fallbackAgent
  const model = () => props.message.model ?? props.fallbackModel
  const elapsed = () =>
    props.message.completed === undefined ? undefined : duration(Math.max(0, props.message.completed - props.message.time))

  return (
    <>
      <For each={parts()}>
        {(part) => {
          if (part.type === "text") return <AssistantTextPart text={part.text} />
          if (part.type === "reasoning") return <ReasoningPartView part={part} />
          return <ToolPartView part={part} />
        }}
      </For>
      <Show when={props.message.error}>
        {(error) => (
          <box
            paddingTop={1}
            paddingBottom={1}
            paddingLeft={2}
            marginTop={1}
            backgroundColor={theme.backgroundPanel}
            customBorderChars={SplitBorder.customBorderChars}
            borderColor={theme.error}
            ref={(value: BoxRenderable) => setBorder(value, ["left"], SplitBorder.customBorderChars)}
          >
            <text fg={theme.textMuted}>{error()}</text>
          </box>
        )}
      </Show>
      <box paddingLeft={3}>
        <text marginTop={1}>
          <span style={{ fg: agentColor(mode()) }}>▣ </span>{" "}
          <span style={{ fg: theme.text }}>{titlecase(mode())}</span>
          <span style={{ fg: theme.textMuted }}> · {model()}</span>
          <Show when={elapsed()}>
            {(value) => <span style={{ fg: theme.textMuted }}> · {value()}</span>}
          </Show>
        </text>
      </box>
    </>
  )
}

function ErrorMessage(props: { message: ChatMessage; index: number }) {
  return (
    <box
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      marginTop={props.index === 0 ? 0 : 1}
      backgroundColor={theme.backgroundPanel}
      customBorderChars={SplitBorder.customBorderChars}
      borderColor={theme.error}
      ref={(value: BoxRenderable) => setBorder(value, ["left"], SplitBorder.customBorderChars)}
    >
      <text fg={theme.textMuted}>{props.message.error ?? props.message.text}</text>
    </box>
  )
}

function SystemMessage(props: { message: ChatMessage }) {
  return (
    <box paddingLeft={3} height={1}>
      <text fg={theme.textMuted} wrapMode="none">
        {props.message.text.replace(/\s+/g, " ").slice(0, 160)}
      </text>
    </box>
  )
}

function ApprovalDock(props: { screen: SessionScreenProps }) {
  const approval = () => props.screen.pendingApproval!
  return (
    <PermissionPrompt
      title={approval().title}
      detail={approval().detail}
      diff={approval().diff}
      onOnce={() => props.screen.onApproval?.("once")}
      onAlways={() => props.screen.onApproval?.("always")}
      onReject={() => props.screen.onApproval?.("reject")}
    />
  )
}

function QuestionDock(props: { screen: SessionScreenProps }) {
  const question = () => props.screen.pendingQuestion!
  return (
    <QuestionPrompt
      prompt={question().prompt}
      options={question().options}
      onAnswer={(answer) => props.screen.onQuestion?.(answer)}
      onCancel={() => props.screen.onQuestion?.("Skipped by user")}
    />
  )
}

function ComposerDock(props: { screen: SessionScreenProps }) {
  return (
    <SessionPrompt
      value={props.screen.promptValue}
      onInput={props.screen.onPromptInput}
      onSubmit={props.screen.onPromptSubmit}
      onAbort={props.screen.onAbort}
      onCommand={props.screen.onCommand}
      commands={props.screen.commands}
      agent={props.screen.session.agent}
      provider={props.screen.providerLabel}
      model={props.screen.model}
      cwd={props.screen.cwd}
      status={props.screen.loading ? "busy" : "idle"}
      context={props.screen.contextText}
      ref={props.screen.promptRef}
    />
  )
}

function SessionDock(props: { screen: SessionScreenProps }) {
  const component = createMemo(() => {
    if (props.screen.pendingApproval) return ApprovalDock
    if (props.screen.pendingQuestion) return QuestionDock
    return ComposerDock
  })
  return <Dynamic component={component()} screen={props.screen} />
}

export function SessionScreen(props: SessionScreenProps) {
  const dimensions = useTerminalDimensions()
  let scroll: ScrollBoxRenderable | undefined
  const wide = createMemo(() => dimensions().width > 120)
  const visibleMessages = createMemo(() => props.session.messages.filter((message) => !message.hidden))
  const waiting = createMemo(() => {
    if (!props.loading) return false
    const last = visibleMessages().at(-1)
    return !last || (last.role === "assistant" && !last.text && !last.parts?.length)
  })

  createEffect(() => {
    const messageID = props.focusMessageID
    if (messageID) queueMicrotask(() => scroll?.scrollChildIntoView(messageID))
  })

  return (
    <box flexDirection="row" flexGrow={1} minHeight={0} width="100%" height="100%" backgroundColor={theme.background}>
      <box flexGrow={1} minHeight={0} paddingBottom={1} paddingLeft={2} paddingRight={2} gap={1}>
        <scrollbox ref={(value: ScrollBoxRenderable) => { scroll = value }} stickyScroll={true} stickyStart="bottom" flexGrow={1}>
          <box height={1} />
          <For each={visibleMessages()}>
            {(message, index) => {
              if (message.role === "user") {
                return (
                <UserMessage
                  message={message}
                  index={index()}
                  fallbackAgent={props.session.agent}
                  onAction={props.onMessageAction}
                />
                )
              }
              if (message.role === "assistant") {
                return <AssistantMessage message={message} fallbackAgent={props.session.agent} fallbackModel={props.model} />
              }
              if (message.role === "error") return <ErrorMessage message={message} index={index()} />
              return <SystemMessage message={message} />
            }}
          </For>
          <Show when={waiting()}>
            <box paddingLeft={3} marginTop={1}>
              <Spinner color={agentColor(props.session.agent)}>Working...</Spinner>
            </box>
          </Show>
        </scrollbox>

        <box flexShrink={0}>
          <SessionDock screen={props} />
        </box>
      </box>

      <Show when={props.sidebarVisible}>
        <Show
          when={wide()}
          fallback={
            <box
              position="absolute"
              top={0}
              left={0}
              right={0}
              bottom={0}
              zIndex={1000}
              alignItems="flex-end"
              backgroundColor={RGBA.fromInts(0, 0, 0, 70)}
            >
              <Sidebar session={props.session} cwd={props.cwd} cost={props.cost} />
            </box>
          }
        >
          <Sidebar session={props.session} cwd={props.cwd} cost={props.cost} />
        </Show>
      </Show>
    </box>
  )
}

import { RGBA, TextAttributes, type BoxRenderable, type ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid"
import { For, Index, Show, createEffect, createMemo, createSignal, onCleanup, type JSX } from "solid-js"
import { Dynamic } from "solid-js/web"
import { stripEmojis } from "@/core/response-style"
import { SplitBorder, setBorder } from "./border"
import { PermissionPrompt, QuestionPrompt } from "./docked-prompts"
import { NativeCode, NativeDiff, NativeMarkdown } from "./native"
import { SessionPrompt } from "./prompt"
import { Sidebar } from "./sidebar"
import { Spinner } from "./spinner"
import { agentColor, theme } from "./theme"
import type { AgentMode, AssistantPart, ChatMessage, ChatSession, CommandOption, SessionPromptRef, SubagentActivity } from "./types"

type ToolPart = Extract<AssistantPart, { type: "tool" }>
type TextPart = Extract<AssistantPart, { type: "text" }>
type ReasoningPart = Extract<AssistantPart, { type: "reasoning" }>

export interface SessionScreenProps {
  session: ChatSession
  providerLabel: string
  model: string
  cwd: string
  loading: boolean
  promptValue: string
  onPromptInput(v: string): void
  onPromptSubmit(v: string): void
  onPromptQuit?(): void
  onHistory?(direction: "previous" | "next"): void
  onAbort(): void
  commands: CommandOption[]
  agents?: CommandOption[]
  files?: string[]
  onCommand(v: string): void
  onMessageAction(id: string): void
  focusMessageID?: string
  sidebarVisible: boolean
  onCloseSidebar?: () => void
  contentWidth?: number
  keyboardDisabled?: boolean
  contextText?: string
  cost?: number
  pendingApproval?: { title: string; detail: string; diff?: string; tool?: string }
  onApproval?(choice: "once" | "always" | "reject" | { reject: string }): void
  onRejectWithMessage?(message: string): void
  pendingQuestion?: { prompt: string; options: string[]; freeform?: boolean }
  onQuestion?(answer: string): void
  promptRef?: (value: SessionPromptRef | undefined) => void
  subagentNavigation?: { index: number; total: number; parentTitle: string; label?: string; usage?: string; onParent(): void; onPrevious(): void; onNext(): void }
  subagentActivity?: Record<string, SubagentActivity>
  pendingApprovalToolID?: string
  onSubagentClick?: (sessionID?: string) => void
  conceal?: boolean
  thinkingMode?: "show" | "hide"
  showTimestamps?: boolean
  queued?: boolean
  hasCompaction?: boolean
  retry?: { message: string; attempt: number; next: number }
  onRetryClick?: () => void
}

function titlecase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// opencode-parity duration: ms → 1.5s → 1m 2s → 1h 2m → 1d 2h
export function duration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${Math.max(0, Math.round(milliseconds))}ms`
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(1)}s`
  if (milliseconds < 3_600_000) {
    const minutes = Math.floor(milliseconds / 60_000)
    const seconds = Math.floor((milliseconds % 60_000) / 1_000)
    return `${minutes}m ${seconds}s`
  }
  if (milliseconds < 86_400_000) {
    const hours = Math.floor(milliseconds / 3_600_000)
    const minutes = Math.floor((milliseconds % 3_600_000) / 60_000)
    return `${hours}h ${minutes}m`
  }
  const days = Math.floor(milliseconds / 86_400_000)
  const hours = Math.floor((milliseconds % 86_400_000) / 3_600_000)
  return `${days}d ${hours}h`
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

function SubagentButton(props: { label: string; shortcut?: string; onTrigger: () => void }) {
  const renderer = useRenderer()
  const [hover, setHover] = createSignal(false)
  return (
    <box
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={hover() ? theme.backgroundElement : theme.backgroundPanel}
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
      onMouseUp={() => { if (hasSelection(renderer)) return; props.onTrigger() }}
    >
      <text fg={hover() ? theme.text : theme.textMuted}>
        {props.label}
        <Show when={props.shortcut}>
          <span style={{ fg: theme.textMuted }}> {props.shortcut}</span>
        </Show>
      </text>
    </box>
  )
}

function OutputPreview(props: { output: string; maxLines: number; width: number; color?: string }) {
  const renderer = useRenderer()
  const [expanded, setExpanded] = createSignal(false)
  const collapsed = createMemo(() =>
    collapseToolOutput(stripAnsi(props.output.trim()), props.maxLines, props.maxLines * Math.max(20, props.width - 6)),
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
  pendingApprovalToolID?: string
}

export function InlineTool(props: InlineToolProps) {
  const [expanded, setExpanded] = createSignal(false)
  const failed = () => props.part.state === "failed"
  const rejected = () => props.part.state === "rejected"
  const running = () => props.part.state === "running"
  const pendingApproval = () => running() && props.pendingApprovalToolID !== undefined && props.pendingApprovalToolID === props.part.id
  const color = () => (failed() ? theme.error : pendingApproval() ? theme.warning : running() ? theme.text : theme.textMuted)
  const clickable = () => failed() && Boolean(props.part.detail || props.part.output)

  return (
    <box
      paddingLeft={3}
      marginTop={props.separate ? 1 : 0}
      onMouseUp={() => clickable() && setExpanded((value) => !value)}
    >
      <Show
        when={!running()}
        fallback={<Spinner color={color()}>~ {props.pending}</Spinner>}
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
  onHeaderClick?: () => void
  /** Completed tool details are collapsed by default, like OpenCode. */
  collapsible?: boolean
  initialExpanded?: boolean
}

export function BlockTool(props: BlockToolProps) {
  const renderer = useRenderer()
  const [hover, setHover] = createSignal(false)
  const collapsible = () => props.collapsible === true
  const [expanded, setExpanded] = createSignal(props.initialExpanded ?? !collapsible())
  const displayTitle = () => props.title ?? "# Tool details"
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
      onMouseOver={() => (props.onClick || collapsible()) && setHover(true)}
      onMouseOut={() => setHover(false)}
    >
      <Show when={Boolean(props.title) || collapsible()}>
        <box
          flexDirection="row"
          onMouseUp={(event: any) => {
            if (hasSelection(renderer)) return
            event.stopPropagation?.()
            if (props.onHeaderClick) props.onHeaderClick()
            else if (collapsible()) setExpanded((value) => !value)
          }}
        >
          <text paddingLeft={1} width={2} fg={collapsible() ? theme.primary : theme.textMuted}>{collapsible() ? (expanded() ? "−" : "+") : " "}</text>
          <Show
            when={!running()}
            fallback={<Spinner color={theme.textMuted}>{displayTitle().replace(/^# /, "")}</Spinner>}
          >
            <text
              paddingLeft={2}
              fg={failed() ? theme.error : theme.textMuted}
              attributes={rejected() ? TextAttributes.STRIKETHROUGH : undefined}
            >
              {displayTitle()}
              <Show when={rejected()}> (rejected)</Show>
              <Show when={failed()}> (failed)</Show>
            </text>
          </Show>
        </box>
      </Show>
      <Show when={!collapsible() || expanded()}>{props.children}</Show>
      <Show when={failed() && props.part.detail}>
        <text fg={theme.error}>{props.part.detail}</text>
      </Show>
    </box>
  )
}

function DiffView(props: { diff: string; path?: string; width: number }) {
  return (
    <box paddingLeft={1}>
      <NativeDiff diff={props.diff} filetype={filetype(props.path)} width={props.width} />
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

function countLines(value: string | undefined): number | undefined {
  if (!value) return undefined
  const lines = value.split("\n").filter((line) => line.trim())
  return lines.length || undefined
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : singular + "s"
}

function TodoItem(props: { status: string; content: string }) {
  const color = () => (props.status === "in_progress" ? theme.warning : theme.textMuted)
  return (
    <box flexDirection="row" gap={0}>
      <text flexShrink={0} fg={color()}>
        [{props.status === "completed" ? "✓" : props.status === "in_progress" ? "•" : " "}]{" "}
      </text>
      <text flexGrow={1} wrapMode="word" fg={color()}>
        {props.content}
      </text>
    </box>
  )
}

function parseTodoOutput(output: string | undefined): { status: string; content: string }[] {
  if (!output) return []
  const source = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  try {
    const parsed = JSON.parse(source)
    if (Array.isArray(parsed)) {
      const items = parsed.flatMap((item): { status: string; content: string }[] => {
        if (typeof item === "string") return [{ status: "pending", content: item }]
        if (!item || typeof item !== "object") return []
        const record = item as Record<string, unknown>
        const content = record.content ?? record.title ?? record.text
        const status = String(record.status ?? "pending")
        if (typeof content !== "string" || !content.trim()) return []
        return [{ status, content: content.trim() }]
      })
      if (items.length) return items
    }
  } catch { /* fall through to markdown list */ }
  return source.split("\n").flatMap((line): { status: string; content: string }[] => {
    const checkbox = line.match(/^\s*(?:[-*]\s*)?\[([ xX~>])\]\s+(.+)$/)
    if (checkbox) {
      const marker = checkbox[1]!.toLowerCase()
      return [{ status: marker === "x" ? "completed" : marker === "~" || marker === ">" ? "in_progress" : "pending", content: checkbox[2]!.trim() }]
    }
    const labelled = line.match(/^\s*(?:[-*]\s*)?(pending|in[_ -]?progress|running|completed|done)\s*[:|-]\s*(.+)$/i)
    if (!labelled) return []
    const status = labelled[1]!.toLowerCase().replace(/\s+/g, "_").replace("in_progress", "in_progress")
    return [{ status: status === "done" ? "completed" : status, content: labelled[2]!.trim() }]
  })
}

function ToolPartView(props: { part: ToolPart; width: number; onSubagentClick?: (sessionID?: string) => void; activity?: SubagentActivity; pendingApprovalToolID?: string }) {
  const tool = createMemo(() => canonicalTool(props.part.tool))
  const output = () => props.part.output?.trim()

  return (
    <Show when={tool()} keyed>
      {(name) => {
        if (name === "bash" || name === "shell") {
          if (output()) {
            return (
              <BlockTool part={props.part} collapsible initialExpanded={props.part.state === "running"} title={props.part.path ? `# Running in ${props.part.path}` : undefined}>
                <box gap={1}>
                  <text fg={theme.text}>$ {props.part.detail ?? props.part.title}</text>
                  <OutputPreview output={output()!} maxLines={10} width={props.width} />
                </box>
              </BlockTool>
            )
          }
          return (
            <InlineTool part={props.part} pendingApprovalToolID={props.pendingApprovalToolID} icon="$" pending="Writing command...">
              {props.part.detail ?? props.part.title}
            </InlineTool>
          )
        }

        if (name === "read") {
          const loaded = props.part.state === "completed" && props.part.path ? `↳ Loaded ${props.part.path}` : undefined
          return (
            <InlineTool part={props.part} pendingApprovalToolID={props.pendingApprovalToolID} icon="→" pending="Reading file...">
              {toolText(props.part, "Read")}
              <Show when={loaded}>
                <text fg={theme.textMuted}>{loaded}</text>
              </Show>
            </InlineTool>
          )
        }

        if (name === "glob") {
          const count = countLines(output())
          return (
            <InlineTool part={props.part} pendingApprovalToolID={props.pendingApprovalToolID} icon="✱" pending="Finding files...">
              {toolText(props.part, "Glob")}
              <Show when={count !== undefined}>
                <span style={{ fg: theme.textMuted }}> ({count} {plural(count!, "match")})</span>
              </Show>
            </InlineTool>
          )
        }

        if (name === "grep") {
          const count = countLines(output())
          return (
            <InlineTool part={props.part} pendingApprovalToolID={props.pendingApprovalToolID} icon="✱" pending="Searching content...">
              {toolText(props.part, "Grep")}
              <Show when={count !== undefined}>
                <span style={{ fg: theme.textMuted }}> ({count} {plural(count!, "match")})</span>
              </Show>
            </InlineTool>
          )
        }

        if (name === "write") {
          if (props.part.diff || output()) {
            return (
              <BlockTool part={props.part} collapsible initialExpanded={props.part.state === "running"} title={`# Wrote ${props.part.path ?? props.part.title}`}>
                {props.part.diff ? (
                  <DiffView diff={props.part.diff} path={props.part.path} width={props.width} />
                ) : (
                  <OutputPreview output={output()!} maxLines={10} width={props.width} />
                )}
              </BlockTool>
            )
          }
          return (
            <InlineTool part={props.part} pendingApprovalToolID={props.pendingApprovalToolID} icon="←" pending="Preparing write...">
              {toolText(props.part, "Write")}
            </InlineTool>
          )
        }

        if (name === "edit" || name === "apply_patch") {
          if (props.part.diff) {
            return (
              <BlockTool
                part={props.part}
                collapsible
                initialExpanded={props.part.state === "running"}
                title={`${name === "edit" ? "← Edit" : "← Patched"} ${props.part.path ?? props.part.title}`}
              >
                <DiffView diff={props.part.diff} path={props.part.path} width={props.width} />
              </BlockTool>
            )
          }
          return (
            <InlineTool part={props.part} pendingApprovalToolID={props.pendingApprovalToolID} icon={name === "edit" ? "←" : "%"} pending={name === "edit" ? "Preparing edit..." : "Preparing patch..."}>
              {toolText(props.part, name === "edit" ? "Edit" : "Patch")}
            </InlineTool>
          )
        }

        if (name === "webfetch") {
          return (
            <InlineTool part={props.part} pendingApprovalToolID={props.pendingApprovalToolID} icon="%" pending="Fetching from the web...">
              {toolText(props.part, "WebFetch")}
            </InlineTool>
          )
        }

        if (name === "websearch") {
          const count = countLines(output())
          return (
            <InlineTool part={props.part} pendingApprovalToolID={props.pendingApprovalToolID} icon="◈" pending="Searching web...">
              {toolText(props.part, "WebSearch")}
              <Show when={count !== undefined}>
                <span style={{ fg: theme.textMuted }}> ({count} {plural(count!, "result")})</span>
              </Show>
            </InlineTool>
          )
        }

        if (name === "todowrite") {
          const todos = parseTodoOutput(output())
          if (todos.length) {
            return (
              <BlockTool part={props.part} collapsible initialExpanded={props.part.state === "running"} title="# Todos">
                <For each={todos}>{(todo) => <TodoItem status={todo.status} content={todo.content} />}</For>
              </BlockTool>
            )
          }
          return (
            <InlineTool part={props.part} pendingApprovalToolID={props.pendingApprovalToolID} icon="⚙" pending="Updating todos...">
              Updating todos...
            </InlineTool>
          )
        }

        if (name === "question") {
          if (output()) {
            return (
              <BlockTool part={props.part} collapsible initialExpanded={props.part.state === "running"} title="# Questions">
                <OutputPreview output={output()!} maxLines={10} width={props.width} />
              </BlockTool>
            )
          }
          return (
            <InlineTool part={props.part} pendingApprovalToolID={props.pendingApprovalToolID} icon="→" pending="Asking questions...">
              {props.part.title}
            </InlineTool>
          )
        }

        if (name === "skill") {
          return (
            <InlineTool part={props.part} pendingApprovalToolID={props.pendingApprovalToolID} icon="→" pending="Loading skill...">
              {toolText(props.part, "Skill")}
            </InlineTool>
          )
        }

        if (name === "delegate" || name === "task") {
          const running = props.part.state === "running"
          const detail = props.part.detail || props.part.title
          const title = `Subagent Task — ${detail}`
          const activity = props.activity
          const partDuration = props.part.started !== undefined && props.part.ended !== undefined
            ? duration(Math.max(0, props.part.ended - props.part.started))
            : undefined
          const activityDuration = activity?.duration ?? partDuration
          const toolCount = activity?.toolcalls ?? 0
          const childID = props.part.id
          return (
            <BlockTool
              part={props.part}
              collapsible
              initialExpanded={running || toolCount > 0 || Boolean(output())}
              onClick={() => props.onSubagentClick?.(childID)}
              onHeaderClick={() => props.onSubagentClick?.(childID)}
              title={"# " + title}
            >
              <box gap={1} onMouseUp={(event: any) => { event.stopPropagation?.(); props.onSubagentClick?.(childID) }}>
                <text fg={theme.textMuted}>
                  {title}
                  <Show when={activity?.retrying}>
                    {(retrying) => (
                      <span style={{ fg: theme.error }}> ↳ Retrying (attempt {retrying().attempt}) · {retrying().message.length > 80 ? retrying().message.slice(0, 80) + "…" : retrying().message}</span>
                    )}
                  </Show>
                  <Show when={running && activity?.current && activity.current.title}>
                    <span style={{ fg: theme.textMuted }}> ↳ {activity!.current!.tool} {activity!.current!.title}</span>
                  </Show>
                  <Show when={running && !activity?.current && toolCount > 0}>
                    <span style={{ fg: theme.textMuted }}> ↳ {toolCount} toolcall{toolCount === 1 ? "" : "s"}</span>
                  </Show>
                  <Show when={!running && toolCount > 0}>
                    <span style={{ fg: theme.textMuted }}> · {toolCount} toolcall{toolCount === 1 ? "" : "s"}</span>
                  </Show>
                  <Show when={activityDuration}>
                    <span style={{ fg: theme.textMuted }}> · {activityDuration}</span>
                  </Show>
                </text>
                <Show when={output() && (props.part.state === "failed" || props.part.state === "completed")}>
                  <NativeMarkdown content={output()!} />
                </Show>
              </box>
            </BlockTool>
          )
        }

        if (output()) {
          return (
            <BlockTool part={props.part} collapsible initialExpanded={props.part.state === "running"} title={`# ${props.part.tool} ${props.part.title}`}>
              <OutputPreview output={output()!} maxLines={3} width={props.width} />
            </BlockTool>
          )
        }

        return (
          <InlineTool part={props.part} pendingApprovalToolID={props.pendingApprovalToolID} icon="⚙" pending="Running tool...">
            {props.part.tool} {props.part.title}
          </InlineTool>
        )
      }}
    </Show>
  )
}

function reasoningSummary(value: string): string {
  const line = stripEmojis(value)
    .replace(/\[REDACTED\]/g, "")
    .split("\n")
    .map((item) => item.replace(/^#+\s*/, "").trim())
    .find(Boolean)
  if (!line) return "Thinking"
  return line.length > 96 ? line.slice(0, 95) + "…" : line
}

function reasoningBody(value: string): { title: string; body: string } {
  const match = value.replace(/\[REDACTED\]/g, "").match(/^\*\*([^*\n]+)\*\*(?:\r?\n\r?\n|$)([\s\S]*)$/)
  if (!match) return { title: "", body: stripEmojis(value.trim()) }
  return { title: match[1]!.trim(), body: stripEmojis(match[2]!.trim()) }
}

function ReasoningPartView(props: { part: Extract<AssistantPart, { type: "reasoning" }>; thinkingMode?: "show" | "hide" }) {
  const [expanded, setExpanded] = createSignal(false)
  const running = () => props.part.ended === undefined
  const { title: parsedTitle, body } = reasoningBody(props.part.text)
  const summary = createMemo(() => parsedTitle || reasoningSummary(props.part.text))
  const visible = () => props.thinkingMode !== "hide" || expanded()
  const elapsed = createMemo(() =>
    props.part.ended === undefined ? undefined : duration(Math.max(0, props.part.ended - props.part.started)),
  )
  const color = createMemo(() => {
    if (props.thinkingMode === "hide" || expanded()) {
      return RGBA.fromValues(0xf5, 0xa7, 0x42, theme.thinkingOpacity).toString()
    }
    return theme.warning
  })

  return (
    <Show when={props.part.text.trim()}>
      <box paddingLeft={3} marginTop={1} flexShrink={0}>
        <box onMouseUp={() => setExpanded((value) => !value)}>
          <Show
            when={!running()}
            fallback={<Spinner color={color()}>Thinking: {summary()}</Spinner>}
          >
            <text fg={color()} wrapMode="none">
              {props.thinkingMode === "hide" || expanded() ? "- " : "+ "}Thought: {summary()}
              <Show when={elapsed()}>
                {(value) => <span style={{ fg: theme.textMuted }}> · {value()}</span>}
              </Show>
            </text>
          </Show>
        </box>
        <Show when={visible()}>
          <box paddingLeft={2} marginTop={1}>
            <NativeMarkdown content={body} color={theme.textMuted} />
          </box>
        </Show>
      </box>
    </Show>
  )
}

function AssistantTextPart(props: { text: string; conceal?: boolean }) {
  const blocks = createMemo(() => {
    const result: Array<{ type: "markdown" | "code"; content: string; language?: string }> = []
    const pattern = /```([^\n`]*)\n([\s\S]*?)```/g
    let cursor = 0
    for (const match of props.text.matchAll(pattern)) {
      const index = match.index ?? 0
      if (index > cursor) result.push({ type: "markdown", content: props.text.slice(cursor, index) })
      result.push({ type: "code", language: match[1]?.trim() || "text", content: match[2]?.replace(/\n$/, "") || "" })
      cursor = index + match[0].length
    }
    if (cursor < props.text.length) result.push({ type: "markdown", content: props.text.slice(cursor) })
    return result.length ? result : [{ type: "markdown" as const, content: props.text }]
  })

  function ConcealedCode(props: { content: string; language?: string; conceal?: boolean }) {
    const lines = () => props.content.split("\n")
    const concealed = () => props.conceal === true && lines().length > 12
    const [revealed, setRevealed] = createSignal(false)
    const visible = () => concealed() && !revealed() ? lines().slice(0, 12).join("\n") + "\n…" : props.content
    return (
      <box paddingLeft={1} paddingRight={1} backgroundColor={theme.backgroundPanel} onMouseUp={() => concealed() && setRevealed((value) => !value)}>
        <NativeCode content={visible()} filetype={props.language} />
      </box>
    )
  }

  return (
    <Show when={props.text.trim()}>
      <box paddingLeft={3} marginTop={1} flexShrink={0} gap={1}>
        <For each={blocks()}>{(block) => block.type === "code"
          ? <ConcealedCode content={block.content} language={block.language} conceal={props.conceal} />
          : <NativeMarkdown content={stripEmojis(block.content.trim())} conceal={props.conceal} />}
        </For>
      </box>
    </Show>
  )
}

function UserMessage(props: {
  message: ChatMessage
  index: number
  fallbackAgent: AgentMode
  onAction: (id: string) => void
  queued?: boolean
  showTimestamps?: boolean
}) {
  const renderer = useRenderer()
  const [hover, setHover] = createSignal(false)
  const color = () => agentColor(props.message.agent ?? props.fallbackAgent)
  const timeLabel = () => {
    const date = new Date(props.message.time)
    const today = new Date()
    const sameDay = date.toDateString() === today.toDateString()
    const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    if (sameDay) return time
    return `${time} · ${date.toLocaleDateString([], { month: "short", day: "numeric", year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined })}`
  }

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
        <Show when={props.queued || (props.showTimestamps && props.message.time)}>
          <box flexDirection="row" paddingTop={1} gap={1} alignItems="center">
            <Show when={props.queued}>
              <span style={{ bg: color(), fg: theme.background, bold: true }}> QUEUED </span>
            </Show>
            <Show when={props.showTimestamps && props.message.time}>
              <text fg={theme.textMuted}>{timeLabel()}</text>
            </Show>
          </box>
        </Show>
      </box>
    </box>
  )
}

function AssistantMessage(props: { message: ChatMessage; fallbackAgent: AgentMode; fallbackModel: string; width: number; onSubagentClick?: (sessionID?: string) => void; conceal?: boolean; thinkingMode?: "show" | "hide"; last?: boolean; userTime?: number; subagentActivity?: Record<string, SubagentActivity>; pendingApprovalToolID?: string }) {
  const parts = createMemo<AssistantPart[]>(() => {
    if (props.message.parts?.length) return props.message.parts
    if (!props.message.text) return []
    return [{ id: `${props.message.id}-text`, type: "text", text: props.message.text }]
  })
  const mode = () => props.message.agent ?? props.fallbackAgent
  const model = () => props.message.model ?? props.fallbackModel
  const interrupted = () => props.message.error?.includes("Interrupted by user") ?? false
  // End-to-end duration from the parent user message (opencode behavior).
  const durationMs = () =>
    props.message.completed === undefined ? 0 : Math.max(0, props.message.completed - (props.userTime ?? props.message.time))
  const final = () => props.message.completed !== undefined && props.message.error === undefined
  const hasSubagents = () => props.message.parts?.some((part) => part.type === "tool" && (part.tool === "delegate" || part.tool === "task")) ?? false
  const showFooter = () => Boolean(props.last || final() || interrupted())

  return (
    <>
      <Index each={parts()}>
        {(part) => {
          if (part().type === "text") return <AssistantTextPart text={(part() as TextPart).text} conceal={props.conceal} />
          if (part().type === "reasoning") return <ReasoningPartView part={part() as ReasoningPart} thinkingMode={props.thinkingMode ?? (props.conceal ? "hide" : "show")} />
          return <ToolPartView part={part() as ToolPart} width={props.width} onSubagentClick={props.onSubagentClick} activity={props.subagentActivity?.[(part() as ToolPart).id]} pendingApprovalToolID={props.pendingApprovalToolID} />
        }}
      </Index>
      <Show when={hasSubagents() && props.message.completed !== undefined}>
        <box paddingTop={1} paddingLeft={3}>
          <text fg={theme.textMuted}>
            <span style={{ fg: theme.primary }}>view</span> <span style={{ fg: theme.textMuted }}>subagents</span>
          </text>
        </box>
      </Show>      <Show when={props.message.error}>
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
            <NativeMarkdown content={error()} color={theme.error} />
          </box>
        )}
      </Show>
      <Show when={showFooter()}>
        <box paddingLeft={3}>
          <text marginTop={1}>
            <span style={{ fg: agentColor(mode()) }}>▣ </span>{" "}
            <span style={{ fg: theme.text }}>{titlecase(mode())}</span>
            <span style={{ fg: theme.textMuted }}> · {model()}</span>
            <Show when={durationMs()}>
              <span style={{ fg: theme.textMuted }}> · {duration(durationMs())}</span>
            </Show>
            <Show when={interrupted()}>
              <span style={{ fg: theme.textMuted }}> · interrupted</span>
            </Show>
          </text>
        </box>
      </Show>
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
      <NativeMarkdown content={props.message.error ?? props.message.text} color={theme.error} />
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
      tool={approval().tool}
      disabled={props.screen.keyboardDisabled}
      contentWidth={props.screen.contentWidth}
      onOnce={() => props.screen.onApproval?.("once")}
      onAlways={() => props.screen.onApproval?.("always")}
      onReject={() => props.screen.onApproval?.("reject")}
      onRejectWithMessage={(message) => props.screen.onApproval?.("reject") && props.screen.onRejectWithMessage?.(message)}
    />
  )
}

function QuestionDock(props: { screen: SessionScreenProps }) {
  const question = () => props.screen.pendingQuestion!
  return (
    <QuestionPrompt
      prompt={question().prompt}
      options={question().options}
      freeform={question().freeform}
      disabled={props.screen.keyboardDisabled}
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
      onQuit={props.screen.onPromptQuit}
      onHistory={props.screen.onHistory}
      onAbort={props.screen.onAbort}
      onCommand={props.screen.onCommand}
      commands={props.screen.commands}
      agents={props.screen.agents}
      files={props.screen.files}
      agent={props.screen.session.agent}
      provider={props.screen.providerLabel}
      model={props.screen.model}
      cwd={props.screen.cwd}
      status={props.screen.loading ? "busy" : "idle"}
      context={props.screen.contextText}
      disabled={props.screen.keyboardDisabled}
      retry={props.screen.retry}
      onRetryClick={props.screen.onRetryClick}
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
  let scrollTimer: ReturnType<typeof setTimeout> | undefined
  let previousSessionID = props.session.id
  let previousMessageCount = props.session.messages.length
  const wide = createMemo(() => dimensions().width > 120)
  const visibleMessages = createMemo(() => props.session.messages.filter((message) => !message.hidden))
  const waiting = createMemo(() => {
    if (!props.loading) return false
    const last = visibleMessages().at(-1)
    if (!last || last.role !== "assistant") return true
    return last.completed !== undefined || (!last.text && !last.parts?.length)
  })

  useKeyboard((event: any) => {
    if (!props.sidebarVisible || wide()) return
    const key = String(event?.name ?? event?.key ?? "").toLowerCase()
    if (key !== "escape" && key !== "esc") return
    event.preventDefault?.()
    event.stopPropagation?.()
    props.onCloseSidebar?.()
  })

  createEffect(() => {
    const messageID = props.focusMessageID
    if (messageID) queueMicrotask(() => scroll?.scrollChildIntoView(messageID))
  })

  createEffect(() => {
    const sessionID = props.session.id
    const count = props.session.messages.length
    const shouldScroll = sessionID !== previousSessionID || count > previousMessageCount
    previousSessionID = sessionID
    previousMessageCount = count
    if (!shouldScroll) return
    if (scrollTimer) clearTimeout(scrollTimer)
    scrollTimer = setTimeout(() => {
      scrollTimer = undefined
      if (!scroll || scroll.isDestroyed) return
      scroll.scrollTo(scroll.scrollHeight)
    }, 50)
  })

  onCleanup(() => {
    if (scrollTimer) clearTimeout(scrollTimer)
  })

  return (
    <box flexDirection="row" flexGrow={1} minHeight={0} width="100%" height="100%" backgroundColor={theme.background}>
      <box flexGrow={1} minHeight={0} paddingBottom={1} paddingLeft={2} paddingRight={2} gap={1}>
        <scrollbox ref={(value: ScrollBoxRenderable) => { scroll = value }} stickyScroll={true} stickyStart="bottom" flexGrow={1}>
          <box height={1} />
          <Show keyed when={props.session.id}>
            {(_sessionID) => (
              <>
                <Show when={props.hasCompaction && visibleMessages().length > 0}>
                  <box
                    marginTop={1}
                    borderColor={theme.borderActive}
                    customBorderChars={SplitBorder.customBorderChars}
                    ref={(value: BoxRenderable) => setBorder(value, ["top"], { ...SplitBorder.customBorderChars, vertical: "" })}
                    title=" Compaction "
                    titleAlignment="center"
                  />
                </Show>
                <Index each={visibleMessages()}>
                  {(message, index) => {
                    if (message().role === "user") {
                      return (
                        <UserMessage
                          message={message()}
                          index={index}
                          fallbackAgent={props.session.agent}
                          onAction={props.onMessageAction}
                          queued={props.queued}
                          showTimestamps={props.showTimestamps}
                        />
                      )
                    }
                    if (message().role === "assistant") {
                      let userTime: number | undefined
                      for (let previous = index - 1; previous >= 0; previous--) {
                        const prior = visibleMessages()[previous]
                        if (prior?.role === "user") { userTime = prior.time; break }
                      }
                      return (
                        <AssistantMessage
                          message={message()}
                          fallbackAgent={props.session.agent}
                          fallbackModel={props.model}
                          width={props.contentWidth ?? Math.max(20, dimensions().width - 4)}
                          onSubagentClick={props.onSubagentClick}
                          conceal={props.conceal}
                          thinkingMode={props.thinkingMode}
                          last={index === visibleMessages().length - 1}
                          userTime={userTime}
                          subagentActivity={props.subagentActivity}
                          pendingApprovalToolID={props.pendingApprovalToolID}
                        />
                      )
                    }
                    if (message().role === "error") return <ErrorMessage message={message()} index={index} />
                    return <SystemMessage message={message()} />
                  }}
                </Index>
              </>
            )}
          </Show>
          <Show when={waiting()}>
            <box paddingLeft={3} marginTop={1}>
              <Spinner color={agentColor(props.session.agent)}>Working...</Spinner>
            </box>
          </Show>
        </scrollbox>

        <box flexShrink={0}>
          <Show when={props.subagentNavigation}>
            {(navigation) => (
              <box
                paddingTop={1}
                paddingBottom={1}
                paddingLeft={2}
                paddingRight={1}
                borderColor={theme.border}
                customBorderChars={SplitBorder.customBorderChars}
                backgroundColor={theme.backgroundPanel}
                ref={(value: BoxRenderable) => setBorder(value, ["left"], SplitBorder.customBorderChars)}
              >
                <box flexDirection="row" justifyContent="space-between" gap={1}>
                  <box flexDirection="row" gap={1} alignItems="center">
                    <text fg={theme.text}><b>{navigation().label || "Subagent"}</b></text>
                    <Show when={navigation().total > 0}>
                      <text fg={theme.textMuted}>({navigation().index} of {navigation().total})</text>
                    </Show>
                    <Show when={navigation().usage}>
                      <text fg={theme.textMuted} wrapMode="none">{navigation().usage}</text>
                    </Show>
                  </box>
                  <box flexDirection="row" gap={2}>
                    <SubagentButton label="Parent" shortcut="↑" onTrigger={navigation().onParent} />
                    <SubagentButton label="Prev" shortcut="←" onTrigger={navigation().onPrevious} />
                    <SubagentButton label="Next" shortcut="→" onTrigger={navigation().onNext} />
                  </box>
                </box>
              </box>
            )}
          </Show>
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
              onMouseUp={() => props.onCloseSidebar?.()}
            >
              <box onMouseUp={(event: any) => event.stopPropagation?.()}>
                <Sidebar session={props.session} cwd={props.cwd} cost={props.cost} />
              </box>
            </box>
          }
        >
          <Sidebar session={props.session} cwd={props.cwd} cost={props.cost} />
        </Show>
      </Show>
    </box>
  )
}

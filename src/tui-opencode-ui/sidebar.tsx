import type { ScrollBoxRenderable } from "@opentui/core"
import { For, Show, createMemo, createSignal } from "solid-js"
import { theme } from "./theme"
import type { AssistantPart, ChatSession } from "./types"

export interface SidebarProps {
  session: ChatSession
  cwd: string
  cost: number
  overlay?: boolean
}

interface Todo {
  content: string
  status: "pending" | "in_progress" | "completed"
}

interface ModifiedFile {
  file: string
  additions: number
  deletions: number
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

function canonicalTool(tool: string): string {
  return tool.split(".").at(-1)?.toLowerCase().replace(/[\s-]+/g, "_") ?? ""
}

function todoStatus(value: unknown): Todo["status"] {
  if (value === "completed" || value === "done" || value === "complete") return "completed"
  if (value === "in_progress" || value === "in-progress" || value === "running" || value === "active") {
    return "in_progress"
  }
  return "pending"
}

function todoFromUnknown(value: unknown): Todo[] {
  if (Array.isArray(value)) {
    return value.flatMap((item): Todo[] => {
      if (typeof item === "string") return [{ content: item, status: "pending" }]
      if (!item || typeof item !== "object") return []
      const record = item as Record<string, unknown>
      const content = record.content ?? record.title ?? record.text ?? record.task
      if (typeof content !== "string" || !content.trim()) return []
      return [{ content: content.trim(), status: todoStatus(record.status) }]
    })
  }
  if (!value || typeof value !== "object") return []
  const record = value as Record<string, unknown>
  return todoFromUnknown(record.todos ?? record.tasks ?? record.items)
}

function parseTodos(output: string | undefined): Todo[] {
  if (!output?.trim()) return []
  const source = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  try {
    const parsed = todoFromUnknown(JSON.parse(source))
    if (parsed.length) return parsed
  } catch {
    // Tool adapters also emit compact markdown lists; parse those below.
  }

  return source.split("\n").flatMap((line): Todo[] => {
    const checkbox = line.match(/^\s*(?:[-*]\s*)?\[([ xX~>])\]\s+(.+)$/)
    if (checkbox) {
      const marker = checkbox[1]
      return [
        {
          content: checkbox[2].trim(),
          status: marker?.toLowerCase() === "x" ? "completed" : marker === "~" || marker === ">" ? "in_progress" : "pending",
        },
      ]
    }
    const labelled = line.match(/^\s*(?:[-*]\s*)?(pending|in[_ -]?progress|running|completed|done)\s*[:|-]\s*(.+)$/i)
    if (!labelled) return []
    return [{ content: labelled[2].trim(), status: todoStatus(labelled[1].toLowerCase().replace(" ", "_")) }]
  })
}

function lines(value: string): string[] {
  if (!value) return []
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
}

function lineCounts(value: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const line of lines(value)) counts.set(line, (counts.get(line) ?? 0) + 1)
  return counts
}

function roughChanges(before: string, after: string): Pick<ModifiedFile, "additions" | "deletions"> {
  const left = lineCounts(before)
  const right = lineCounts(after)
  let additions = 0
  let deletions = 0
  for (const [line, count] of right) additions += Math.max(0, count - (left.get(line) ?? 0))
  for (const [line, count] of left) deletions += Math.max(0, count - (right.get(line) ?? 0))
  return { additions, deletions }
}

function modifiedFiles(session: ChatSession): ModifiedFile[] {
  const files = new Map<string, { before: string; after: string; first: number; last: number }>()
  for (const snapshot of session.snapshots ?? []) {
    const current = files.get(snapshot.path)
    if (!current) {
      files.set(snapshot.path, {
        before: snapshot.before,
        after: snapshot.after,
        first: snapshot.time,
        last: snapshot.time,
      })
      continue
    }
    if (snapshot.time < current.first) {
      current.before = snapshot.before
      current.first = snapshot.time
    }
    if (snapshot.time >= current.last) {
      current.after = snapshot.after
      current.last = snapshot.time
    }
  }
  return [...files.entries()].flatMap(([file, value]) => {
    if (value.before === value.after) return []
    return [{ file, ...roughChanges(value.before, value.after) }]
  })
}

function truncateLeft(value: string, width: number): string {
  if (value.length <= width) return value
  if (width <= 1) return "…"
  return "…" + value.slice(-(width - 1))
}

function pathParts(cwd: string): { parent: string; name: string } {
  const normalized = cwd.replace(/\\/g, "/").replace(/\/$/, "")
  const index = normalized.lastIndexOf("/")
  if (index < 0) return { parent: "", name: normalized }
  return { parent: normalized.slice(0, index), name: normalized.slice(index + 1) }
}

function latestTodoOutput(session: ChatSession): string | undefined {
  for (let messageIndex = session.messages.length - 1; messageIndex >= 0; messageIndex--) {
    const parts = session.messages[messageIndex]?.parts ?? []
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex--) {
      const part: AssistantPart | undefined = parts[partIndex]
      if (part?.type === "tool" && ["todowrite", "todo_write"].includes(canonicalTool(part.tool))) return part.output
    }
  }
  return undefined
}

function TodoItem(props: { todo: Todo }) {
  const color = () => (props.todo.status === "in_progress" ? theme.warning : theme.textMuted)
  return (
    <box flexDirection="row" gap={0}>
      <text flexShrink={0} fg={color()}>
        [{props.todo.status === "completed" ? "✓" : props.todo.status === "in_progress" ? "•" : " "}]{" "}
      </text>
      <text flexGrow={1} wrapMode="word" fg={color()}>
        {props.todo.content}
      </text>
    </box>
  )
}

function changeCountWidth(item: ModifiedFile): number {
  return [item.additions ? `+${item.additions}` : "", item.deletions ? `-${item.deletions}` : ""]
    .filter(Boolean)
    .join(" ").length
}

export function Sidebar(props: SidebarProps) {
  const [todoOpen, setTodoOpen] = createSignal(true)
  const [filesOpen, setFilesOpen] = createSignal(true)
  const todos = createMemo(() => parseTodos(latestTodoOutput(props.session)))
  const showTodos = createMemo(() => todos().length > 0 && todos().some((todo) => todo.status !== "completed"))
  const files = createMemo(() => modifiedFiles(props.session))
  const path = createMemo(() => pathParts(props.cwd))
  const tokens = createMemo(() => props.session.contextTokens ?? 0)
  const percent = createMemo(() => {
    const window = props.session.contextWindow
    if (!window) return 0
    return Math.round((tokens() / window) * 100)
  })

  return (
    <box
      backgroundColor={theme.backgroundPanel}
      width={42}
      height="100%"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      paddingRight={2}
      position={props.overlay ? "absolute" : "relative"}
    >
      <scrollbox
        flexGrow={1}
        ref={(value: ScrollBoxRenderable) => {
          value.verticalScrollbarOptions = {
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }
        }}
      >
        <box flexShrink={0} gap={1} paddingRight={1}>
          <box paddingRight={1}>
            <text fg={theme.text}>
              <b>{props.session.title}</b>
            </text>
          </box>

          <box>
            <text fg={theme.text}>
              <b>Context</b>
            </text>
            <text fg={theme.textMuted}>{tokens().toLocaleString()} tokens</text>
            <text fg={theme.textMuted}>{percent()}% used</text>
            <text fg={theme.textMuted}>{money.format(props.cost)} spent</text>
          </box>

          <Show when={showTodos()}>
            <box>
              <box flexDirection="row" gap={1} onMouseDown={() => todos().length > 2 && setTodoOpen((value) => !value)}>
                <Show when={todos().length > 2}>
                  <text fg={theme.text}>{todoOpen() ? "▼" : "▶"}</text>
                </Show>
                <text fg={theme.text}>
                  <b>Todo</b>
                </text>
              </box>
              <Show when={todos().length <= 2 || todoOpen()}>
                <For each={todos()}>{(todo) => <TodoItem todo={todo} />}</For>
              </Show>
            </box>
          </Show>

          <Show when={files().length > 0}>
            <box>
              <box flexDirection="row" gap={1} onMouseDown={() => files().length > 2 && setFilesOpen((value) => !value)}>
                <Show when={files().length > 2}>
                  <text fg={theme.text}>{filesOpen() ? "▼" : "▶"}</text>
                </Show>
                <text fg={theme.text}>
                  <b>Modified Files</b>
                </text>
              </box>
              <Show when={files().length <= 2 || filesOpen()}>
                <For each={files()}>
                  {(item) => (
                    <box flexDirection="row" gap={1} justifyContent="space-between">
                      <text fg={theme.textMuted} wrapMode="none">
                        {truncateLeft(item.file, Math.max(2, 36 - changeCountWidth(item)))}
                      </text>
                      <box flexDirection="row" gap={1} flexShrink={0}>
                        <Show when={item.additions}>
                          <text fg={theme.diffAdded}>+{item.additions}</text>
                        </Show>
                        <Show when={item.deletions}>
                          <text fg={theme.diffRemoved}>-{item.deletions}</text>
                        </Show>
                      </box>
                    </box>
                  )}
                </For>
              </Show>
            </box>
          </Show>
        </box>
      </scrollbox>

      <box flexShrink={0} gap={1} paddingTop={1}>
        <text>
          <span style={{ fg: theme.textMuted }}>{path().parent ? path().parent + "/" : ""}</span>
          <span style={{ fg: theme.text }}>{path().name}</span>
        </text>
        <text fg={theme.textMuted}>
          <span style={{ fg: theme.success }}>•</span> <b>NIMBL</b>
        </text>
      </box>
    </box>
  )
}

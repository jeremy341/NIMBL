# Agent Activity Visual Feedback — NIMBL vs OpenCode

**Analysis date:** 2026-08-14
**Reference:** opencode `packages/tui/src/routes/session/index.tsx` (v1.18.5), NIMBL `src/tui-opencode-ui/session.tsx` + `src/tui-opencode.tsx`.

This document analyzes two related topics:
1. **Grey/pending text** that appears while an agent is working — the "Reading file...", "Searching content...", `~ <pending>` lines, and the per-tool status text.
2. **Subagent inspection** — can you click an agent to see what it's doing, get a summary at the end, and cycle through child agents with arrow keys?

---

## Part 1 — Live Tool Activity Feedback ("the grey text")

### 1.1 How opencode does it

opencode streams **per-tool parts** into the assistant message. Each tool call becomes a `tool` part with a state machine `pending → running → completed/error`. While running, the TUI shows a spinner + `~ <pending-verb>` line; when done it swaps to an icon + muted text. The key pieces (`routes/session/index.tsx`):

| Tool | icon | pending text (while running) | completed text (muted) |
|---|---|---|---|
| read | `→` | `~ Reading file...` (spinner) | `Read <path>` + `↳ Loaded <path>` (muted) |
| glob | `✱` | `~ Finding files...` | `Glob "<pattern>"` + `(N matches)` |
| grep | `✱` | `~ Searching content...` | `Grep "<pattern>"` + `(N matches)` |
| write | `←` | `~ Writing file...` | `← Write <path>` |
| edit | `←` | `~ Editing file...` | `← Edit <path>` (block + diff) |
| apply_patch | `%` | `~ Patching...` | `← Patched <file>` |
| bash | `$` | `# Running in <workdir>` + `$ <cmd>` (block, spinner) | block with output (collapsed to 10 lines, `Click to expand`) |
| webfetch | `%` | `~ Fetching from the web...` | `WebFetch <url>` |
| websearch | `◈` | `~ Searching web...` | `<Provider> "<query>"` + `(N results)` |
| task | `│`/`✓` | `~ Delegating...` | `Agent Task — <desc>` + `↳ <Tool> <title>` + `↳ N toolcallscalls` + `↳ 3 toolcalls · 1m 2s` |
| todowrite | `` | `~ Updating todos...` | `# Todos` block |
| question | `→` | `~ Asking...` | `# Questions` block |
| skill | `→` | `~ Loading skill...` | `Skill <name>` |
| generic | `` | `~ Running tool...` | `# <tool> <title>` block |

**The "grey text" mechanics (`InlineToolRow`, lines 1907–1985):**
- While running: `<Spinner color={props.color}>{props.children}</Spinner>` — a braille spinner followed by the children, all in `theme.textMuted` (grey `#808080`).
- When complete: `<text fg={props.color}>` where `props.complete` makes `fg()` return `theme.textMuted` — so **completed tool rows render in grey** (`fg = theme.textMuted`).
- When a permission prompt is pending for the tool: `fg()` returns `theme.warning` (amber highlight) — the tool row turns amber while waiting for approval.
- Failed: `theme.error` (red). Denied: strikethrough + muted.
- Hover on a clickable tool row switches to `theme.text` (white).

**Notably, `read` even appends a second muted line** `↳ Loaded <path>` (paddingLeft 3) for each file the read tool touched (`loaded` metadata, line 2150–2180). `grep`/`glob`/`websearch` show match counts in muted `(N matches)`. So opencode gives continuous, line-by-line visual feedback of *what tool is running right now* and *what it just did* — all greyed.

### 1.2 How NIMBL does it

NIMBL has the same architecture: `ToolPartView` in `session.tsx` renders each tool part, and the transcript layer (`reduceAssistantEvents`) streams tool events into the assistant message. The pending/complete text is **nearly identical**:

| Tool | icon | pending text (while running) | completed text |
|---|---|---|---|
| read | `→` | `<Spinner>~ Reading file...</Spinner>` | `Read <path>` + `↳ Loaded <path>` (muted) |
| glob | `✱` | `~ Finding files...` | `Glob <path>` + `(N matches)` |
| grep | `✱` | `~ Searching content...` | `Grep …` + `(N matches)` |
| write | `←` | `~ Preparing write...` | `← Write <path>` / `# Wrote <path>` (block+diff) |
| edit | `←` | `~ Preparing edit...` | `← Edit <path>` (block+diff) |
| apply_patch | `%` | `~ Preparing patch...` | `← Patched <path>` |
| bash | `$` | `# Running in <path>` + `$ <cmd>` (block) | block + output (10 lines) |
| webfetch | `%` | `~ Fetching from the web...` | `WebFetch <url>` |
| websearch | `◈` | `~ Searching web...` | `(N results)` |
| delegate | `│` | `# Subagent Task — <desc>` (block, spinner) | `# Subagent Task — <desc>` + `· <duration>` + output |
| todowrite | `` | `~ Updating todos...` | `# Todos` block |
| question | `→` | `~ Asking questions...` | `# Questions` block |
| skill | `→` | `~ Loading skill...` | `Skill <name>` |
| generic | `` | `~ Running tool...` | `# <tool> <title>` block |

**Mechanics (`InlineTool`, lines 180–228):**
- While running: `<Spinner color={color()}>~ {props.pending}</Spinner>` where `color()` = `theme.text` while running (white, not grey — see below).
- When complete: `color()` = `theme.textMuted` (grey) — so completed tool rows are grey.
- Failed: `theme.error` + `✕` icon. Rejected: strikethrough + muted `(rejected)`.
- `read` appends `↳ Loaded <path>` muted (line 398).
- `grep`/`glob`/`websearch` show `(N matches)`/`(N results)` in muted.

### 1.3 The one real difference (running state color)

| | opencode | NIMBL |
|---|---|---|
| Running (pending) color | `theme.text` (white `#eeeeee`) via `fg()` default when `!complete` | `theme.text` (white) via `color()` `running() ? theme.text : ...` |
| **Completed** color | `theme.textMuted` (grey) — `props.complete` → muted | `theme.textMuted` (grey) — `running()` false → muted |
| Pending approval highlight | `theme.warning` (amber row while a permission is pending) | **none** — NIMBL blocks the whole composer/approval dock instead of amber-highlighting the specific tool row |

**Verdict on Part 1:** NIMBL **already shows the same grey completed-tool lines** ("Read file...", "Searching content...", `↳ Loaded <path>`, match counts). The pending spinner text is white while running in both. The one visible difference is the **amber "waiting for permission" row highlight** in opencode that NIMBL lacks (NIMBL pauses the turn at the approval dock instead). If the user saw *no* grey text, it's most likely because:
- The message parts are collapsed into blocks by default in NIMBL (block tools show a `+`/`−` header), or
- `conceal`/tool-details visibility settings, or
- They were looking at a subagent's parent card (see Part 2), where NIMBL's delegate card does **not** stream the child's per-tool activity.

---

## Part 2 — Subagent Inspection, Summary & Cycling

### 2.1 opencode's subagent experience

**Entry point — the Task tool card (`Task` component, lines 2213–2309):**
- Rendering: an `InlineTool` with icon `│` (running) or `✓` (completed), title `Agent Task — <description>`, spinner while running, pending text `~ Delegating...`.
- **Live child activity**: the card subscribes to the child session's messages/parts via `sync.data.message[sessionID]`. While running it shows, on subsequent lines:
  - `↳ <Tool> <title>` for the **currently running/completed tool** inside the child (e.g. `↳ Read src/main.ts`), updated live.
  - `↳ N toolcalls` when no current tool has a title yet (toolcall counter).
  - `↳ Retrying (attempt N) · <message>` when the child is in a retry state (`session_status` type `"retry"`).
- **Completion summary**: when the task completes it shows `↳ <N> toolcalls · <duration>` (e.g. `↳ 3 toolcalls · 1m 2s`), where `duration` = last user msg time → last assistant `time.completed`.
- **Click**: clicking the card navigates to the **child's own session** (`route.navigate({type: "session", sessionID})`) — so you can drop into the child and see its full transcript. If a retry error is present it also opens a `Retry Error` alert.

**"view subagents" hint (line 1495–1518):** when the message contains a `task` tool part, a hint line appears under the assistant message:
```
<child-first-shortcut> view subagents · <background-shortcut> background
```
(shows `[shortcut]` for `session.child.first` = `<leader>down`, and `[ctrl+b] background` for foreground running tasks when background subagents are enabled.)

**Subagent footer (`subagent-footer.tsx`):** when you're *inside* a child session (has `parentID`), a footer bar shows:
```
<b>Agent</b> (index of total) · tokens (N%) · $cost    [Parent <key>] [Prev <key>] [Next <key>]
```
- Label from the title `@<agent> subagent` (title-cased), else `Subagent`.
- `index of total` = position among siblings sharing the same parent.
- usage = last assistant's tokens + context % + session cost.
- **Buttons Parent / Prev / Next** are clickable AND display their keybinding.

**Cycling with arrow keys** (`config/keybind.ts`):
| command | key |
|---|---|
| `session.parent` | `up` |
| `session.child.next` | `right` |
| `session.child.previous` | `left` |
| `session.child.first` | `<leader>down` (leader = `ctrl+x`, so `ctrl+x down`) |
| `session.background` | `ctrl+b` |

So in opencode you: click a task card → land in the child → use `up`/`left`/`right` (or the footer buttons) to hop between the parent and sibling agents, with live tool activity + toolcall count + final `N toolcalls · duration` summary.

**Subagent Actions dialog (`dialog-subagent.tsx`):** right-click context on a task offers "Open → the subagent's session".

### 2.2 NIMBL's subagent experience

**Entry point — the delegate card (`ToolPartView`, `delegate`/`task` branch, lines 531–559):**
- Rendering: a `BlockTool` with title `# Subagent Task — <detail>` (the delegated prompt), spinner while running, expanded by default while running.
- **Live child activity**: **NO** — NIMBL's delegate card only knows the parent-side tool events: `running` (title "Delegate task", detail = prompt), then `completed` (output = child's final text) or `failed`. The child's individual tool calls (reads, greps, etc.) are **not streamed into the parent's card**. They exist only in the child session's own transcript.
- **Completion summary**: shows `· <duration>` (`part.ended - part.started`) in muted — a duration, but **no toolcall count**.
- **Click**: `onSubagentClick` (set when `dialog() === "subagents"`) opens the **Subagents dialog** (see below) — it does *not* navigate into the child session directly. Clicking the block title also triggers it.

**Subagents dialog (`/subagents`, lines 2255–2274):**
- Lists `sessions()` where `parentID === activeID()` (children of the current session), each row: title, `agent · status` (e.g. `plan · running`), token budget footer `used/∞`, details `N messages`.
- Selecting a child calls `setActiveID(value); setView("session")` — **navigates into the child session** (same as opencode's click-through, but one extra step).
- Action: `ctrl+c` cancels a running/queued child task.
- Empty state: `No child sessions — Delegated agents will appear here when created.`

**Subagent footer (NIMBL `session.tsx` lines 1026–1057):**
- Shown when `active().parentID` is set (you're inside a child). Same layout as opencode:
```
<b>label</b> (index of total) · usage        [Parent] [Prev] [Next]
```
- `label` = first word of parent title or `Subagent`; `index of total`; usage = tokens (N%) + `$cost`.
- **Buttons Parent / Prev / Next are mouse-only** — `SubagentButton` has `onMouseOver`/`onMouseUp` only, and **no keybinding** is displayed or bound. There is **no `up`/`left`/`right` shortcut** in NIMBL.

**`@agent` mention delegation (`send`, line 981/1020):** typing `@plan <prompt>` (or `@build/@explain/@learn`) runs a **one-off child agent** via `runSubagent(... depth: 0)` on a fresh child session; the parent user message records `agentText`/`agent`. The child appears in the Subagents dialog and gets the subagent footer.

**Depth limit:** `runSubagent` throws at depth ≥ 3.

### 2.3 Comparison table

| Capability | opencode | NIMBL | Gap |
|---|---|---|---|
| Click a task card → child session | Yes (direct navigate) | No — opens Subagents dialog, then select |  one extra step |
| `view subagents` hint under assistant msg | Yes (with shortcut + background hint) | Yes — "view subagents" hint when message has delegate parts (session.tsx) |  |
| Live child tool activity in parent card (`↳ Read src/main.ts`) | **Yes (streamed via child session subscription)** | **No** |  |
| Live toolcall counter (`↳ N toolcalls`) | Yes | No |  |
| Retry line in card (`↳ Retrying (attempt N) · msg`) | Yes | No (only parent retry banner) |  |
| Completion summary with toolcalls (`3 toolcalls · 1m 2s`) | Yes | Duration only (`· 1m 2s`) |  |
| Subagent footer (Parent/Prev/Next + index + usage) | Yes | Yes |  |
| Footer buttons show their keybinding | Yes (shortcut text) | No (label only) |  |
| Arrow-key cycling (up/left/right) | **Yes** (`session.parent`, `session.child.next/previous`) | **No keyboard shortcut** |  |
| `session.child.first` (leader+down) | Yes | No |  |
| Background subagents (`ctrl+b`) | Yes (experimental) | No |  |
| Subagent depth limit | config `subagent_depth` (default 1) | hardcoded 3 |  |
| Cancel running child | via session abort | via `ctrl+c` in Subagents dialog |  |
| Subagent Actions context menu | Yes (Open) | No |  |

---

## Part 3 — Keybindings (both topics)

### 3.1 opencode (relevant set)
From `config/keybind.ts` (session group):
- `session.parent` → `up`
- `session.child.next` → `right`
- `session.child.previous` → `left`
- `session.child.first` → `<leader>down` (`ctrl+x down`)
- `session.background` → `ctrl+b`
- `session_child_cycle`/`reverse` map to the same next/previous commands
- `session.toggle.conceal` → `<leader>h`
- `session.toggle.actions` (tool details) → unbound by default
- `session.toggle.thinking` → unbound by default
- Message scroll: `pageup/pagedown`, `ctrl+alt+b/f`, `home/end`, `ctrl+alt+g`
- `messages_copy` → `<leader>y`, `messages_undo/redo` → `<leader>u`/`<leader>r`

### 3.2 NIMBL (relevant set)
From `src/core/settings.ts` defaults — **there are NO subagent-navigation keys**:
- No `up`/`left`/`right` binding for Parent/Prev/Next.
- Available: `ctrl+b` (sidebar), `ctrl+m` (model), `tab` (agent mode cycle), `ctrl+shift+s` (status), `ctrl+h` (conceal), `ctrl+alt+t` (timestamps), page/up/down/home/end (scroll).

**Keybinding gaps on these topics:**
1. No key to go to parent / previous / next child — mouse-only footer buttons.
2. No `view subagents` keyboard trigger (only `/subagents` slash command; the hint text is not a shortcut).
3. `ctrl+b` is already used for sidebar toggle, so opencode's background-subagent binding is unavailable anyway (and background subagents don't exist in NIMBL).

---

## Part 4 — Recommendations (ranked)

> **Status: all 6 implemented 2026-08-14.** Verification: `bun run typecheck` clean · 233 tests pass · build clean · renderer smoke exit 0.

1. **Stream child tool activity into the parent delegate card.**  **Implemented.** The child session id now equals the delegate tool part's event id (`part.id === child.id`), and a `childActivity` memo in the TUI derives live child state (running/completed tools, toolcall count, retry, duration). `ToolPartView` renders `↳ <Tool> <title>`, `↳ N toolcalls`, and the retry line from it — mirroring opencode's `Task` component.

2. **Add `N toolcalls · duration` to the completed delegate card.**  **Implemented.** The delegate card shows `· N toolcalls · <duration>` on completion (duration falls back to the part's own `ended - started`).

3. **Add subagent navigation keybindings.**  **Implemented.** `↑` = parent, `←` = prev child, `→` = next child (mirrors opencode's `up`/`left`/`right`), active when a subagent footer is visible and the composer is not focused. The footer buttons now display the shortcut glyphs.

4. **Make the delegate card click navigate directly into the child.**  **Implemented.** Clicking the delegate card (block, header, or body) calls `onSubagentClick(childID)`, which `setActiveID(childID); setView("session")` — dropping you into the child session directly. The `view subagents` hint (no childID) still opens the dialog.

5. **Add the amber "permission pending" tool-row highlight.**  **Implemented.** The tool event id is threaded through `PermissionRequest` so `InlineTool` turns amber (`theme.warning`) while its approval is pending (matches opencode's `fg() === theme.warning`).

6. **Add a retry line to the delegate card.**  **Implemented.** Child retries are tracked per-session (`childRetries` signal, wired via `onRetry` in `runSubagent`) and render as `↳ Retrying (attempt N) · msg` in `theme.error`.

**Key files changed:** `src/tui-opencode.tsx` (childActivity memo, childRetries, keybinding, runSubagent child-id link + onRetry), `src/tui-opencode-ui/session.tsx` (delegate card, InlineTool amber, SubagentButton shortcuts, `duration` export), `src/tui-opencode-ui/types.ts` (`SubagentActivity`), `src/core/agent.ts` (approval id threading).

---

*End of analysis.*

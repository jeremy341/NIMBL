# NIMBL × OpenCode: app-flow and parity audit

Updated: 2026-07-27

## Scope and method

This is a source-backed comparison of NIMBL's maintained src/ tree and
OpenCode's maintained TUI, agent, CLI, configuration, session, tool, provider,
permission, plugin, MCP, LSP, share, and workspace source roots. It also uses
OpenCode's TUI, CLI, command, tool, permission, agent, configuration, provider,
theme, keybind, MCP, LSP, plugin, skill, share, and ACP documentation.

This is **not** a claim that every generated bundle, dependency, lockfile, or
vendored file in OpenCode was read line by line. The maintained source map was
inventoried in full and the interaction-owning modules were read directly,
including packages/tui/src/routes/session/dialog-message.tsx,
dialog-timeline.tsx, dialog-fork-from-timeline.tsx, and ui/dialog.tsx.

Live TTY screenshot QA could not run from this Codex environment because Windows
rejects its pseudo-terminal process with CreateProcessW: Zugriff verweigert.
Build, typecheck, unit tests, and a non-rendering bundle smoke test did run.
Visual conclusions below are source- and supplied-screenshot-based, not a
claim of live visual verification.

## What changed in NIMBL

The TUI now follows OpenCode's message-action pattern:

- Clicking a message opens a centered **Message actions** picker.
- Every action also has a keyboard path: /timeline selects any user prompt;
  Ctrl+M opens actions for the most recent user prompt.
- **Copy** uses OpenTUI's OSC 52 clipboard helper, with an explicit fallback
  message when a terminal blocks it.
- **Fork** creates a persisted session containing history through the selected
  message.
- **Revert** trims later conversation events and restores a selected user prompt
  to the composer. File snapshots remain available through /undo and /redo;
  this is deliberately not described as OpenCode's Git-backed revert.
- User prompts also expose **Edit and resend**.
- Session rows now keep pinned sessions first, followed by last activity.
- Footer hints and the home screen use the actual discovery paths: /, Ctrl+P,
  /timeline, and Ctrl+M.

The implementation is in src/tui-opencode.tsx.

## NIMBL app flow today

~~~mermaid
flowchart TD
  A[Start in a project directory: nimbl] --> B[Build bundles src/tui-opencode.tsx]
  B --> C[Load config, settings and persisted sessions]
  C --> D{--session / -s supplied?}
  D -- matching session --> E[Open session timeline]
  D -- no flag --> F[Home: logo and prompt]
  D -- unknown session --> G[Open a new session with an error card]
  F --> H[Type prompt]
  E --> H
  H --> I{Starts with slash?}
  I -- yes --> J[Autocomplete or Ctrl+P command palette]
  J --> K[Picker, dialog, or command action]
  I -- no --> L[Route provider by local/fast/budget preference]
  L --> M[Persist user message; set initial session title]
  M --> N[Agent loop: model stream plus read/glob/grep tools]
  N --> O{write/edit/bash needs approval?}
  O -- yes --> P[Approval dialog: once / always / reject]
  P --> N
  O -- no --> Q[Stream text, reasoning, and tool cards]
  Q --> R[Persist messages, token counts, learning observations, snapshots]
  R --> E
  E --> S[Click message or /timeline / Ctrl+M]
  S --> T[Message actions: Copy, Fork, Revert, Edit and resend]
  T --> E
~~~

### TUI interaction inventory

| Surface | Current interaction | Status |
|---|---|---|
| Home | prompt, / autocomplete, Ctrl+P, provider/model status | Working |
| Prompt | text submit, Build/Plan toggle with Tab, slash list | Partial: no @file, !command, attachments, history navigation, or external editor |
| Model/provider | centered searchable picker, mouse hover/click/wheel, API-key form | Working for static providers; no OAuth or live catalog |
| Timeline | scrollable messages, streamed text/tool/reasoning cards, click actions | Partial: no markdown links/tables, folded content, or per-part actions |
| Message action dialog | Copy, Fork, conversation-only Revert, Edit and resend | Partial: lacks OpenCode Git-backed revert and part/file-level actions |
| Tool approval | diff preview; once/always/reject | Partial: settings policy is not evaluated per tool/path/command |
| Sessions | auto-save, resume with -s, picker, rename/fork/pin/delete commands | Partial: no row actions, search metadata, quick slots, delete confirmation, tags, or workspaces |
| Diagnostics | header plus wide-screen inspector, details/context commands | Partial: no true cache/cost/model diagnostics |
| Responsive layout | centered dialogs and hidden inspector on smaller widths | Partial: current minimum is 60×18; target tested 80×24 and a deliberate 60-column single-pane mode |

### Plain REPL flow (bun run dev)

src/index.ts is a separate legacy readline REPL. It resolves one provider and
model, accepts plain text, calls sendChat(), prints text and aggregate token
stats, and supports only /help, /model, /provider, /stats, /status, /export
(not implemented), /clear, and /quit.

This is not feature-equivalent with the built nimbl command. nimbl uses the
OpenTUI app; bun run dev uses the legacy REPL. Keep both only if the REPL is
explicitly a --no-tui fallback that shares the same session/config/command core.
Today it does not.

## OpenCode interaction flow

~~~mermaid
flowchart TD
  A[opencode in a project] --> B[Resolve global, project, remote and managed config]
  B --> C{TUI, run, serve, ACP, web or API command?}
  C -- TUI --> D[Home or existing session route]
  C -- headless --> E[CLI command or server-client flow]
  D --> F[Prompt editor]
  F --> G[Autocomplete: slash command, @file, !bash, agents, models, providers]
  G --> H[Create or resume session]
  H --> I[Agent/model execution]
  I --> J[Tool, subagent, question, LSP/MCP/plugin event]
  J --> K{Permission policy: allow / ask / deny}
  K -- ask --> L[Approval UI: once / always / reject]
  L --> I
  K -- allow --> M[Timeline: markdown parts, tools, diffs, reasoning, activity]
  M --> N[Snapshots, retry/revert/undo, compaction, title and summary]
  N --> O[Persisted session, session browser, share/export/workspace controls]
  O --> D
~~~

OpenCode's message route is: Timeline → select a user message → **Message
Actions** → Revert, Copy, or Fork. Its session dialog supports search, pinning,
rename, deletion flow, current-session state, and quick switching. Its shared
dialog layer controls focus, backdrop dismissal, Escape behavior,
selection-aware copy, and modal size.

## UI design review

### Score: 6.5 / 10 (source and supplied screenshots)

NIMBL has a coherent dark coding-agent language: compact header, one main
timeline, muted surfaces, semantic message rails, centered pickers, and useful
provider/model visibility. The direction is close to OpenCode without copying
its branding.

The score is held back by interaction completeness:

1. **Hierarchy — 7/10.** Header → timeline → composer is clear. The inspector
   disappears rather than becoming a drill-down view at medium widths.
2. **Density and clutter — 7/10.** One rail per message is calm. Do not add
   nested decorative borders; reduce repeated text when the header has it.
3. **Discoverability — 6/10.** /, Ctrl+P, footer hints, and message actions
   help. Add contextual help, command result counts, and session row actions.
4. **Keyboard parity — 6/10.** Pickers support arrows, j/k, Enter, Escape,
   wheel, hover, and click. Missing message navigation, prompt history, focus
   cycling, and first-class session action bindings.
5. **Feedback and safety — 5/10.** Loading/tool/approval feedback exists.
   Destructive session operations lack confirmation, and conversation revert
   is not associated with file snapshots.
6. **Content rendering — 5/10.** Basic headings, bullets, fences, and simple
   code colors work. Links, tables, language-aware fences, diff interaction,
   and long-output folding are missing.
7. **Responsive floor — 5/10.** There is a small-screen fallback, but it must
   be frame-tested at 80×24 and a 60-column split.

### TUI cleanup priorities

1. Build a shared modal provider: focus trap, selection-aware copy, dialog
   size variants, and a consistent backdrop. OpenCode ui/dialog.tsx is the
   direct reference.
2. Replace hardcoded palette access with semantic theme tokens and live theme
   switching. Keep NO_COLOR support.
3. Add a contextual footer that changes with focus: prompt, picker, timeline,
   tool card, and session list should each show 3–5 relevant actions.
4. Add render snapshots at 80×24, 120×35, and 60×24.
5. Add a session detail/action menu; do not leave rename, pin, delete, and
   fork as hidden text-only operations.

## Feature comparison

### Frontend / user-facing gaps

| Capability in OpenCode | NIMBL state | What remains |
|---|---|---|
| Full prompt editor | Partial | prompt history, cursor/editor controls, paste UX, /editor |
| @file references and !bash prompt parts | Missing | autocomplete, safe execution, visible attachment chips |
| Rich markdown, code languages, OSC links | Partial | renderer with links, tables, blockquotes, language highlighting, copy code |
| File/tool cards and diff UI | Partial | collapse/expand, file previews, diff accept/reject, tool details |
| Timeline and message menu | Partial | working actions; add per-part entries and Git-backed reversion |
| Permission and question dialogs | Partial | pattern-aware policy, question form/multi-choice UI, auto mode |
| Session browser | Partial | search ranking, in-list actions, metadata, tags, quick keys |
| Workspace/worktree UI | Missing | create/move/list/inspect workspace copies |
| Agent/subagent activity | Missing | task cards, child sessions, background state |
| Command palette/keymaps | Partial | config-driven bindings, leader key/which-key, reference |
| Themes | Partial | custom theme files, live switch, terminal/system palette |
| Diagnostics | Partial | context inclusion explanation, live cache/cost/latency, model variants |
| Attention behavior | Missing | completion/error notifications and optional sound |
| Sharing | Partial | hosted secure share/unshare rather than local Markdown |
| Accessibility/plain mode | Partial | documented --no-tui, linear output, stable focus labels |

### Backend / platform gaps

| OpenCode subsystem | NIMBL state | What remains |
|---|---|---|
| Configuration precedence/schema | Partial | global/project/custom locations, validation, variables, watcher, provider allow/deny |
| Provider/auth platform | Partial | OAuth/key store, model discovery, setup, usage/cost telemetry |
| Agent runtime/tool loop | Partial | todo, question, patch, web fetch/search, skill, retries, doom-loop protection |
| Permission engine | Partial | actual allow/ask/deny by tool, path, command, agent, external directory |
| Git snapshots/revert | Partial | Git checkpoints, message-to-change association, safe restore, retry/revert |
| Sessions/storage | Partial | indexed storage, search, summaries/titles, migrations, concurrency |
| Context intelligence | Partial | semantic retrieval, dependency graph, AST compression, prompt cache and rationale |
| Teaching memory | Partial | learner profile, misconceptions, Socratic checkpoints, goals, quizzes, privacy |
| Provider routing | Partial | capability/cost/privacy/latency routing with a visible rationale |
| Subagents/background work | Missing | agents, tasks, child sessions, cancellation, activity events |
| MCP | Declaration only | client/server lifecycle, stdio/HTTP/OAuth, tool conversion, policy |
| Plugins/hooks | Declaration only | install/load order, hook API, isolation, custom tools/events |
| LSP | Declaration only | server lifecycle, definition/reference/hover/symbol calls |
| Skills/custom commands | Partial | command files/frontmatter, interpolation, skill discovery/load permissions |
| Worktrees/workspaces | Missing | Git worktree lifecycle and file-change safeguards |
| Share/service/API | Missing | hosted sharing, privacy/retention, API/server, web and ACP/IDE |
| GitHub/GitLab/PR integrations | Missing | auth, PR/issue workflow, review context |
| Observability/reliability | Missing | structured log, retries/backoff, diagnostics, performance metrics |

## Highest-value order

1. **Make the agent safe and useful:** real policy evaluator; question/todo;
   Git-aware snapshots; reliable retries; tool event model.
2. **Make the coding loop legible:** @file, !command, markdown/diff/tool
   rendering, timeline navigation, message-to-change revert, session actions.
3. **Deliver NIMBL's differentiator:** semantic/AST/dependency context,
   prompt-cache accounting, visible context rationale, teaching/learning loop.
4. **Reach power-user parity:** command files, keymaps/themes, MCP, plugins,
   LSP, subagents, worktrees, sharing, ACP/IDE.
5. **Harden distribution:** unify legacy REPL/TUI commands, add --no-tui,
   remove generated JS/.d.ts duplicates from src/, and add render/PTY tests.

## Verification completed

- bun run typecheck — passed
- bun test — 33 tests passed
- bun run build — passed
- NIMBL_TEST_RENDERER=1 bun dist/nimbl.js — passed

The build produces dist/nimbl.js. Use bun run nimbl to build and launch the
TUI. bun run build intentionally only builds it.


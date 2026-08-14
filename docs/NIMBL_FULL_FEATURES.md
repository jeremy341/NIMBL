# NIMBL — Complete Feature Inventory

**Audit date:** 2026-08-14 (updated after the parity feature pass)
**Audited state:** working tree after commit `16ac90b` + `external_directory` + parity feature pass (themes, edit cascade, reject-feedback, Emacs keys, remote skills, doom_loop ask, did-you-mean, retry-after)
**Scope:** Every file in the NIMBL repo (`C:\Users\jerem\Documents\GITHUB\NIMBL`) — `src/tui-opencode.tsx`, `src/tui-opencode-ui/*`, `src/core/*` (50 files incl. `edit-apply.ts`), `src/config.ts`, `src/cli-commands.ts`, tests (35 files), `docs/*`, `benchmarks/*`, build/config files. This document is the exhaustive "everything it has" reference.

---

## Table of Contents

1. [Identity & Philosophy](#1-identity--philosophy)
2. [Stack & Build System](#2-stack--build-system)
3. [Theme & Color System](#3-theme--color-system)
4. [Borders & Layout Primitives](#4-borders--layout-primitives)
5. [Terminal UI (TUI) — Complete](#5-terminal-ui-tui--complete)
6. [The Composer](#6-the-composer)
7. [Message Rendering](#7-message-rendering)
8. [Dialogs & Modals](#8-dialogs--modals)
9. [Spinner & Animations](#9-spinner--animations)
10. [Toasts](#10-toasts)
11. [Sidebar](#11-sidebar)
12. [Docked Prompts (Permission & Question)](#12-docked-prompts-permission--question)
13. [Syntax Highlighting](#13-syntax-highlighting)
14. [Keybindings](#14-keybindings)
15. [Slash Commands](#15-slash-commands)
16. [Agent Runtime & Tools](#16-agent-runtime--tools)
17. [Permission System](#17-permission-system)
18. [Path Safety & External Directory](#18-path-safety--external-directory)
19. [Sessions & Storage](#19-sessions--storage)
20. [Retrieval Engine](#20-retrieval-engine)
21. [Prompt Engineering Support](#21-prompt-engineering-support)
22. [Budgeting & Token Counting](#22-budgeting--token-counting)
23. [Prompt Caching](#23-prompt-caching)
24. [Providers, Routing, Pricing, Health](#24-providers-routing-pricing-health)
25. [Skills](#25-skills)
26. [Learning / Socratic State](#26-learning--socratic-state)
27. [Backend & Feature Modules](#27-backend--feature-modules)
28. [Configuration](#28-configuration)
29. [CLI Commands](#29-cli-commands)
30. [Benchmark](#30-benchmark)
31. [Tests](#31-tests)
32. [Documentation](#32-documentation)

---

## 1. Identity & Philosophy

- **Name:** NIMBL (lowercase `nimbl` npm); "Token-efficient AI coding companion that teaches. Learn more. Use fewer tokens."
- **Differentiator:** learning companion, not code generator — explains code, uses Socratic method, records concept encounters, provider-agnostic, single CLI command
- **Brand:** black `#0a0a0a`, forest green `#06402b`, foreground green `#4ade80`
- **Runtime:** Bun 1.3.14+ (primary), Node-compatible; strict TypeScript
- **Deliberate scope exclusions:** no MCP, no plugins, no LSP (config stubs only); no total/session thinking time metric

## 2. Stack & Build System

- **Language/runtime:** TypeScript (ESNext, strict) on Bun
- **TUI framework:** OpenTUI (`@opentui/core` 0.4.5, `@opentui/solid` 0.4.5, `@opentui/keymap` 0.4.5) + `solid-js` 1.9.10
- **AI SDK:** `ai` ^7.0.37, `@ai-sdk/anthropic` ^4.0.21, `@ai-sdk/openai` ^4.0.20
- **Parsing:** `@babel/parser` ^8.0.4 (structural context), `web-tree-sitter` 0.25.10 (syntax highlight WASM)
- **Other:** `js-tiktoken` ^1.0.21 (exact tokenizers), `ignore` ^7.0.6 (gitignore), `solid-js`
- **Build:** `bun build.ts` → `dist/nimbl.js` (~9.75 MB), target bun, `conditions: ["browser"]`, Solid JSX transform plugin applied at bundle time; externals = 8 `@opentui/core-*` native binaries; exits 1 on failure
- **Postinstall:** `scripts/patch-opentui.mjs` patches `@opentui/solid/index.bun.js` (backfills resolved renderable nodes after `insertExpression`)
- **Typecheck:** `tsc --noEmit`; **Tests:** vitest (`bun test` = `vitest run`)
- **tsconfig:** strict, ESNext, `moduleResolution: bundler`, `jsxImportSource: @opentui/solid`, `paths: {"@/*": ["./src/*"]}`, lib ESNext+DOM+DOM.Iterable, types bun-types
- **Entry:** `src/tui-opencode.tsx` (sole OpenTUI entry); `src/index.ts`/`src/tui.tsx` deliberately absent (test-enforced); `bin/nimbl.ts` imports `dist/nimbl.js`
- **Renderer:** `createCliRenderer({externalOutputMode:"passthrough", targetFps:60, gatherStats:false, exitOnCtrlC:false, autoFocus:false, openConsoleOnError:false})`
- **Test mode:** `NIMBL_TEST_RENDERER !== "1"` guard lets tests import `App` headless

## 3. Theme & Color System

### 3.1 The single palette (`src/tui-opencode-ui/theme.ts`)
`NIMBL_FOREGROUND = "#4ade80"` (NIMBL green).

| Token | Hex | Usage |
|---|---|---|
| `brand` | `#16885a` | Home logo, footer "NIMBL", "view subagents" hint |
| `primary` | `#06402b` | Selected list bg, "Allow always/Confirm" chip, dialog ok buttons, autocomplete selected, BlockTool collapse |
| `primaryForeground` | `#4ade80` | extmark.paste, current-option text, cursor, dimmed accents |
| `secondary` | `#5c9cf5` | **build** agent color; `File`/`Directory` badge bg |
| `accent` | `#9d7cd8` | **plan** agent color; QuestionPrompt border; category headers |
| `error` | `#e06c75` | Failed tools, errors, reject stage, retry banner, `△` |
| `warning` | `#f5a742` | **learn** agent color; in-progress todos; permission border; selected permission chip; reasoning/thought; markdown strong |
| `success` | `#7fd88f` | **explain** agent color; sidebar bullet; connected `✓` |
| `info` | `#56b6c2` | markdown link text, list enumeration, syntax operator |
| `text` | `#eeeeee` | |
| `textMuted` | `#808080` | |
| `background` | `#0a0a0a` | |
| `backgroundPanel` | `#141414` | |
| `backgroundElement` | `#1e1e1e` | |
| `backgroundMenu` | `#1e1e1e` | (identical to element) |
| `borderSubtle` | `#3c3c3c` | (defined, unused) |
| `border` | `#484848` | |
| `borderActive` | `#606060` | scrollbar track, compaction divider |
| `selectedListItemText` | `#ffffff` | |

**Diff tokens:** `diffAdded #4fd6be`, `diffRemoved #c53b53`, `diffContext/diffHunkHeader #828bb8`, `diffHighlightAdded #b8db87`, `diffHighlightRemoved #e26a75`, `diffAddedBg #20303b`, `diffRemovedBg #37222c`, `diffContextBg #141414`, `diffLineNumber #8f8f8f`, `diffAddedLineNumberBg #1b2b34`, `diffRemovedLineNumberBg #2d1f26`

**Markdown tokens:** `markdownText #eeeeee`, `markdownHeading #9d7cd8`, `markdownLink #4ade80`, `markdownLinkText #56b6c2`, `markdownCode #7fd88f`, `markdownBlockQuote #e5c07b`, `markdownEmph #e5c07b`, `markdownStrong #f5a742`, `markdownHorizontalRule #808080`, `markdownListItem #4ade80`, `markdownListEnumeration #56b6c2`, `markdownImage #4ade80`, `markdownImageText #56b6c2`, `markdownCodeBlock #eeeeee`

**Syntax tokens:** `syntaxComment #808080`, `syntaxKeyword #9d7cd8`, `syntaxFunction #4ade80`, `syntaxVariable #e06c75`, `syntaxString #7fd88f`, `syntaxNumber #f5a742`, `syntaxType #e5c07b`, `syntaxOperator #56b6c2`, `syntaxPunctuation #eeeeee`

**Special:** `thinkingOpacity: 0.6` → translucent thought color `#f5a742` @ 60% alpha

### 3.2 `agentColor(mode)`
`build → #5c9cf5` · `plan → #9d7cd8` · `explain → #7fd88f` · `learn → #f5a742`

### 3.3 Themes (implemented 2026-08-14)
Three **real, switchable** palettes via a reactive Proxy over a Solid signal (`setThemeName`/`currentThemeName`/`THEMES`/`THEME_NAMES`). Every `theme.<token>` read tracks the signal, so all components re-render live on switch. The Theme dialog (`/theme`) now lists the three, **live-previews on move**, and persists to `.nimbl/settings.json`; a startup effect applies the saved theme.

| Theme | primary | brand | notes |
|---|---|---|---|
| `nimbl` (default) | `#06402b` | `#16885a` | green primary, NIMBL foreground `#4ade80` |
| `opencode` | `#fab283` | `#d97757` | mirrors opencode's default peach palette |
| `mono` | `#d4d4d4` | `#4ade80` | monochrome with reserved green accent |

All three define the full 66-token palette (neutrals, diff, markdown, syntax, `thinkingOpacity`). `createSyntaxStyle()` in `syntax.ts` rebuilds the syntax/markdown style per theme, re-applied by `NativeMarkdown`/`NativeCode`/`NativeDiff` and the composer on each render.

## 4. Borders & Layout Primitives (`src/tui-opencode-ui/border.ts`)

- **`EmptyBorder`**: all 12 glyphs empty except `horizontal: " "`
- **`SplitBorder`**: `border: ["left","right"]`, `customBorderChars = {...EmptyBorder, vertical: "┃"}` (heavy vertical bar U+2503) — the signature left-border message card look
- **`setBorder(box, border, customBorderChars)`**: assigns `box.border` + `box.customBorderChars` imperatively in `ref` callbacks
- **Composer variant**: `bottomLeft: "╹"` (U+2579) + pedestal box with `vertical:"╹"` + bottom-fill box `horizontal:"▀"` (U+2580) — a "floating prompt" with heavy left rail and filled bottom shadow

## 5. Terminal UI (TUI) — Complete

### 5.1 App structure (`src/tui-opencode.tsx`, 2411 lines)
- **LOGO**: 6-line block letters spelling NIMBL using `█╗║╝╚╔═╣` glyphs in `theme.brand`; **LOGO_COMPACT**: 4-line ASCII when height < 30
- Two views (`home`/`session`) via `view` signal; DialogOverlay + Toast + terminal-size guard on top
- **Terminal size guard**: width < 60 || height < 18 → centered "NIMBL needs more terminal space" (60×18)
- **Terminal title**: `"NIMBL | <title[:40]>"` in sessions, else `"NIMBL"`
- **Global error handler**: `TUI CRASH:\n<stack>` → `nimbl-error.log`, destroys renderer, restores Ctrl+C guard, exit 1
- **Windows integration**: `win32InstallCtrlCGuard`/`win32DisableProcessedInput`/`win32FlushInputBuffer` from `core/terminal-win32.ts`

### 5.2 Global keyboard (priority order)
1. Ctrl+C → `handleCtrlC` (see below)
2. Exit-armed key disarms
3. Escape + selection → clear selection
4. Blocked when approval/question pending or dialog open
5. Keybind dispatch via `matchesKeybind`
6. Ctrl+M → Message Actions for latest user message
7. Ctrl+1…9 → switch session slot
8. Per-action keybinds; Tab bubbles to composer agent handler

### 5.3 Ctrl+C state machine (`ctrl-c.ts`)
`selection→copy (OSC52)`, `dialog→close`, `approval→reject`, `question→cancel`, `running→abort-run`, `draft→clear-draft`, else `exit`; second Ctrl+C within 2s (`exit-guard.ts EXIT_CONFIRM_WINDOW_MS`) exits, first press toasts "Press Ctrl+C again to exit."

### 5.4 Home screen
Column: top spacer → logo (brand) → tagline "Token-efficient AI coding companion" → sub-tagline "Learn more. Use fewer tokens." → composer (maxWidth 75, zIndex 1000, showCwd false) → bottom spacer. Footer: left = cwd, right = NIMBL (brand).

### 5.5 Session view
Main column: `scrollbox` (sticky bottom) → compaction divider → waiting indicator → subagent navigation bar → `SessionDock` (ApprovalDock / QuestionDock / ComposerDock). Sidebar: width 42; overlay when not wide (scrim `RGBA(0,0,0,70)`, click-to-close).

### 5.6 Slash-command catalog (`BASE_COMMANDS`, 50 entries)
- **Session:** new, sessions (aliases resume/continue), timeline, rename, fork, pin, delete, compact, clear
- **Config:** model, provider, agent, route, settings, keybinds, theme, thinking, conceal, timestamps, animations, skills
- **View:** context, details, status, stats, debug, diff, subagents, notifications, sidebar, home, help
- **Project:** undo, redo, init, export, export-options, share, unshare, workspace (alias worktrees), stash, pop, stashes, editor, retry
- **NIMBL:** palette, quit

### 5.7 Startup behavior
- `onMount`: schedules persist, warms model price catalog, startup toasts (session recovery, missing `-s`, no previous session, `--fork` misuse)
- Persistence: 500ms debounce; handles `SessionStoreConflictError` (toast "Session conflict", pause) and `SessionStoreLockedError` (retry 1s)
- Notifications: `showToast` feeds `backend.notifications.notify` (error→failure, success→completion, else info)

## 6. The Composer (`src/tui-opencode-ui/prompt.tsx`)

- `SUBMIT_KEY_BINDINGS`: return/kpenter submit, shift+return newline, plus **Emacs-style editing** (implemented 2026-08-14): `ctrl+a`/`ctrl+e` line home/end (+shift select), `alt+a`/`alt+e` buffer home/end (+shift select), `alt+b`/`alt+f` word backward/forward, `alt+d` delete-word-forward, `ctrl+w` delete-word-backward, `ctrl+k` delete-to-line-end, `ctrl+u` delete-to-line-start, `super+a` select-all. Bindings that would collide with app-level shortcuts (ctrl+b/f/d/y/z) are intentionally omitted.
- Height: minHeight 1, maxHeight `max(6, height/3)`; placeholder muted, text, cursor; bg backgroundElement
- **Paste**: normalizes line endings; 3+ lines or >150 chars → inline `[Pasted ~N lines]` extmark; real content re-expanded at submit via grapheme-aware offsets (`Intl.Segmenter`)
- **Rotating placeholder**: `["Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests"]`, cycling every 10s, initial randomized; text `Ask anything... "<suggestion>"`
- **Autocomplete**: `/` mode (commands, prefix/title/alias/subsequence, cap 10) and `@` mode (up to 5 agents + 8 files, cap 10); panel above composer, `┃` borders, bg backgroundMenu, height `min(10, matches, root.y)`; active row bg primary + white bold; keys Tab/Ctrl+N/Ctrl+P/Up/Down/Enter/Escape; mouse hover/down/up
- **Interrupt (Esc) arming**: first press arms 2s, second aborts; footer `esc interrupt` → `again to interrupt`
- **History**: Ctrl+Up/Ctrl+Down (idle) via `navigateDraft`; Ctrl+J inserts newline
- **Submit**: trims; bare `exit`/`quit`/`:q` quits; `/`-prefixed → onCommand; else onSubmit
- **Status footer row**: idle → cwd + context/cost OR `tab modes` + `ctrl+p commands`; busy → Spinner + retry banner (error color, clickable) + `esc interrupt`/`again to interrupt`
- **Retry banner**: `"{message} (click to expand) [retrying in Ns attempt #N]"` with per-second countdown, 80-char truncation, `(click to expand)` when >120 chars, special-case "gemini is way too hot right now" for Gemini quota
- **Composer meta line**: `Titlecase(agent)` in agentColor · `·` muted · model · provider muted

## 7. Message Rendering (`src/tui-opencode-ui/session.tsx`)

- `visibleMessages` filters hidden; `Index` loop → UserMessage / AssistantMessage / ErrorMessage / SystemMessage
- **UserMessage**: left rail in agentColor, hover bg backgroundElement, click → Message Actions; attachment chips ` File ` / ` Directory ` (bg secondary) + path pill; QUEUED badge (agentColor bg, bold); timestamp (`9:41 PM`, `9:41 PM · Aug 14`, +year when not current)
- **AssistantMessage**: parts via Index (text/reasoning/tool); footer `▣` + Titlecase(mode) + `· model` muted + `· {duration}` muted + `· interrupted` muted, shown when last/final/interrupted; duration = completed − userMessage.time (end-to-end); "view subagents" hint when delegate/task parts complete
- **`duration()` formatter**: `<1s → "123ms"`, `<60s → "1.5s"`, `<1h → "1m 2s"`, `<1d → "1h 2m"`, else `"1d 2h"`
- **AssistantTextPart**: fenced code split; non-code → NativeMarkdown (emojis stripped); code → `ConcealedCode` (conceal + >12 lines → first 12 + `…`, click to reveal)
- **ReasoningPartView**: running `<Spinner>Thinking: {summary}`; done `+ Thought: {summary}` / `- Thought` (dash flips); click toggles expand; body NativeMarkdown in textMuted when visible; summary = first non-empty line, `#`-stripped, `[REDACTED]` removed, 96-char cap; color warning or translucent when hidden/expanded; `[REDACTED]` OpenRouter placeholder stripped
- **ErrorMessage**: left rail + border error, bg backgroundPanel, NativeMarkdown in error
- **SystemMessage**: single muted line, collapsed, truncated 160
- **ToolPartView** matrix (icon · pending verb · label):
  | Tool | Icon | Pending | Label |
  |---|---|---|---|
  | bash (output) | — | — | BlockTool `# Running in {path}` + `$ {cmd}` + OutputPreview(10) |
  | bash (no output) | `$` | "Writing command..." | inline `{detail}` |
  | read | `→` | "Reading file..." | `Read {path}` + `↳ Loaded {path}` |
  | glob | `✱` | "Finding files..." | `Glob {path} (N matches)` |
  | grep | `✱` | "Searching content..." | `Grep … (N matches)` |
  | write (diff/output) | — | — | BlockTool `# Wrote {path}` + diff/preview |
  | write (no output) | `←` | "Preparing write..." | inline |
  | edit | `←` | "Preparing edit..." | BlockTool `← Edit {path}` |
  | apply_patch | `%` | "Preparing patch..." | BlockTool `← Patched {path}` |
  | webfetch | `%` | "Fetching from the web..." | inline |
  | websearch | `◈` | "Searching web..." | `(N results)` |
  | todowrite | `⚙` | "Updating todos..." | BlockTool `# Todos` |
  | question | `→` | "Asking questions..." | `# Questions` |
  | skill | `→` | "Loading skill..." | inline |
  | delegate/task | — | — | BlockTool `# Subagent Task — {detail}` + `· {duration}` |
  | generic w/ output | `⚙` | "Running tool..." | BlockTool `# {tool} {title}` |
- **InlineTool**: running spinner `~ {pending}`; done icon+text; failed `✕ (failed)` error; rejected strikethrough `(rejected)` muted; click expands output
- **BlockTool**: bg backgroundPanel (hover backgroundMenu), left rail; title row `+`/`−` collapse in primary, spinner while running, title muted (failed→error, rejected→strikethrough); failed detail in error
- **OutputPreview**: ANSI-stripped; collapse to 10/3 lines; overflow `…` + "Click to expand/collapse"
- **Todos**: `[✓]`/`[•]`/`[ ]` glyphs; warning for in-progress; parses JSON arrays, checkbox lists, labeled lines
- **DiffView**: NativeDiff in paddingLeft 1
- **Subagent click** → Subagents dialog; BlockTool title click also triggers
- **Compaction divider**: top border, borderActive, title `" Compaction "` centered
- **Waiting indicator**: Spinner `Working...` when loading but last message done/empty
- **Subagent navigation bar**: left rail ┃, Parent/Prev/Next buttons

## 8. Dialogs & Modals (`src/tui-opencode-ui/dialogs.tsx`)

- **DialogOverlay**: backdrop `RGBA(0,0,0,150)` (≈59% black), zIndex 3000, paddingTop height/4; widths medium 60 / large 88 / xlarge 116; click backdrop closes
- **SelectDialog** (workhorse): bold title + muted esc; filter input; scrollbox (maxHeight `min(rows, floor(height/2)-6)`), category headers accent bold, `Suggested` group; `●` current (primaryForeground), `✓` connected gutter; active bg primary + white bold; actions (ctrl+key), esc, arrows wrap, pageup/down ±10, home/end; mouse
- **Dialog instances**: palette, model (Favorites/Recent/providers/Popular providers; `●` current; `Free` footer; `-nano` disabled; `ctrl+a` connect, `ctrl+f` favorite), provider (Popular sorted by PROVIDER_PRIORITY opencode-zen/openai/github-models/anthropic/google; `✓` connected; `ctrl+r` reconnect, `ctrl+d` disconnect), agent (4 modes), sessions (Pinned/Today/date; spinner gutter; two-stage delete; `ctrl+f` pin, `ctrl+d` delete, `ctrl+r` rename), timeline (prompts newest-first; footer time), message (Message Actions: Revert, View changes, Trim conversation, Copy OSC52, Fork, Edit and resend), revert-message (ConfirmDialog), theme (3 labels — see §3.3), help, stash, skills, subagents, diff, diff-view (xlarge), export-options, worktrees (ctrl+n create, ctrl+d remove, ctrl+p prune), worktree-create/branch (TextPrompt), worktree-remove (Confirm), connect (API key, secret mode, busy spinner), rename, delete, detail
- **DetailDialog**, **DiffDialog**, **ConfirmDialog** (Cancel/Confirm chips, arrows, enter), **TextPromptDialog** (secret mode with `•` masking, busy spinner), **AlertDialog**, **HelpDialog**, **ExportOptionsDialog** (filename + 4 checkboxes Include thinking / tool details / assistant metadata / Open without saving; tab/space/return), **StashDialog** (first-line preview, relative time, `~N lines`, ctrl+d two-stage)

## 9. Spinner & Animations

- **`SPINNER_FRAMES`**: 10-frame braille `["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]`, `FRAME_INTERVAL_MS = 80`
- **`useSpinnerFrame`**: driven from renderer frame callback (`addFrameCallback`) so each advance requests render (immune to timer starvation); falls back to setInterval (unref'd) for headless/test
- **`Spinner`**: glyph + children in `props.color ?? textMuted`; animations disabled → static `⋯`
- **`enableAnimations(animationsEnabled)`** global signal toggles all spinners

## 10. Toasts

- Absolute top-right (`top:2, right:2`, zIndex 2500, maxWidth `min(60, width-6)`), bg backgroundPanel, left+right `┃` border, border color = variant (info `#56b6c2`, success `#7fd88f`, warning `#f5a742`, error `#e06c75`)
- Optional bold title; body wraps; auto-clear 5000ms; feeds OS notification center; `toastError` helper

## 11. Sidebar (`src/tui-opencode-ui/sidebar.tsx`)

- Fixed width 42, bg backgroundPanel, absolute|relative for overlay mode; custom vertical scrollbar (track background, thumb borderActive)
- Sections: session title (bold) → **Context** (`N tokens`, `N% used`, `$cost estimated provider cost`) → **Todo** (collapsible `▼`/`▶`, `[✓]`/`[•]`/`[ ]`, warning in-progress) → **Modified Files** (collapsible; `+N`/`−N` in diff colors; rough line-multiset diff) → path footer (`parent/` + basename) + `• NIMBL` (success)

## 12. Docked Prompts (Permission & Question)

### PermissionPrompt
- Three-stage machine: `permission → always → reject`; bg backgroundPanel, left rail ┃, borderColor warning (error when reject), maxHeight 15 / fullscreen Ctrl+F
- **Permission stage**: `△` warning + "Permission required"; icon + `{label} {title}`; detail line (bash shows `$ {detail}`); optional diff in scrollbox (maxHeight 7/24, custom scrollbar)
- **Action bar**: Allow once / Allow always / Reject chips (selected warning bg + white); hints `←→ select`, `enter {selectedLabel}`, `ctrl+f fullscreen`
- Keys: `←/→/h/l` cycle, `enter`, `a` → always, `ctrl+f` fullscreen, `esc` back/reject
- **Always stage**: Confirm (`primary`)/Cancel (`warning`) chips
- **Reject stage**: `△` error + "Reject permission" + textarea "Reason for rejection..."; enter submits (with message via onRejectWithMessage)
- **PERMISSION_INFO** icons: read `→`, glob/grep `✱`, write `←`, edit `→`, apply_patch `%`, bash `#`, webfetch `%`, websearch `◈`, skill `→`, question `→`, todowrite `⚙`, delegate `│`, external_directory `←` "Access external directory"
- **Always-allow persistence**: in-memory `alwaysAllowed` Set + writes `permissions[tool][target]="allow"` to `.nimbl/settings.json`

### QuestionPrompt
- Border accent + left rail; options with number gutter, active secondary, "Type your own answer" custom row; keys `↑/↓`/`k/j`, digits 1-9, enter, esc; freeform textarea; footer hints vary

## 13. Syntax Highlighting (`src/tui-opencode-ui/syntax.ts`)

- `extmark.paste` primaryForeground bold; `extmark.file` markdownLink bold; `extmark.agent` secondary bold
- comment italic #808080; keyword #9d7cd8; function #4ade80; variable #e06c75; string #7fd88f; number #f5a742; type #e5c07b; operator #56b6c2; punctuation #eeeeee
- markup.heading #9d7cd8 bold (H1 +underline); markup.bold/strong #f5a742 bold; markup.italic #e5c07b italic; markup.list #4ade80; markup.quote #e5c07b italic; markup.raw #7fd88f; markup.link #4ade80 underline

## 14. Keybindings (`src/core/settings.ts:32-54`)

| Action | Binding |
|---|---|
| palette | `ctrl+p` |
| sessions | `ctrl+l` |
| agent | `tab` |
| new | `ctrl+n` |
| timeline | `ctrl+g` |
| rename | `ctrl+r` |
| delete | `ctrl+d` |
| pin | `ctrl+f` |
| sidebar | `ctrl+b` |
| model | `ctrl+m` |
| status | `ctrl+shift+s` |
| theme | `ctrl+t` |
| undo | `ctrl+z` |
| redo | `ctrl+y` |
| export | `ctrl+x` |
| conceal | `ctrl+h` |
| timestamps | `ctrl+alt+t` |
| pageDown/pageUp/first/last | `pagedown`/`pageup`/`home`/`end` |

All overridable in `.nimbl/settings.json`. No ctrl+s/ctrl+q defaults (test-enforced).

## 15. Slash Commands

See §5.6 catalog. Command handler `execute(name, argument)` covers resume/continue, new, rename, fork, pin, delete, model/provider/agent/palette/sidebar/home, compact, undo/redo, clear, context, details/status, stats, debug, diff, subagents, notifications, help, keybinds, theme, thinking, conceal, timestamps, animations, skills, settings, route local|fast|budget, init, export, export-options, share/unshare, workspace, stash/pop/stashes, editor, retry, quit + custom project commands (`$ARGUMENTS`, `$1..$n`).

## 16. Agent Runtime & Tools (`src/core/agent.ts`)

### 16.1 Public types
- `AgentMode = "build" | "plan" | "explain" | "learn"`
- `ApprovalChoice = "once" | "always" | "reject"`
- `PermissionRequest { id, tool (14 tools + external_directory), title, detail, diff?, target? }`
- `AgentEvent` union: text-delta / reasoning-delta / ToolEvent
- `AgentRunResult`: text, reasoning, usage (input/output/total/noCache/cacheRead/cacheWrite/textTokens/reasoningTokens), attempts, latencyMs, cacheKey, finishReason, rawFinishReason, callId/responseId/requestId, budget, retrieval

### 16.2 Constants
`MAX_FILE_BYTES 48_000`, `MAX_SEARCH_FILES 250`, `MAX_TOOL_STEPS 12`, `MAX_ATTEMPTS 3`

### 16.3 Modes & tool gating
```
build:   read, glob, grep, write, edit, apply_patch, bash, webfetch, websearch, skill, question, todowrite, delegate (13)
plan:    read, glob, grep, webfetch, websearch, skill, question, todowrite, delegate (9)
explain: read, glob, grep, skill, question (5)
learn:   read, skill, question, todowrite (4)
```
`assertModeTool` enforces mode gating inside `approve()`. Mode prompts injected into system.

### 16.4 Model client
- Anthropic protocol → `createAnthropic`; else `createOpenAI`; provider `openai` → `client.responses(model)`, else `chat(model)`

### 16.5 System prompt construction
1. Identity line
2. `ASSISTANT_RESPONSE_STYLE` (no-emoji directive)
3. modePrompt
4. Tool-usage guidance
5. "Current permission policy:" list for read/glob/grep/edit/write/bash/webfetch/websearch/skill/question/delegate
6. `teachingPrompt(learning)`
7. `skillGuidance` `<available_skills>` block

Project instructions: AGENTS.md + NIMBL.md (12,000-char clip each). Retrieval: `selectProjectContextWithBudget` (12 items, budget `min(ctx*4, 500k)`), `compressContext` structural. History: last 30 messages, split via budgetPromptParts at `"\n\nAttached file:"` / `"\n\nUser-requested command output"` markers. Budget: `fitRequestToBudget`; throws if doesn't fit. Prompt cache: `buildCachedPrompt`.

### 16.6 The run loop
```
for attempt = 1..maxAttempts:
  attemptActivity = false
  try:
    streamText({ model, system, messages, tools, maxOutputTokens, providerOptions,
                 maxRetries: 0, prepareStep: checkContext, stopWhen: stepCountIs(min(12, maxToolSteps)),
                 abortSignal })
    for part of fullStream:
      error part → describeStreamError
      tool-call → fingerprint; count >= doomLoopThreshold(3) → doom-loop event + throw
      text-delta / reasoning-delta → stripEmojis, attemptActivity = true
    usage; maxTokens check → budget event + throw
    return result
  catch:
    if attemptActivity || attempt === maxAttempts || abortSignal.aborted || !retryable → throw
    onRetry({attempt, message}); wait((retryDelayMs ?? 500) * 2^(attempt-1))
throw "Agent execution failed."
```
- `maxRetries: 0` (NIMBL owns retry/backoff)
- `retryable()`: TypeError always; AI_NoOutputGeneratedError/AI_RetryError retryable if status 408/409/429/≥500 or message pattern; others status or code ECONNRESET/ECONNREFUSED/ETIMEDOUT/EAI_AGAIN
- `prepareStep`: per-tool-loop context guard
- Doom-loop: `repeatedToolCalls` map, threshold 3 — **now asks the user via the `doom_loop` approval modal on first trigger** (`Continue after repeated <tool> calls?`), continues on approval, hard-stops if it repeats again (implemented 2026-08-14)
- **Retry-After header honored** in backoff (capped 30s) via `retryAfterMs()` (implemented 2026-08-14)
- Token budget: post-usage check

### 16.7 The 14 tools (exact schemas, gating, output)

| Tool | Schema | Flow / output |
|---|---|---|
| read | path, startLine?, endLine? | resolvePathAllowExternal → approveExternal → approve("read") → line-numbered text (48KB cap); protected/external gating |
| glob | pattern | approve("glob") → Bun.Glob (cwd root, onlyFiles) → skip node_modules/.git → resolveUnprotectedProjectPath, skip protected → cap 200 → relative paths (12K clip) |
| grep | query, pattern? | approve("grep") → RegExp (case-insensitive) → scan cap 250 → per-file assertReadable → cap 100 matches → `rel:line: text` |
| write | path, content | resolvePathAllowExternal → approveExternal → diff → approve("write") → mkdir/write → onFileChange → "Wrote rel" |
| edit | path, oldText, newText, replaceAll? | resolvePathAllowExternal → approveExternal → **multi-strategy `applyEdit` cascade (exact → line-trimmed → block-anchor → whitespace-normalized → indentation-flexible → trimmed-boundary → context-aware)** with ambiguous/disproportionate guards → diff → approve("edit") → write → onFileChange (implemented 2026-08-14) |
| apply_patch | patch (min 1) | patchPaths (project-relative, throws if none) → approve("apply_patch") → **git apply --whitespace=nowarn -** → onFileChanges → "Applied patch" |
| bash | command | approve("bash") → runShellCommand (120s timeout, 12K output cap) → "Exit code N\noutput"; NOT sandboxed |
| webfetch | url (http/https), maxChars? ≤24000 | safeURL → approve("webfetch" target hostname) → fetch UA NIMBL/0.1 → strip script/style/tags → clip |
| websearch | query, maxResults? ≤8 | approve("websearch", target duckduckgo) → DuckDuckGo HTML → 5 (max 8) results `title\nurl` |
| skill | name | approve("skill") → loadSkill → `<skill_content>` wrapper + `<skill_files>` |
| todowrite | items[] (1-12) | approve("todowrite") → `[x]`/`[>]`/`[ ]` lines |
| delegate | prompt, agent? | approve("delegate") → delegateTask callback → child result text (no aggregate token cap design) |
| question | prompt, options? (2-6), freeform? | approve("question") → askQuestion callback → answer string |

`compatibilityIssues` gate: model without tool calling throws in any tool-enabled mode.

## 17. Permission System

### 17.1 Settings schema
`PermissionValue = "ask"|"allow"|"deny"`; `PermissionRule = value | Record<string, value>`; `PermissionSettings = Record<string, rule>` keyed by tool; special keys `"*"` (default) and `"external_directory"`

**Defaults** (`.nimbl/settings.json`):
```
"*": "ask",
read/glob/grep/skill/todowrite: "allow",
edit/write/apply_patch/bash/webfetch/websearch/question/delegate: "ask",
external_directory: "ask",
doom_loop: "ask",
```

### 17.2 Rule resolution (`permissions.ts`)
- `wildcard(pattern, value)`: `*` → `.*`, regex-escaped, anchored, case-insensitive, last match wins
- `permissionFor`: specific tool rule → if `external_directory` and nothing explicit → **`"ask"` unconditionally (never inherits `"*"`)** → else `"*"` rule → `"ask"`
- `permissionDecision`: matchedRule string + rationale; `requiresApproval = value === "ask"`
- `updatePermission`/`removePermission`: scalar or per-target object rules

### 17.3 Approval flow (TUI)
- `askApproval`: `alwaysAllowed` Set (key `tool\0target`) → else enqueue approvalQueue promise
- `answerApproval`: once → resolve; always → Set + persist rule to settings.json; reject → resolve `{reject: message}` — **the rejection message is fed back to the model** as a tool error (implemented 2026-08-14)
- Ctrl+C → `reject-approval`; drain on run end/abort/error

### 17.4 Headless
`requestApproval`: policy allow → "always"; `--yes` → "always"; deny → throw; else "Headless run cannot approve ... Pass --yes to allow, or configure a permission."

## 18. Path Safety & External Directory

### 18.1 Protected paths (`project-path.ts`)
- **Env files**: any segment `.env`/`.env.*` except `.env.example`
- **Protected names**: `.npmrc`, `.pypirc`, `.netrc`, `.git-credentials`, `credentials.json`, `service-account.json`, `id_rsa`, `id_ed25519`, `id_ecdsa`, `id_dsa`
- **Protected extensions**: `.pem`, `.key`, `.p12`, `.pfx`, `.jks`, `.keystore`
- **Protected segments**: `.git`, `.nimbl` (first), `.ssh`, `.aws`
- `resolveProjectPath`: canonical realpath + symlink/junction escape detection
- `resolveUnprotectedProjectPath`: + protected checks

### 18.2 `external_directory` (implemented this audit)
- `resolvePathAllowExternal(root, path) → {full, rel, inside}`: allows paths outside the project, still blocks all protected files inside AND outside
- `approveExternal` gate in agent: if `!inside`, check `permissionFor("external_directory", dir)`; deny → "Access to X is blocked by project policy."; allow → pass; else requestApproval; reject → "The user rejected access to this directory."
- Applied to `read`, `write`, `edit` (apply_patch stays project-only)
- Modal: `← Access external directory <dir>` with Allow once/Always/Reject
- `external_directory` never inherits the global `"*"` rule (test-enforced)

## 19. Sessions & Storage (`sessions.ts`, `session-actions.ts`, `transcript.ts`)

- **StoredSession**: id, title, messages, agent, created, summary, pinned, parentID, updated, reasoningVisible, contextTokens/Window/tokens/cost (legacy), compaction, archivedMessages, legacyUsage, snapshots/redoSnapshots, draft/draftHistory, stashes, queuedPrompts, runState, todos, unread, tags, share
- **StoredRequestUsage**: full token breakdown + referenceCostUsd + providerCostUsd + budget + retrieval telemetry
- **StoredAssistantPart**: text | reasoning (started/ended) | tool (state, started/ended)
- **StoredCompaction v1**: narrative, decisions, constraints, modifiedFiles, unresolvedTasks, relevantErrors, learningState, sourceMessageIds/Count, compactedAt
- **SessionStore v2**: version, revision, activeID, provider, model, sessions, archived
- **Validation/migration**: `parseSessionStore` (v1→v2 migration, structural validation); `loadSessionStore` → missing/valid/invalid + sha256 fingerprint; `backupInvalidSessionStore` (3 newest)
- **Locking/CAS**: `.nimbl/sessions.lock/owner.json` (30s stale-lock + PID liveness); revision CAS → `SessionStoreConflictError`; recoveryFingerprint guard; retention (90 days, 50 active unpinned, 100 archived); 3-generation `.bak` rotation; fsync + atomic rename
- **Transcript**: `reduceAssistantEvents` (32ms batched in TUI) merges text/reasoning/tool deltas preserving part identity; `finishAssistant` closes running reasoning + tool parts
- **Snapshots**: `recordSnapshot` (max 40, clears redo), `recordSnapshotGroup` (multi-file), `undoSnapshot`/`redoSnapshot` (assert-current stale guard), `snapshotUnifiedDiff`, `revertToMessage`
- **Drafts/stash/queue**: draft history ≤50, stashes ≤20, queuedPrompts ≤20; `setTodos` ≤100; `forkSession` (remapped ids)
- **Compaction**: `shouldCompactSession` ≥82% context; `compactSession(keep=12)` archives old messages, extracts decisions/constraints/errors/unresolved todos/modified files/learning state, narrative ≤12K

## 20. Retrieval Engine

### 20.1 Lexical (`context.ts`)
- `STOP_WORDS` (18), `CACHE_TTL_MS 60_000`, `MAX_FILE_BYTES 256_000`, `SUPPORTED` {ts,tsx,js,jsx,json,md,py,go,rs}
- Hard excludes: node_modules/.git/.nimbl/dist; nested `.gitignore` via `ignore` package
- Index build: glob `**/*` (dot:true, onlyFiles), ignore rules, binary/size limits, structural chunks, cooperative yield every 64 files, optional watch mode
- **Scoring**: `hitTerms*10 + occurrences*2 + proximity(4) + symbolMatches*8 + pathMatches*6`; structural chunk preference
- Query cache (60s TTL, 80 entries); `compressCode` excerpts

### 20.2 Dependency graph (`dependency-graph.ts`)
- Identities: `file:path`, `path#name`; edges: import/export/references/calls/inherits/tests; Babel parser (typescript+jsx)
- Test detection: `*.test.*`/`*.spec.*` names + test-framework imports (vitest/jest/bun:test/@testing-library/react etc.)
- Unambiguous symbols only; incremental invalidation; **budgeted BFS `expandFrom(seeds, budgetChars, limit)`** with hop/reasons; cooperative build

### 20.3 Structural chunks (`structural-context.ts`)
- Babel-backed top-level declarations (functions/classes/interfaces/type aliases/enums/vars/imports), JSON per-property chunks; fallback to lexical

### 20.4 Embeddings / Vector index / Hybrid (`embeddings.ts`, `vector-index.ts`, `hybrid-retrieval.ts`)
- **Local deterministic embedder** (192-dim FNV-1a feature hash, unigram/bigram/trigram, signed, L2) model `local-feature-hash`; **hosted** via `NIMBL_EMBEDDINGS_URL/KEY/MODEL` (default text-embedding-3-small)
- Vector index v1: sha1 content hashes, unit = chunk or 4K lexical, `.nimbl/vector-index.json` persist/reload, `isCurrentVectorIndex`
- **Hybrid fusion weights: lexical 0.5 / semantic 0.35 / graph 0.15**; greedy MMR (`diversity` 0.25), duplicate suppression cosine >0.92 (Jaccard fallback), topK default 12

## 21. Prompt Engineering Support

- **Attachment parsing** (`parseAttachmentReferences`): `@file`, quoted `@"file with spaces"`, `:line` / `:line-end`, max 8, http excluded
- **Read attachment**: env-blocked, missing-file message, 24K cap, chip `@src/foo.ts:10-20`
- **Command blocks** (`preparePromptContext`): `` `!command` `` expansion, max 3, gated by bash permission + build mode
- Frecency recording for attachments

## 22. Budgeting & Token Counting

- `budgetRequest`: categories (system/toolSchemas/history/summary/attachments/projectInstructions/retrieval) + protocolOverhead `(h+s+2)*4` + outputReservation + safetyMargin `max(256, 2%)`
- `fitRequestToBudget`: drops retrieval then oldest history (min 2) deterministically
- Tokenizers: exact `o200k_base`/`cl100k_base` via js-tiktoken; family estimates (anthropic 3.5, gemini 3.7, llama 3.2, mistral 3.3 chars/token ×1.15)
- `ASSISTANT_RESPONSE_STYLE`: "Never use emoji characters..." + `stripEmojis`

## 23. Prompt Caching (`prompt-cache.ts`)

- Stable prefix (system + project instructions + summary) before dynamic retrieval text
- Anthropic: per-part `cacheControl: {type:"ephemeral"}` on stable part
- OpenAI-compatible chat: `promptCacheKey` + `mode: "explicit"`; no hints for OpenAI Responses or local providers
- sha1-12 cacheKey; provider-reported cacheRead/cacheWrite tokens flow to usage

## 24. Providers, Routing, Pricing, Health

### 24.1 Catalog (`providers.ts`)
`freellmapi` (local), `opencode-zen` (14 models incl. free deepseek-v4-flash-free/nemotron-3-ultra-free; fallback OPENCODE_ZEN_API_KEY), `opencode-go` (19 models, baseURL `/zen/go/v1`, fallback OPENCODE_GO_API_KEY), `openai`, `anthropic` (anthropic protocol), `github-models` (GITHUB_TOKEN + headers), `openrouter`, `google`, `groq`, `together`, `fireworks`, `deepinfra`, `mistral`, `perplexity` (no tools/structured output), `xai`, `cerebras`, `nvidia`, `ollama` (local), `lmstudio` (local)

- `defineModel` defaults: maxOutputTokens `min(32_768, floor(ctx/4))`; capabilities tools/reasoning/imageInput/streaming/structuredOutput
- `resolveModel` (unknown model requires explicit context ≥1024 → synthetic), `compatibilityIssues`, `providerApiKey` (envKey → fallbackEnvKey), `modelContextWindow` (NIMBL_CONTEXT_WINDOW override)
- **"Did you mean" suggestions** (implemented 2026-08-14): unknown models in `getModel`/`resolveModel` now suggest up to 3 close model IDs via edit-distance
- Live catalog: `modelsDevKey` (opencode-zen → opencode), `applyLiveCatalog` replaces static models with models.dev entries

### 24.2 Routing (`routing.ts`)
- `rankProviders`: filter (allowlist/denylist/available/capability) → score: local/private +50, fast +35(groq)/+10, free +40 or `max(0, 20-cost*1e6)`, reasoning +20, unhealthy −100, latency bonus, overruns −80; routeProviderWithRationale returns top; routeProvider only when prompt triggered a preference
- TUI routes per-prompt, health-checks candidate before switching

### 24.3 Pricing (`pricing.ts`)
- `NIMBL_MODELS_URL || "https://models.dev"` `/api.json`, 2h TTL cache at `%LOCALAPPDATA%\nimbl\models.dev.json`, atomic write 0600; `catalogPrice` (opencode-zen alias), `estimateProviderCost` (cache tiers, reasoning rate), `warmCatalog` at startup

### 24.4 Health (`provider-health.ts`)
- GET `{baseURL}{health.path}` default `/models`, 30s/5s cache, timeout 3s; status healthy/unavailable; extracts discoveredModels

### 24.5 Legacy API (`api.ts`)
- `sendChat` via generateText (non-streaming); `estimateReferenceCost` = GPT-4o baseline `prompt*2.5e-6 + completion*1e-5` (explicitly "not actual savings")

## 25. Skills (`skills.ts`)

- Frontmatter parser (`name`/`description`); directories: project `.nimbl/skills/`, global `{APPDATA|XDG_CONFIG_HOME}/nimbl/skills/`, configured `skills.paths`
- `canonicalSkillFile`: name regex `/^[a-z0-9][a-z0-9_-]*$/i`, project path must equal `.nimbl/skills/<name>/SKILL.md`, symlink escapes rejected
- `discoverSkills` (dedupe by name), `loadSkill` (body + files ≤20), `availableSkillGuidance` → `<available_skills>` XML into system prompt
- **Remote skill URLs (implemented 2026-08-14):** `settings.skills.urls` now supported. `syncRemoteSkills(settings)` fetches `<url>/index.json` (`{skills: [{name, files}]}`), downloads each `SKILL.md` + declared files into a versioned cache under `{LOCALAPPDATA|XDG_CACHE_HOME}/nimbl/skills-remote/<slug>/`, and returns summaries; failures degrade silently (local skills unaffected). Cached remote skills are discovered and loadable via `canonicalSkillFile` (remote source resolves before config dirs). `NimblBackend` syncs registries at construction (fire-and-forget) and exposes `syncRemoteSkillRegistries()`.

## 26. Learning / Socratic State (`learning.ts`)

- State v2: concepts (encounters/confidence/updated/evidence/prerequisites/misconception), skills, goals, quizzes, preferences
- **18 known concepts**: typescript, react, solid, testing, api, async, git, docker, database, security, performance, css, context, retrieval, tokens, prompt-caching, permissions, compaction
- `observeLearning`: confidence +0.08 success / +0.02 error; `recordLearningAttempt`: EMA `conf*0.8 + score*0.2`, misconception severity; `scheduleReview` 30/7/2/1 day buckets; `dueReviews`; goals; quizzes; `resetLearning`; `exportLearning`
- Persistence `.nimbl/learning.json`; `storePrompts` forced false (prompts never persisted)
- `teachingPrompt`: up to 4 low-confidence uncorrected concepts → "Teaching focus: briefly explain the relevant trade-off, especially around ..."; else generic trade-off line; never quizzes unless asked

## 27. Backend & Feature Modules (`backend.ts` + core)

- **NimblBackend**: load/save (CAS + recovery + blocked flag), settings, learning, createChildSession/delegate (depth 3), runTask (budget/abort/notifications), run (root enforcement, compression structural, shared context index, settings), searchSessions, contextDiagnostics, worktrees, git checkpoints, filesystem snapshots, export/share, credentials, recoverInterruptedRuns, generateSessionTitle (64 chars), generateSessionSummary (8 msgs, 240 chars)
- **auth.ts**: AuthRegistry (in-memory OAuth sessions), PKCE (createOAuthChallenge, oauthCodeChallenge S256), 0600 save
- **credentials.ts**: resolution CLI key → env → saved global; redactSecret; discoverProviderModels
- **editor.ts**: settings.prompt.editor → VISUAL → EDITOR; temp-file edit round-trip
- **export.ts**: markdown/json export, includeReasoning/includeTools/redactSecrets (default on); redactSecrets (Bearer, api_key/token/secret/password, sk-/pk- keys, PEM)
- **filesystem-snapshot.ts**: full-tree capture (base64 + mode), rejects symlinks; staged restore with atomic swap
- **frecency.ts**: `.nimbl/frecency.jsonl`, score `frequency/(1+ageDays)`, max 1000
- **git-checkpoints.ts**: `.nimbl/checkpoints/<id>.json`, create/list/restore (refuses dirty without force, git restore + apply --binary)
- **notifications.ts**: NotificationCenter (cap 200, attention = non-info), 5 kinds, redaction
- **share.ts**: POST `{NIMBL_SHARE_URL}/shares` redacted markdown; delete with Bearer deleteToken
- **tasks.ts**: TaskKind agent/subagent/background; budgets (64K/Infinity tokens, 100 steps, 4 processes); events cap 500; addUsage enforces budget
- **workspace.ts**: WorktreeManager create/remove/prune (outside-only targets, dirty guard)
- **commands.ts**: `.nimbl/commands/*.md`, frontmatter + `$ARGUMENTS`/`$1..$n`
- **shell.ts**: runShellCommand (powershell/sh -lc, 120s, 12K cap, kill on timeout/abort)
- **ctrl-c.ts / exit-guard.ts / terminal-win32.ts**: as documented in §5

## 28. Configuration

### 28.1 Priority chain (full)
CLI flag > env var > global config (`%APPDATA%/nimbl/config.json` / `~/.config/nimbl/config.json`) > project config (`.nimbl/config.json` → `nimbl.config.json`) > `DEFAULT_SETTINGS`

### 28.2 `config.ts` `resolveConfig`
- Provider: `--provider` > `NIMBL_PROVIDER` > saved > `"freellmapi"`
- Model: `--model` > `NIMBL_MODEL` > saved > `defaultModelFor`
- API key: `--api-key` > providerApiKey (env + fallback) > saved providerKeys > `"local"` (local providers) > `""`

### 28.3 Settings schema (`.nimbl/settings.json`)
`theme, keybinds, customCommands, providerRouting, permissions, mcp (stub), plugins, lsp (stub), share, shareURL, agents, providerAllowlist, providerDenylist, prompt {queue, historySize 50, maxStash 10, editor}, notifications {completion, permission, question, failure, sound false}, learning, workspace {useWorktrees, requireCleanGit}, skills {paths, urls}`

### 28.4 Global config
`{provider, model, providerKeys, favoriteModels, recentModels, thinkingMode}`; atomic write 0600

### 28.5 Env vars (complete inventory)
`FREELLMAPI_KEY, OPENROUTER_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, GITHUB_TOKEN, GEMINI_API_KEY, GROQ_API_KEY, TOGETHER_API_KEY, FIREWORKS_API_KEY, DEEPINFRA_API_KEY, MISTRAL_API_KEY, PERPLEXITY_API_KEY, XAI_API_KEY, CEREBRAS_API_KEY, NVIDIA_API_KEY, OLLAMA_API_KEY, LMSTUDIO_API_KEY, OPENCODE_API_KEY (shared), OPENCODE_ZEN_API_KEY, OPENCODE_GO_API_KEY, NIMBL_PROVIDER, NIMBL_MODEL, NIMBL_CONTEXT_WINDOW, NIMBL_SHARE_URL, NIMBL_EMBEDDINGS_URL/KEY/MODEL, NIMBL_MODELS_URL, NIMBL_BENCH_SEED/SAMPLES/COLD, NIMBL_TEST_RENDERER, VISUAL, EDITOR, APPDATA/XDG_CONFIG_HOME/LOCALAPPDATA/XDG_CACHE_HOME/HOME`

### 28.6 Project config (`config-schema.ts`)
`validateSettings` diagnostics (allowlist id regex, duplicate keybinds, historySize ≥1, skills.paths strings, skills.urls http(s)); `loadProjectConfig` merges `.nimbl/config.json` then `nimbl.config.json`; `watchProjectConfig`

## 29. CLI Commands (`cli-commands.ts`)

- **`run` / `--print` / `-p` / `--prompt`**: headless agent run; `--provider`, `--model`, `--agent`, `--yes/-y`, `--api-key`; fail-fast on missing key; writes `(result.text || result.reasoning || "(no text output)")`
- **`session`**: `list [--max-count|-n] [--format json]`, `delete <id>` (prefix match), `rename <id> <name...>`
- **`providers`**: console.table (id/name/models/local)
- **`models`**: console.table (provider/id/context/free)
- **`agent`**: console.table (id/description)
- **`stats`**: sessions/messages/token sums
- **`export <id>`**: markdown
- **`config`**: project/state/config paths
- **`doctor`**: root/state/sessions paths
- TUI-level: `-s/--session`, `-c/--continue`, `--fork`, `--provider`, `--model`, `--api-key` (unknown flags ignored)

## 30. Benchmark (`benchmark.ts` + `benchmarks/run.ts`)

- **7 modes**: none/lexical/structural/graph/semantic/hybrid/prompt-cache (mode→index options map)
- **Determinism**: `mulberry32(seed)`, default seed 20260728, per-(task,sample) seeds
- **Grading**: precision@k, recall@k, MRR, firstRelevantRank; `varianceSummary`
- **Ablations**: quality = mean(P/R/MRR); eligibility guard MRR+0.0001 ≥ lexical baseline; `defensibleClaims` (tokenReduction vs lexical, only when no regression)
- **JSONL** under `.nimbl/benchmarks/`; metadata (timestamp/seed/gitRevision/gitDirty/version/provider/model/contextWindow/cacheState)
- **Frozen corpus**: 6 tasks (`theme-config, retry-count, add-helper, feature-tests, report-importers, main-uses-feature`) over a fixture TS project + committed `.nimbl/vector-index.json`

## 31. Tests (34 files)

`agent-prompt, agent-run, api, backend-features, backend, benchmark, cli, commands, config, context, dependency-graph, edit-apply, entrypoints, exit-guard, learning, permissions, prompt-cache, prompt-context, prompt-flow, provider-catalog, provider-health, providers, request-budget, retrieval-hybrid, session-actions, session-lifecycle, sessions, settings, shell, skills, stream-error, structural-context, tokenizers, transcript, tui-smoke` — 232 tests passing, 606 expect() calls. New coverage (2026-08-14): `edit-apply` cascade (11 cases), remote skill URLs, doom_loop ask/reject, reject-with-message feedback, retry-after header parsing, reactive theme switching.

## 32. Documentation (`docs/`)

- **RESEARCH_REPORT.md** (829 lines): problem (token crisis, pedagogical gap), solution, competitive landscape, token-compression research, architecture, stack evolution (REPL→Ink→OpenTUI), TUI design, dependencies, testing, token cost, learning-system future, provider integration, build plan/history, branding, known issues
- **AI_IMPLEMENTATION_ROADMAP.md**: phased roadmap P0–P7 status (Phases 0–2 done, P3-01 done; teaching/ecosystem largely pending)
- **BACKEND_STATUS.md**: backend contract, implemented surfaces, out-of-scope (MCP/plugins/LSP, hosted share adapters)
- **OPENCODE_PARITY_AUDIT.md**: app-flow mermaid, TUI interaction inventory, UI design review 6.5/10, feature-comparison tables
- **OPENCODE_UI_PARITY_PLAN.md**: line-by-line TUI parity plan (themes, shell, composer, autocomplete, palette, timeline, tool cards, permission/question prompts, dialogs, sidebar, subagent footer, home, toasts, spinner, notifications, keybindings, diff viewer)
- **MODEL_PROVIDER_LOGIC_AND_UI_ANALYSIS.md**, **MODEL_PROVIDER_PARITY_ANALYSIS.md**: provider/model logic + modal UI analysis and parity
- **THINKING_TIME_ANIMATION_ANALYSIS.md**: thinking/time/animation parity matrix; §7 total metric out of scope
- **DEVLOG_2/3/4**: engineering history (13 → 110 → 149 tests)

---

*End of NIMBL complete feature inventory.*

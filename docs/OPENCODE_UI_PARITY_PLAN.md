# NIMBL × opencode — Full TUI Parity Plan (release-ready)

Audited against the local clone `C:\Users\jerem\Documents\GITHUB\opencode` (packages/tui/src), opencode README, and the complete NIMBL `src/tui-opencode.tsx` + `src/tui-opencode-ui/*`.

**Goal:** make NIMBL's UI a 1-to-1 port of opencode's UI (like "mimo" does for its host), except for the explicitly preserved NIMBL-custom surfaces. Every difference below lists: where it is in NIMBL, where the reference is in opencode, what differs, how to fix it, and whether to keep or port.

---

## 0a. Implementation status

- **Phase A (visual parity) — IMPLEMENTED.** Sections 1 (thinkingOpacity/extmarks), 2 (conceal/timestamps/QUEUED/Compaction), 3 (tool card details), 4 (copy-on-select/toast fallback/animations toggle), 5 (rotating placeholder/typed-quit), 6 (keybind set) are wired. See `src/tui-opencode-ui/{theme,syntax,native,session,spinner,toast,prompt}.ts(x)` and `src/tui-opencode.tsx`.
- **Phase B (interaction parity) — IMPLEMENTED.** Sections 8 (permission 3-stage), 9 (question prompt), 10.2 (quick slots/gutter), 10.8 (alert/help/export/stash dialogs + timeline live scroll), 12 (subagent footer) are wired. See `src/tui-opencode-ui/{docked-prompts,dialogs,session}.tsx` and `src/tui-opencode.tsx`.
- **Phase C (large ports) — DEFERRED by request:** §18.1–18.2 full keymap/leader/which-key, §19 full-screen diff viewer, §4.3/4.4/4.7 structured file parts + line ranges + extmarks, §1.10/§10.5 live theme switching + 34-theme catalog, §10.3 model cycling F2, §10.7 structured status/debug, §17 attention/sound.
- Verification: `bun run typecheck`, `bun test` (186), `bun run build`, and the renderer smoke test all pass.

---

## 0. Scope, method, and the KEEP list

### What is intentionally NIMBL-custom (DO NOT port — keep)
These four surfaces are the NIMBL identity and are out of scope for parity:

| Surface | NIMBL location | Note |
|---|---|---|
| **Home screen** (logo, tagline, centered prompt, footer) | `src/tui-opencode.tsx` home branch (≈1775–1814) vs opencode `routes/home.tsx` | Keep NIMBL logo / tagline / brand. opencode's logo slot is a plugin slot; we keep ours static. |
| **Custom prompt bar with modes** (Build/Plan/Explain/Learn left-border color + `╹` seam + mode labels) | `src/tui-opencode-ui/prompt.tsx` footer + `agentColor()` in `theme.ts` | Keep. NIMBL has 4 modes vs opencode's 2 (build/plan) + Tab cycling. |
| **Custom scrollbar** | `SessionScreen` scrollbox `verticalScrollbarOptions` (opencode: `routes/session/index.tsx` scrollbox) | Keep NIMBL's scrollbar styling decision (only if it matches the audit item below under "scrollbox" — see that row). |
| **Green secondary color** | `theme.ts` — `brand #16885a`, `primary #06402b`, `primaryForeground #4ade80`, `syntaxFunction/markdownListItem/markdownImage` = green | Keep. All other tokens must match opencode. |

### Method
- **Reference = opencode `packages/tui/src`** at the local clone (dev branch, matches the vendored OpenTUI 0.4.5 contract).
- **NIMBL = `src/tui-opencode.tsx` + `src/tui-opencode-ui/*`** (13 component files + entry).
- Differences are grouped by surface. Each row: `KEEP` (intentional NIMBL) or `PORT` (must change to match opencode) or `PARTIAL` (matches in part).

---

## 1. Theme / colors (theme.ts)

NIMBL: `src/tui-opencode-ui/theme.ts` (71 lines) — a static `const theme` object with a green-tinted opencode palette.
opencode: `theme/assets/opencode.json` (dark/light Variants + defs) resolved through `theme/index.ts` + `context/theme.tsx` (live switching, system palette, mode lock, 34 themes).

| # | NIMBL | opencode reference | Difference | Fix | Verdict |
|---|---|---|---|---|---|
| 1.1 | `theme.ts` object is a flat static const | `opencode.json` uses `defs` + dark/light `Variant` refs; `resolveTheme()` converts | NIMBL has no light mode, no variant resolution, no `thinkingOpacity` | Port opencode's dark values verbatim into the flat object (they already match); **do not** need the Variant machinery unless live theme switching is wanted | PARTIAL (dark-only is fine for v1; keep green) |
| 1.2 | `primary: #06402b`, `primaryForeground: #4ade80`, `brand: #16885a` | opencode `primary: #fab283` | **KEEP green** — primary is the green accent, `selectedListItemText`/`primaryForeground` is the bright green text | none | **KEEP** |
| 1.3 | `secondary: #5c9cf5`, `accent: #9d7cd8`, `error: #e06c75`, `warning: #f5a742`, `success: #7fd88f`, `info: #56b6c2` | opencode identical | Already 1:1 | none | OK |
| 1.4 | `text #eeeeee`, `textMuted #808080`, `background #0a0a0a`, `backgroundPanel #141414`, `backgroundElement #1e1e1e`, `backgroundMenu #1e1e1e`, `borderSubtle #3c3c3c`, `border #484848`, `borderActive #606060` | opencode identical | 1:1 (backgroundMenu falls back to backgroundElement in opencode too) | none | OK |
| 1.5 | diff tokens: `diffAdded #4fd6be`, `diffRemoved #c53b53`, `diffContext #828bb8`, `diffHunkHeader #828bb8`, `diffHighlightAdded #b8db87`, `diffHighlightRemoved #e26a75`, `diffAddedBg #20303b`, `diffRemovedBg #37222c`, `diffContextBg #141414`, `diffLineNumber #8f8f8f`, `diffAddedLineNumberBg #1b2b34`, `diffRemovedLineNumberBg #2d1f26` | opencode identical | 1:1 | none | OK |
| 1.6 | markdown tokens (Text/Heading/Link/LinkText/Code/BlockQuote/Emph/Strong/HorizontalRule/ListItem/ListEnumeration/Image/ImageText/CodeBlock) | opencode identical except NIMBL overrides Link/ListItem/Image to green | Keep green overrides (brand); match the rest | Verify each value vs opencode.json; keep green for Link/ListItem/Image/Code/SyntaxFunction | PARTIAL — keep green brand overrides |
| 1.7 | syntax tokens | opencode `syntax*` tokens | match except green override on `syntaxFunction` | keep green override | PARTIAL |
| 1.8 | `agentColor()` per-mode colors (build=secondary blue, plan=accent purple, explain=success green, learn=warning orange) | opencode colors agent only by name in message rail/footer via `local.agent.color` | NIMBL's 4-mode color mapping is a custom extension (opencode has 2 agents) | Keep (modes are NIMBL-custom) | **KEEP** |
| 1.9 | No `thinkingOpacity` token | opencode uses `thinkingOpacity` (default 0.6) for open reasoning alpha | Reasoning header in opencode uses alpha-blended `theme.warning` | Port `thinkingOpacity = 0.6` and apply to ReasoningPart/header when open | PORT |
| 1.10 | No live theme switching; `/theme` requires restart (toast "Restart NIMBL to apply it") | opencode `context/theme.tsx` live-switches; theme list with rollback on cancel | NIMBL `/theme` dialog persists a name and toasts restart | If live switching desired: port a `createSignal` theme ref + re-render. Otherwise leave (documented limitation) | PARTIAL (see §10.5) |

---

## 2. App shell, routing, provider tree

opencode `app.tsx` (1134 lines) is the root; NIMBL `tui-opencode.tsx` (2227 lines) is the whole app.

| # | NIMBL | opencode reference | Difference | Fix | Verdict |
|---|---|---|---|---|---|
| 2.1 | Single `App()` component handles both home and session views with `view()` signal; all dialogs, commands, agent loop in one file | opencode splits into `routes/home.tsx`, `routes/session/index.tsx`, `component/*`, `ui/*`, `context/*`; route store via `context/route.tsx` | Architecture. NIMBL is monolithic; opencode is modular | Not a UI difference — **do not refactor for parity** (functional parity only) | OK |
| 2.2 | Root `<box>`: `flexDirection="column"` + full dims + `backgroundColor`; min-size guard `width>=60 && height>=18` with "NIMBL needs more terminal space" | opencode root box has no min-size fallback; it just renders | NIMBL adds a responsive floor | Keep (NIMBL hardening); opencode has no equivalent | KEEP |
| 2.3 | Startup: no loading overlay | opencode `StartupLoading` (zIndex 5000, "Loading plugins..."→"Finishing startup...", min 3s, appears after 500ms) | NIMBL renders immediately (plugins don't exist) | Skip — no plugin host to wait for | OK |
| 2.4 | Terminal title: `NIMBL | <title>` / `NIMBL` | opencode: `OC | <title>` / `OpenCode`; `isDefaultTitle` guard for `New session - <ts>` | NIMBL always sets title including default titles | Port the `isDefaultTitle` regex (util/session.ts) so default sessions keep "NIMBL" | PORT |
| 2.5 | Error boundary: global `try/catch` writes `nimbl-error.log`, sets exitCode 1 | opencode `ErrorComponent` (240 lines): full-screen "opencode crashed", copy report (c), restart (r), quit (q), GitHub issue URL builder, stack trace panel, fallback palette | NIMBL has no in-TUI crash screen | Port `ErrorComponent` behavior (report copy + restart/quit) into the global handler | PORT |
| 2.6 | Epilogue: `sessionEpilogue()` printed on exit (session screen) | opencode `util/presentation.ts` ASCII wordmark + `Continue opencode -s <id>` | NIMBL already prints a session epilogue | Verify wording matches spirit (NIMBL-branded) | OK |

---

## 3. Prompt / composer

NIMBL: `src/tui-opencode-ui/prompt.tsx` (532 lines). opencode: `component/prompt/index.tsx` (1713 lines) + `prompt/*`.

| # | NIMBL | opencode reference | Difference | Fix | Verdict |
|---|---|---|---|---|---|
| 3.1 | Textarea `initialValue`, `minHeight={1}`, `maxHeight=max(6,h/3)` | opencode same default (`tuiConfig.prompt?.max_height ?? max(6, floor(h/3))`) | 1:1 | none | OK |
| 3.2 | Placeholder: static `"Ask anything..."` | opencode rotating: `` `Ask anything... "${list()[store.placeholder % list().length]}"` `` (list: "Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests") | NIMBL placeholder is static and shorter | Port rotating placeholder array + randomIndex cycling | PORT |
| 3.3 | Shell mode: **not implemented** (no `!` shell entry) | opencode `!` at cursor offset 0 enters shell mode; `esc`/backspace exits; placeholder `` `Run a command... "${example}"` ``; mode label "Shell"; `session.shell` call | NIMBL supports `!`command`` expansion at submit only (`preparePromptContext`) but no live shell composer | Optional: port shell-mode trait (`computePromptTraits`, mode="shell"). Lower priority | PORT (optional) |
| 3.4 | Left meta row: `Agent` label (titlecase) + `·` + model + provider | opencode: `Agent` (or "Shell"), optional `auto` badge, `· model`, `· provider`, optional `· variant` (bold warning), fade-in via `agentMetaAlpha/modelMetaAlpha/variantMetaAlpha` | NIMBL: no auto badge, no variant, no fade animation | Port fade-in alpha animation (`createFadeIn`, util/signal.ts smoothstep ~160ms) + auto badge if routing enabled + variant label | PORT |
| 3.5 | Prompt right slot content | opencode `hasRightContent()` renders `props.right` (usage `context · cost` in footer instead; right slot used by plugins) | NIMBL has no right-slot; context is shown in footer left cluster | Acceptable — no plugin slots | OK |
| 3.6 | Footer (below seam): left `cwd`; right `tab modes` / `context` + `ctrl+p commands` | opencode footer: left = cwd or status spinner/retry/workspace notices; right = `agentShortcut() agents` + `paletteShortcut() commands`, or `usage · cost`; or `esc exit shell mode` | NIMBL: shows context token text on right when available; modes hint; different status handling | Port opencode's footer Switch (idle vs busy spinner, retry text, right `agents`/`commands` shortcuts). Keep NIMBL's `context` token display (NIMBL extension) and `tab modes` hint (modes are custom) | PARTIAL |
| 3.7 | Busy footer: `<Spinner/>` + `esc interrupt` / `esc again to interrupt` | opencode busy: spinner (animated) + `esc <interrupt|again to interrupt>`; retry block `` `[retrying in {d} attempt #{n}]` `` + "gemini is way too hot right now" easter egg | NIMBL lacks retry display in prompt footer | Port retry text into busy footer (`onRetry` already exists) | PORT |
| 3.8 | Submit: Enter submits; Shift+Enter newline (`SUBMIT_KEY_BINDINGS`) | opencode: input bindings via keymap (`input_submit: return`, `input_newline: shift+return,ctrl+return,alt+return,ctrl+j`) | NIMBL only shift+return newline; no ctrl+return/alt+return/ctrl+j | Port full newline binding set | PORT |
| 3.9 | `"exit"`/`"quit"`/`":q"` typed → not handled in prompt | opencode `submitInner` exits app on exact `exit`/`quit`/`:q` | NIMBL sends them to the model | Port the exit-on-typed-quit behavior | PORT |
| 3.10 | Paste: multi-line/150+ chars collapse to `[Pasted ~N lines]` extmark | opencode: same collapse (`paste_summary_enabled`) but also detects **local file paths** → SVG `[SVG: name]`, image/pdf → `[Image N]`/`[PDF N]` FilePart base64 attachments | NIMBL has no image/pdf/svg paste attachment support | Port `pasteInputText`/`pasteAttachment` + `readLocalAttachment` (mime map, data: URLs) | PORT |
| 3.11 | Prompt history: **Ctrl+Up/Ctrl+Down** (custom) | opencode: `history_previous: "up"`, `history_next: "down"` (move to top/bottom of textarea first) | Different keys; opencode uses Up/Down with smart cursor-at-edge handling | Align to opencode: Up/Down navigate history only when cursor at buffer edge; keep Ctrl+Up/Down as additional | PORT |
| 3.12 | Prompt clear: Ctrl+C clears draft only via app-level `ctrlCAction` | opencode: `input_clear: "ctrl+c"` on focused input; `clearPrompt` retains ≥20-char drafts to history | NIMBL retains draft via `recordSessionDraft` on submit but clear path differs | Align: Ctrl+C in focused empty-ish input clears; retain DRAFT_RETENTION_MIN_CHARS=20 | PORT |
| 3.13 | Fade/highlight animation on prompt border: **none** | opencode `borderHighlight = tint(theme.border, highlight(), agentMetaAlpha())` + leader-active border | NIMBL prompt border is static agent color | Port tint/border highlight if animations on | PORT |
| 3.14 | Prompt left seam: `╹` (bottomLeft) + bottom `▀`/`╹` row | opencode identical (`bottomLeft:"╹"`, `EmptyBorder` with `▀` when backgroundElement alpha) | Already ported 1:1 | none | OK |

---

## 4. Autocomplete

NIMBL: `prompt.tsx` autocomplete dropdown (~lines 94–405). opencode: `component/prompt/autocomplete.tsx` (781 lines).

| # | NIMBL | opencode reference | Difference | Fix | Verdict |
|---|---|---|---|---|---|
| 4.1 | Triggers: `/` and `@` | opencode: `/`, `@`, plus `!` (shell), editor mentions | NIMBL lacks `!` autocomplete (shell) | optional; skip unless shell mode ported | OK |
| 4.2 | `@` options: project files (ranked by frecency) + agents (build/plan/explain/learn) | opencode `@`: files (fff/frecency), agents (non-primary), references (git/file aliases), MCP resources | NIMBL adds agent mentions (custom, since modes are custom); lacks references/MCP | Keep agent mention (NIMBL extension); add reference file aliases if needed | PARTIAL |
| 4.3 | File path with spaces: quotes it `"path with spaces"` | opencode `createFilePart` produces a real `FilePart` with `file://` URL + line-range support + extmark; no quoting hacks | NIMBL inserts literal text `@path ` and relies on `preparePromptContext` regex at submit | Port structured file parts with extmarks (fileStyleId), line-range `#L10-L20` support, dedupe by URL, frecency update on insert | PORT |
| 4.4 | Line ranges: only via prompt regex `@file:1-5` at submit | opencode: `extractLineRange` in autocomplete (`path#L1`, `path#L1-L20`), stored in part `searchParams start/end` | NIMBL has no `#L` autocomplete syntax | Port `path#L1-L20` parsing + part metadata | PORT |
| 4.5 | Filtering: substring + prefix match, limit 10 | opencode: fuzzysort over display/value/description/aliases, prefix score ×2, frecency multiplier, threshold | NIMBL filtering is simpler | Port fuzzysort scoring (or keep substring if acceptable) | PARTIAL |
| 4.6 | Directory expand: **not implemented** | opencode `expandDirectory()`: `@dir/` keeps menu open | NIMBL lists flat project files | Optional: add directory option + `@dir/` expansion | PORT (optional) |
| 4.7 | Extmarks: paste extmarks only; file/agent inserts are plain text | opencode: file/agent parts get virtual extmarks (fileStyleId warning+bold, agentStyleId secondary+bold) styled inline in the textarea | NIMBL inserted `@file` isn't visually styled in the composer | Port extmark creation for file/agent parts (`restoreExtmarksFromParts`, `syncExtmarksWithPromptParts`) | PORT |
| 4.8 | `No matching items` empty text | opencode identical ("No matching items") | 1:1 | none | OK |
| 4.9 | Keybindings: arrows, ctrl+n/p, enter, escape, tab (only when open) | opencode: `prompt.autocomplete.prev/next/hide/select/complete` (up/ctrl+p, down/ctrl+n, escape, return, tab) | functionally equivalent | none | OK |
| 4.10 | Position: anchored to prompt top-left, `top={-height}`, absolute | opencode computes `{x,y,width}` from anchor with 50ms polling | NIMBL simpler; visually similar | OK |

---

## 5. Command palette

NIMBL: `tui-opencode.tsx` `paletteOptions` + `SelectDialog` (`dialog="palette"`, ~1826). opencode: `component/command-palette.tsx`.

| # | NIMBL | opencode reference | Difference | Fix | Verdict |
|---|---|---|---|---|---|
| 5.1 | Palette lists `availableCommands()` (BASE_COMMANDS + project commands) | opencode palette = every reachable keymap command (`namespace:"palette"`) with `footer` showing its keybind | NIMBL palette omits keyboard-bound commands & keybind footers | Port: show keybind footer per command via `formatKeyBindings` | PORT |
| 5.2 | `Suggested` category via `showSuggested` + `suggested` flags | opencode prepends `"Suggested"` category of `command.suggested` when no filter | 1:1 already | none | OK |
| 5.3 | Palette trigger: Ctrl+P (setting `keybinds.palette`) | opencode `command_list: "ctrl+p"` | same | none | OK |
| 5.4 | Title: `"Commands"` | opencode title `"Commands"` | 1:1 | none | OK |

---

## 6. Session timeline (message list)

NIMBL: `src/tui-opencode-ui/session.tsx` (847 lines). opencode: `routes/session/index.tsx` (2710 lines).

| # | NIMBL | opencode reference | Difference | Fix | Verdict |
|---|---|---|---|---|---|
| 6.1 | Scrollbox `stickyScroll stickyStart="bottom"` + `scroll.scrollTo(scrollHeight)` on new msgs | opencode identical + `scrollAcceleration` | NIMBL lacks scroll acceleration | Port `getScrollAcceleration` (util/scroll.ts, default speed 3) | PORT |
| 6.2 | Scrollbar: NIMBL configures `verticalScrollbarOptions` (custom) | opencode `showScrollbar` KV default **false**; scrollbar `paddingLeft:1, track bg backgroundElement, fg border` | **KEEP NIMBL's always-visible custom scrollbar** | none | **KEEP** |
| 6.3 | Message grouping: user/assistant cards with left rail | opencode `alwaysSeparate` WeakSet forces gaps; same rail | equivalent | none | OK |
| 6.4 | Timeline navigation: **none** (no page up/down/line/message/first/last) | opencode `session.page.up/down`, `line.up/down`, `half.page.*`, `first`, `last`, `message.next/previous`, `messages_last_user` (keys: pageup/pagedown/ctrl+alt+b/f, home/end/ctrl+g/ctrl+alt+g, etc.) | NIMBL has no message-scroll commands | Port the full scroll command set + bindings | PORT |
| 6.5 | `toBottom` on session change / submit | opencode `createEffect(on(route.sessionID, toBottom))` + `on_submit={toBottom}` | NIMBL scrolls on message count change | equivalent | OK |
| 6.6 | Auto unread/new-output marker: **none** | opencode `pending()` last unfinished assistant; no separate unread dot in NIMBL | NIMBL doesn't mark detached-from-bottom | optional | OK |

### 6a. UserMessage
| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 6a.1 | Left border = `agentColor(mode)`, hover bg `backgroundElement`, normal `backgroundPanel`, padding 1/1/2 | opencode identical + `id` + `alwaysSeparate` | 1:1 | OK |
| 6a.2 | `QUEUED` badge: **absent** | opencode `<span style={{bg: color(), fg: queuedFg(), bold:true}}> QUEUED </span>` | Port QUEUED badge on pending user message | PORT |
| 6a.3 | Timestamp: **absent** (hidden) | opencode shows `Locale.todayTimeOrDateTime(time.created)` only when `timestamps` KV = "show" | Port timestamps toggle (`session.toggle.timestamps`, default hide) | PORT |
| 6a.4 | Attachment chips: `Directory`/`File` pill (secondary bg) + path pill | opencode identical | 1:1 | OK |
| 6a.5 | Compaction divider ` Compaction `: **absent** | opencode `<box border={["top"]} title=" Compaction " titleAlignment="center" borderColor={borderActive}>` between compacted/active | Port divider | PORT |

### 6b. AssistantMessage footer
| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 6b.1 | Footer: `▣ ` agent-color glyph + `Mode` + `· model` + `· duration` | opencode: same + ` · interrupted` on abort | Port ` · interrupted` suffix | PORT |
| 6b.2 | Subagent hint: separate child-nav bar at bottom (custom) | opencode: inline hint `{childShortcut()} view subagents · {backgroundShortcut()} background` under assistant when task parts exist | NIMBL's subagent navigation is a NIMBL-custom bottom bar; keep it, but also add the inline "view subagents" hint | PARTIAL |
| 6b.3 | Error box: `theme.error` left border + `backgroundPanel` + NativeMarkdown | opencode `errorMessage(error)` muted text, border `theme.error` | match text color to muted | PARTIAL |

### 6c. Text / markdown part
| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 6c.1 | NIMBL splits ``` code fences manually into `<code>` blocks + `NativeMarkdown` for the rest | opencode renders one `<markdown>` renderable with `internalBlockMode="top-level"`, `conceal`, `streaming`, `tableOptions={grid}`, `syntaxStyle` | NIMBL's manual split may render fenced code + tables differently (nested fences inside lists, inline code) | Port opencode's single `<markdown>` element with `conceal={conceal}`, `streaming={true}`, `tableOptions grid`, `syntaxStyle` | PORT |
| 6c.2 | Code conceal: **no conceal toggle** | opencode `conceal` (default true) collapses long code blocks; `session.toggle.conceal` (`<leader>h`) | Port conceal + toggle | PORT |
| 6c.3 | Table rendering: `NativeMarkdown` `tableOptions={grid}` | opencode `tableOptions={{ style: "grid" }}` | 1:1 | OK |

### 6d. Reasoning part
| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 6d.1 | `ReasoningPartView`: summary + `Thought` label + `· duration`, spinner "Thinking: ..." | opencode `ReasoningPart`/`ReasoningHeader`: same; strips `[REDACTED]`, `reasoningSummary` extracts `**title**\n\nbody`, `thinkingOpacity` alpha when open, `conceal` | NIMBL already strips `[REDACTED]` and `stripEmojis`; missing `thinkingOpacity` alpha + conceal + `thinkingMode` toggle | Port `thinkingOpacity` (theme 1.9) + `session.toggle.thinking` (`/thinking` exists as read-only detail) | PORT |
| 6d.2 | Reasoning expansion toggle: only via click, default collapsed by code | opencode `thinkingMode` KV (hide default), `nextThinkingMode` cycle | wire KV persistence + command | PORT |

---

## 7. Tool cards

NIMBL: `session.tsx` `ToolPartView` + `InlineTool`/`BlockTool` + `OutputPreview`. opencode: `routes/session/index.tsx` ToolPart + per-tool components.

| # | Tool | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|---|
| 7.1 | bash | `$ {command}` inline / BlockTool collapsible, 10-line preview | opencode `Shell`: title `# Running in {wd}`, running spinner `$ {command}`, 10-line collapse | match title format `# Running in {wd}` | PARTIAL |
| 7.2 | read | inline `→ Read {path}` | opencode `Read`: `↳ Loaded {path}` sub-line after run | port `↳ Loaded {path}` detail line | PORT |
| 7.3 | glob | inline `✱ Glob {pattern}` (no count) | opencode `Glob`: `` `Glob "{pattern}" in {path} ({count} match/es)` `` | port count + path | PORT |
| 7.4 | grep | inline `✱ Grep {query}` | opencode `Grep`: `` `Grep "{query}" ({n} match/es)` `` | port count | PORT |
| 7.5 | write | BlockTool `# Wrote {path}` with diff | opencode `Write`: `<line_number>` code block + Diagnostics; title `# Wrote {path}` | port line-number code + diagnostics | PORT |
| 7.6 | edit / apply_patch | BlockTool `# Wrote`/`← Edit`/`← Patched` with `<diff>` | opencode `Edit`/`ApplyPatch`: `← Edit {path}`; apply_patch per-file `# Deleted/# Created/# Moved a → b/# Patched`; `view = width>120?"split":"unified"` | port per-file apply_patch titles + view logic; NIMBL uses one merged diff | PORT |
| 7.7 | webfetch | inline `% Fetch {host}` | opencode `WebFetch {url}` | match title | PARTIAL |
| 7.8 | websearch | inline `Search web` | opencode `WebSearch`: icon `◈`, `({n} results)`, provider label | port icon + count | PORT |
| 7.9 | todowrite | BlockTool `# Todos` + OutputPreview | opencode `TodoWrite`: `# Todos` + `TodoItem` rows (parse output into structured todos) | port structured TodoItem list in tool card (sidebar already parses) | PORT |
| 7.10 | question | BlockTool `# Questions` + output | opencode `Question`: `# Questions` + parsed Q/A, `(no answer)` | port parsed Q/A | PORT |
| 7.11 | skill | inline `→ Loaded skill {name}` | opencode `Skill`: `Skill "{name}"` | match label | PARTIAL |
| 7.12 | delegate/task | BlockTool `# Child agent` / `# Running child agent` | opencode `Task`: icon ✓/│, `formatSubagentTitle` = `` `{Agent} Task{ (background)} — {desc}` ``, `↳` detail lines, `formatSubagentToolcalls` | port opencode Task card format | PORT |
| 7.13 | execute | not supported | opencode `Execute` (provider-executed tools) | N/A (no such tool in NIMBL) | N/A |
| 7.14 | generic | BlockTool `# {tool} {title}` 3-line preview | opencode `GenericTool` 3-line collapse, `showGenericToolOutput` toggle | port `session.toggle.generic_tool_output` | PORT |
| 7.15 | Diagnostics (parse errors) | absent | opencode `Diagnostics` `Error [{line}:{char}] {message}` (severity 1, slice 3) | port diagnostics rows | PORT |
| 7.16 | Tool hiding | NIMBL always shows completed tools | opencode `shouldHide` when `showDetails` false && completed | port `session.toggle.actions` (`tool_details_visibility`, default true) | PORT |
| 7.17 | Denied styling | NIMBL strikethrough via `TextAttributes.STRIKETHROUGH` when `rejected` | opencode detects "rejected permission"/"QuestionRejectedError"/"specified a rule"/"user dismissed" → strikethrough + `~ ` pending prefix | match denied detection strings | PORT |
| 7.18 | Pending prefix `~ ` | NIMBL spinner text has no `~` | opencode pending line = `` `~ {pending}` `` (2-col icon + `~ ` prefix) | add `~ ` prefix + 2-col icon width | PORT |
| 7.19 | Tool icons | read→, glob/grep ✱, write←, edit←, patch %, websearch missing, task ✓/│, skill→ | opencode same + `◈` websearch, `⚙` generic, `⟳` doom_loop | align icons | PARTIAL |

---

## 8. Permission prompt

NIMBL: `docked-prompts.tsx` `PermissionPrompt` (132 lines). opencode: `routes/session/permission.tsx` (718 lines).

| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 8.1 | Header `△ Permission required` + title + detail + optional diff | opencode `Permission required` + per-tool `info()` `{icon,title,body}` (edit diff, read path, bash `$ cmd`, glob/grep pattern, task `◉ desc`, webfetch URL, websearch query, external_directory patterns, doom_loop) | port per-tool info builders + icons | PORT |
| 8.2 | Buttons: `Allow once` / `Allow always` / `Reject` pills; hints `enter once / a always / esc reject` | opencode `Prompt` options `once/always/reject`, `escapeKey="reject"`, hint bar `⇆ select` / `enter confirm`, fullscreen toggle `permission.prompt.fullscreen` (ctrl+f) | port hint bar + fullscreen toggle | PORT |
| 8.3 | Always-allow confirmation stage: NIMBL saves directly | opencode 3-stage store: permission → always (patterns list "This will allow the following patterns until OpenCode is restarted") → reject (`Tell OpenCode what to do differently` textarea) | port always-stage pattern preview + reject-feedback textarea | PORT |
| 8.4 | Max height 15, left warning border | opencode `maxHeight: 15` + `border ["left"] borderColor warning` | 1:1 | OK |

---

## 9. Question prompt

NIMBL: `docked-prompts.tsx` `QuestionPrompt` (now ~120 lines with freeform). opencode: `routes/session/question.tsx` (514 lines).

| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 9.1 | Single question, options list + freeform textarea | opencode: multi-question tabs, multi-select (`[✓]`), custom "Type your own answer" inline editor, Review/Confirm tab | port multi-question + review/confirm flow | PORT |
| 9.2 | Keys: up/down, enter, esc | opencode: `left/h`, `right/l`, `tab/shift+tab` tab cycle, `1..9` answer pick, `up/k down/j`, `return`, `escape`; hint bar `⇆ tab · ↑↓ select · enter submit/toggle · esc dismiss` | port key set + hint bar | PORT |
| 9.3 | Option styling: number col + label, active bg backgroundElement | opencode: number col `tint(textMuted, secondary, 0.6)`, multi `[✓]`, single ` ✓` success, `(select all that apply)` suffix | port multi-select markers | PORT |

---

## 10. Dialogs (shared layer + each dialog)

### 10.0 Shared dialog layer
NIMBL: `dialogs.tsx` `DialogOverlay` + `SelectDialog`/`ConfirmDialog`/`TextPromptDialog`/`DetailDialog`/`DiffDialog`. opencode: `ui/dialog.tsx` + `ui/dialog-select.tsx`.

| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 10.0.1 | Overlay: full-screen, zIndex 3000, `paddingTop = h/4`, `RGBA(0,0,0,150)`, panel bg backgroundPanel, paddingTop 1; sizes medium 60 / large 88 / xlarge 116 | opencode identical | 1:1 | OK |
| 10.0.2 | Backdrop click-to-close with selection guard | opencode identical (`dismiss = !!selection`) | 1:1 | OK |
| 10.0.3 | Escape closes top dialog; Ctrl+C closes top dialog | opencode: escape + ctrl+c both close, `renderer.clearSelection()` first | port selection-clear before close | PARTIAL |
| 10.0.4 | Focus restore: NIMBL re-focuses prompt after close (custom) | opencode `refocus()` after 1ms with tree-liveness check | equivalent | OK |
| 10.0.5 | Selection copy: **no global copy-on-select** | opencode DialogProvider copies selection on mouse-up release, toast "Copied to clipboard" | port copy-on-select | PORT |
| 10.0.6 | No mode stack (`"modal"` push) | opencode `modeStack.push("modal")` while stack open | NIMBL gates key handlers manually | OK |

### 10.1 DialogSelect
| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 10.1.1 | Filter: substring/prefix `matches()`, no fuzzysort | opencode fuzzysort `["title","category"]` title×2 | port fuzzysort (or accept simpler) | PARTIAL |
| 10.1.2 | Category headers `theme.accent` bold, `paddingLeft 3` | opencode identical | 1:1 | OK |
| 10.1.3 | Current marker `●` | opencode `●` in primary/selected | 1:1 | OK |
| 10.1.4 | Row: bg `theme.primary` when active, padding left 3 (or 1 if current/gutter) | opencode same + `option.bg`, `option.margin`, `gutter()` JSX, title truncation `titleWidth ?? 61` | port gutter/margin/bg + truncation | PARTIAL |
| 10.1.5 | Details sub-rows `truncateMiddle(detail, min(76,width-12))` | opencode identical | 1:1 | OK |
| 10.1.6 | Footer actions: NIMBL `actions` array (ctrl keys) + footer hints | opencode `actions[]` with `side` left/right, `footerHints[]`, `tab/shift+tab` cycles focused action | port tab action-cycling + side + footerHints | PARTIAL |
| 10.1.7 | Empty state `No results found` | opencode same + `emptyView` prop | 1:1 (emptyView optional) | OK |
| 10.1.8 | Keys: up/down/pageup/pagedown/home/end/enter/escape | opencode + `ctrl+p`/`ctrl+n` aliases, tab/shift+tab action | port ctrl+p/n + action tab | PARTIAL |
| 10.1.9 | List height `min(rows, h/2 - 6)` | opencode identical | 1:1 | OK |
| 10.1.10 | Search input placeholder `Search`, `focusedBackgroundColor backgroundPanel`, cursor `primary` | opencode identical | 1:1 | OK |
| 10.1.11 | Mouse: hover follows only in mouse mode | opencode same | 1:1 | OK |
| 10.1.12 | `preserveSelection` + scroll restoration | opencode deep-equal re-seat + double-rAF scroll | port preserveSelection scroll restore | PARTIAL |

### 10.2 Session list dialog
NIMBL: `dialog="sessions"` (~1987). opencode: `component/dialog-session-list.tsx`.

| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 10.2.1 | Size: NIMBL uses dialog size "large" for sessions? (currently "large") | opencode `setSize("large")` | verify | OK |
| 10.2.2 | Categories: Pinned / Today / date | opencode Pinned / Today / date (orderByRecency) | 1:1 | OK |
| 10.2.3 | Search: NIMBL filters local options in `SelectDialog` | opencode debounced server search (`onFilter`, `skipFilter`) + local includes fallback | NIMBL local filter is fine | OK |
| 10.2.4 | Quick slots `1-9`: **absent** | opencode `session.quick_switch.1..9` + footer hint `switch 1-9` | optional port | PORT (optional) |
| 10.2.5 | Delete: two-stage `Press ctrl+d again to confirm` | opencode same + `DialogSessionDeleteFailed` recovery chooser for workspace sessions | port recovery chooser | PORT (optional) |
| 10.2.6 | Rename: NIMBL inline TextPromptDialog | opencode `DialogSessionRename` (DialogPrompt) | 1:1 | OK |
| 10.2.7 | Pin: NIMBL ctrl+f action | opencode `session.pin.toggle` ctrl+f | 1:1 | OK |
| 10.2.8 | Gutter: NIMBL none | opencode Spinner for busy/retry sessions + quick-slot number in accent | port working-session spinner gutter | PORT |

### 10.3 Model dialog
NIMBL: `dialog="model"` (~1830). opencode: `component/dialog-model.tsx`.

| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 10.3.1 | Sections: Favorites / Recent / provider categories (NIMBL groups by provider) | opencode Favorites / Recent / provider-sorted flat + "Popular providers" (first 6) when disconnected | port Popular-providers section | PORT |
| 10.3.2 | Variants: **absent** | opencode `DialogVariant` after select when variants exist; `variant_cycle` ctrl+t | N/A unless variants implemented | OK |
| 10.3.3 | Footer `Free` for free models (NIMBL `footer: model.free ? "Free"`) | opencode `"Free"` footer when opencode + cost 0 | 1:1 | OK |
| 10.3.4 | Actions: `ctrl+a` connect/provider, `ctrl+f` favorite | opencode same | 1:1 | OK |
| 10.3.5 | `current` marker + recents persistence | opencode `local.model` KV + recent model cycling | NIMBL has recentModels global config | OK |
| 10.3.6 | Model cycling keys F2/shift+F2 (`model_cycle_recent`) | NIMBL none | port `model.cycle_recent` F2/shift+F2 | PORT |

### 10.4 Provider dialog
NIMBL: `dialog="provider"` + `dialog="connect"` (~1855, ~2145). opencode: `component/dialog-provider.tsx`.

| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 10.4.1 | Categories: "Popular" (PROVIDER_PRIORITY) / "Providers"; descriptions "(Recommended)"/"(API key)"/"Low cost subscription for everyone" | opencode same priority + descriptions, plus `"Other"` custom provider row | port `Other`/custom provider row | PORT (optional) |
| 10.4.2 | Connect: single API-key TextPromptDialog | opencode: nested auth-method select, OAuth AutoMethod/CodeMethod, PromptsMethod | NIMBL API-key only (docs say OAuth out of scope) | OK |
| 10.4.3 | `✓` connected gutter | opencode `✓` success gutter when connected+onboarded | 1:1 | OK |
| 10.4.4 | opencode-zen/go copy text: "Go to https://opencode.ai/zen" / ".../go and enable OpenCode Go" | opencode identical phrasing | 1:1 | OK |

### 10.5 Theme dialog
NIMBL: `dialog="theme"` (~2038). opencode: `component/dialog-theme-list.tsx`.

| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 10.5.1 | Options: 3 (nimbl/opencode/mono) | opencode 34 themes | port opencode theme catalog as NIMBL presets (keep `nimbl` green default) | PARTIAL |
| 10.5.2 | Live preview: **none** (restart required) | opencode `onMove` live `theme.set`, cancel-rollback, filter preview | port live preview + rollback (needs reactive theme, see 1.10) | PORT |
| 10.5.3 | Current marker | opencode `current={initial}` | 1:1 | OK |

### 10.6 Skills dialog
NIMBL: `dialog="skills"` (~2050). opencode: `component/dialog-skill.tsx`.

| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 10.6.1 | NIMBL lists discovered skills w/ description+source detail | opencode `app.skills`, `setSize("large")`, padded titles, search placeholder `Search skills...`, empty/error view | port `setSize("large")` + error view | PARTIAL |

### 10.7 Status / debug dialogs
| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 10.7.1 | `/status` `/details` `/debug` render `DetailDialog` text lines | opencode `DialogStatus` (MCP/LSP/Formatters/Plugins sections) + `DialogDebug` (Version/Date/OS/Terminal/Session ID/Model + copy report) | NIMBL text-only; port structured status/debug dialogs | PORT |
| 10.7.2 | Debug copy: NIMBL none | opencode `return` copies debug info, toast "Debug info copied to clipboard", footer "Share this when reporting an issue." | port | PORT |

### 10.8 Other dialogs
| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 10.8.1 | ConfirmDialog: `cancel`/`confirm` pills, left/right/enter/escape | opencode identical | 1:1 | OK |
| 10.8.2 | Alert dialog: **NIMBL has no alert** (uses Detail/Confirm) | opencode `DialogAlert` (single `ok` pill) | port alert for error/upsell paths | PORT |
| 10.8.3 | Export options dialog: NIMBL simple 3-option select | opencode `DialogExportOptions` (filename + Include thinking/tool details/assistant metadata/Open without saving checkboxes, tab/space) | port checkbox options dialog | PORT |
| 10.8.4 | Help dialog: NIMBL `/help` = DetailDialog text | opencode `DialogHelp` ("Press {shortcut} to see all available actions...", ok button) | port DialogHelp | PORT |
| 10.8.5 | Stash dialog: NIMBL `/stash` `/pop` commands only | opencode `DialogStash` list w/ relative time, `~N lines` footer, ctrl+d delete | port DialogStash | PORT |
| 10.8.6 | Retry action dialog: **absent** | opencode `DialogRetryAction` (don't show again / action, Go upsell pulse) | optional | OK |
| 10.8.7 | Message actions: NIMBL has Revert/View changes/Trim/Copy/Fork/Edit and resend | opencode `DialogMessage`: Revert/Copy/Fork only | NIMBL superset — keep | **KEEP** (superset) |
| 10.8.8 | Timeline dialog: NIMBL user-message list + selects message actions | opencode `DialogTimeline` + `DialogForkFromTimeline` (onMove scrolls timeline live) | NIMBL lacks live scroll-on-move | PORT |

---

## 11. Sidebar

NIMBL: `sidebar.tsx` (300 lines). opencode: `routes/session/sidebar.tsx` + `feature-plugins/sidebar/*`.

| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 11.1 | Width 42, backgroundPanel, padding 1/1/2/2, scrollbox w/ scrollbar track bg/fg | opencode identical + `scrollAcceleration` | port scrollAcceleration | PARTIAL |
| 11.2 | Title block: session title bold | opencode title + sessionID (non-latest channel) + WorkspaceLabel + share URL | port WorkspaceLabel + share URL row | PARTIAL |
| 11.3 | Context section: `Context` header + `N tokens` + `% used` + `$ cost` | opencode `Context` + `{tokens} tokens` + `{percent}% used` + `{money.format(cost)} spent` | wording: opencode "spent", NIMBL "estimated provider cost" | PORT (wording) |
| 11.4 | Todo section: `Todo` + `[✓]/[•]/[ ]` rows | opencode `Todo` section, `TodoItem` identical glyphs/colors; hides when all completed | NIMBL shows empty-able? verify `showTodos` | PARTIAL |
| 11.5 | Modified Files section: `+n`/`-n` counts | opencode identical (truncateLeft 36-width budget) | 1:1 | OK |
| 11.6 | Footer: `path` + `• NIMBL` | opencode footer: Getting-started card (`⬖ Getting started ✕`, "OpenCode includes free models...", "Connect from 75+ providers...", `Connect provider /connect`) then dir:branch + `• Open Code {version}` | port Getting-started card (NIMBL-branded: "NIMBL includes free models...", `/provider`) | PORT |
| 11.7 | Sections expand/collapse `▼`/`▶` when >2 items | opencode identical | 1:1 | OK |
| 11.8 | MCP/LSP sections: **absent** (out of scope) | opencode MCP + LSP sections | skip (no MCP/LSP) | OK |

---

## 12. Subagent footer

NIMBL: `session.tsx` `subagentNavigation` bar (~800). opencode: `routes/session/subagent-footer.tsx`.

| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 12.1 | Label: NIMBL `Child agent {i}/{n} · {runState}` + Parent/Prev/Next | opencode: bold `{label}` (titlecase from `@\w+ subagent` regex or "Subagent") + `({index} of {total})` + `usage · cost` + Parent/Prev/Next buttons | port label regex + `(i of n)` + usage/cost + border styling (paddingTop 1, bottom 1, left 2, right 1, SplitBorder, borderColor border, bg backgroundPanel) | PORT |
| 12.2 | Buttons hover bg + shortcut hints | opencode Parent/Prev/Next with `useCommandShortcut` labels | port | PORT |

---

## 13. Home screen (KEEP) — reference notes only

NIMBL home (tui-opencode.tsx 1775–1814): logo (LOGO/LOGO_COMPACT), tagline "Token-efficient AI coding companion", subtitle "Learn more. Use fewer tokens.", SessionPrompt maxWidth 75, footer `directory` + `NIMBL`.
opencode home (routes/home.tsx): `home_logo` slot → `<Logo/>`, rotating prompt placeholders, `home_bottom` slot → Tips, `home_footer` slot → footer (dir:branch, MCP status, version).

- **KEEP** NIMBL home entirely. No porting required.
- Optional (not parity): add opencode-style rotating placeholders to the home prompt for polish.

---

## 14. Home footer / tips (reference — NIMBL KEEP)

opencode home footer (`feature-plugins/home/footer.tsx`): dir `:branch`, `⊙ {n} MCP`, `/status`, version.
opencode tips (`home/tips.tsx` + `tips-view.tsx`): 100+ tips with `{highlight}` markup, `● Tip` warning prefix, `tips.toggle` (`<leader>h`).
- NIMBL: KEEP its footer. Tips are NIMBL-flavored or skipped.

---

## 15. Toast

NIMBL: `toast.tsx` (43 lines). opencode: `ui/toast.tsx`.

| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 15.1 | Position absolute top:2 right:2, zIndex 2500, maxWidth min(60,width-6), padding 2/1, bg backgroundPanel, border left+right `theme[variant]`, SplitBorder | opencode identical | 1:1 | OK |
| 15.2 | Default duration 5000; single toast | opencode same + `error()` fallback `"An unknown error has occurred"` | port error fallback | PARTIAL |
| 15.3 | NIMBL also notifies NotificationCenter (in-app log) | opencode toast only + attention | keep NIMBL notification log as extension | **KEEP** |

---

## 16. Spinner

NIMBL: `spinner.tsx` (54 lines) — 10 braille frames, shared ticker, `<Spinner color children>`. opencode: `ui/spinner.ts` (368 lines) — Knight-Rider scanner (`createFrames` blocks/diamonds) + `component/spinner.tsx` braille fallback.

| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 16.1 | Braille frames `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` | opencode component/spinner uses the same braille set (`SPINNER_FRAMES` identical) | 1:1 with opencode's component spinner | OK |
| 16.2 | NIMBL spinner has no animations toggle | opencode `<Spinner>` falls back to `⋯ {children}` when `animations_enabled` false | port animations toggle (`app.toggle.animations`) | PORT |
| 16.3 | NIMBL uses shared global ticker (all spinners synced) | opencode each spinner animates independently | minor; acceptable | OK |

---

## 17. Notifications / attention / audio

NIMBL: `core/notifications.ts` NotificationCenter (in-app log, no OS/sound). opencode: `attention.ts` + `audio.ts` + `feature-plugins/system/notifications.ts`.

| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 17.1 | OS notifications: none | opencode `renderer.triggerNotification` when blurred, top-level sessions only; messages "Question needs input", "Permission needs input", "Session done", "Session error", "Session aborted", "Model stopped responding" | optional; port if release wants OS attention | PORT (optional) |
| 17.2 | Sound: none (settings.notifications.sound inert) | opencode sounds: default/question/permission/error/done/subagent_done → mp3 files, `sound_pack`, volume 0.4 default | optional; requires audio assets + OpenTUI Audio | PORT (optional) |
| 17.3 | `/notifications` detail dialog | opencode `feature-plugins/system/notifications.ts` event → attention only (no dialog) | NIMBL extension is fine | **KEEP** |

---

## 18. Keybindings (cross-cutting)

NIMBL: `settings.keybinds` = only `{ palette: ctrl+p, sessions: ctrl+l, agent: tab }` + hardcoded handlers (`matchesKeybind`, `useKeyboard`, `ctrlCAction`). opencode: full `@opentui/keymap` with leader `ctrl+x`, ~120 bindings, which-key, mode stacks.

| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 18.1 | Binding scope | opencode per-context (`app`, `app.global`, `session`, `session.global`, `prompt`, `dialog.select`, `dialog.prompt`, `prompt.autocomplete`, `input.*`) | NIMBL single global `useKeyboard` with manual checks | PORT full keymap layer (large) |
| 18.2 | Leader key / which-key | `leader ctrl+x`, `which-key` panel (ctrl+alt+k), `<leader>l/a/m/b/s/c/n/x/g/y/u/r/h/t` | NIMBL none | PORT (leader + which-key) |
| 18.3 | Missing bindings NIMBL should add to match opencode defaults | session.list `<leader>l` (NIMBL ctrl+l ok), new `<leader>n`, timeline `<leader>g`, compact `<leader>c`, rename ctrl+r, delete ctrl+d, pin ctrl+f, sidebar `<leader>b`, status `<leader>s`, export `<leader>x`, copy `<leader>y`, undo `<leader>u`, redo `<leader>r`, conceal `<leader>h`, model `<leader>m`, agent `<leader>a`, theme `<leader>t`, messages scroll set, input emacs set, model cycle f2/shift+f2, variant ctrl+t | adopt the opencode default set (NIMBL currently only 3 configurable) | PORT |
| 18.4 | Config-driven: NIMBL `settings.keybinds` object validated in `config-schema.ts` | opencode `tui.json` `keybinds` override schema (`KeybindOverrides`, `parse` rejects unknown) | NIMBL has conflict diagnostics already; expand to full command set | PORT |
| 18.5 | Ctrl+C: NIMBL `ctrlCAction` (copy/close/reject/abort/clear/exit) | opencode ctrl+c = clear input (focused) / close dialog / exit (app_exit: ctrl+c,ctrl+d,<leader>q) | NIMBL's priority logic is reasonable; align app_exit keys | PARTIAL |

---

## 19. Diff viewer (full-screen)

NIMBL: only in-dialog `DiffDialog` + inline `<diff>` in tool cards + `/diff` snapshot list. opencode: `feature-plugins/system/diff-viewer.tsx` (1077 lines) — full-screen route.

| # | NIMBL | opencode | Fix | Verdict |
|---|---|---|---|---|
| 19.1 | Full-screen diff route with file tree | NIMBL none | port `DiffViewer` route (`diff.open` `/diff`, mode git/branch/last-turn, file tree, hunk navigation `]/[`, next/prev file `n/p`, mark reviewed `m`, switch source `d`, toggle view `v`, single patch `s`, help `?`) | PORT (large, high value) |
| 19.2 | Reviewed-file plain-text rendering | NIMBL none | part of 19.1 | PORT |
| 19.3 | `/diff` currently = snapshot picker | opencode `/diff` = full viewer | re-point `/diff` to the full viewer once ported | PORT |

---

## 20. Misc text / labels audit

Every verbatim string NIMBL should adopt (from opencode) vs keep:

| # | Surface | NIMBL current | opencode reference | Verdict |
|---|---|---|---|---|
| 20.1 | Empty search | `No results found` | `No results found` | OK |
| 20.2 | Empty autocomplete | `No matching items` | `No matching items` | OK |
| 20.3 | Delete confirm | `Press ctrl+d again to confirm` | `Press {deleteHint()} again to confirm` | OK |
| 20.4 | Provider descriptions | `(Recommended)` opencode-zen; `(API key)`; `Low cost subscription for everyone` opencode-go | identical | OK |
| 20.5 | Model footer | `Free` | `Free` | OK |
| 20.6 | Compact toast | `Older turns archived into a structured summary.` | opencode `/compact` → session summarize | NIMBL wording fine |
| 20.7 | Interrupt hint | `esc interrupt` / `esc again to interrupt` | identical | OK |
| 20.8 | Prompt placeholder | `Ask anything...` | `Ask anything... "Fix a TODO in the codebase"` etc. | PORT |
| 20.9 | Export | NIMBL `nimbl-export-<ts>.md` | opencode `session-<id8>.md` | PORT (filename) |
| 20.10 | Share toasts | `Shared link copied: {url}` | `Share URL copied to clipboard!` | PORT (wording) |
| 20.11 | Session copy | NIMBL no `/copy` command | `session.copy` `/copy` → transcript to clipboard | PORT |
| 20.12 | Copy message | `Copied to clipboard.` | `Message copied to clipboard!` | PARTIAL |
| 20.13 | Getting started (sidebar footer) | `• NIMBL` | Getting-started card + `• Open Code {version}` | PORT (NIMBL-branded) |
| 20.14 | Help dialog | `/help` detail list | `Press {shortcut} to see all available actions and commands in any context.` + ok | PORT |
| 20.15 | Status/debug | detail lines | structured sections + copy report | PORT |

---

## 21. Prioritized work plan (release readiness)

**Phase A — visual parity (highest impact, low risk)**
1. §1.9 thinkingOpacity + §6d reasoning alpha/conceal
2. §6c single-markdown renderer + conceal toggle
3. §7 tool card details (Loaded path, glob/grep counts, websearch ◈, TodoItem list, Task card, apply_patch per-file titles, denied styling `~ `)
4. §10.0.5 copy-on-select, §15 toast error fallback, §16 animations toggle
5. §3.2 rotating placeholder, §3.8 newline bindings, §3.9 typed-quit
6. §18.3 adopt opencode default keybind set (at least messages scroll, session list, model/agent, undo/redo)

**Phase B — interaction parity (medium)**
7. §8 permission prompt 3-stage + per-tool info + fullscreen
8. §9 question prompt multi-question/review + key set
9. §10.2 session list quick slots + working-session gutter + delete recovery
10. §10.8 export options + help + alert + stash dialogs; timeline live scroll
11. §17 attention/sound (optional OS notifications)
12. §12 subagent footer opencode styling

**Phase C — large ports (schedule separately)**
13. §19 full-screen diff viewer
14. §18.1–18.2 keymap layer + leader/which-key
15. §1.10/§10.5 live theme switching + 34-theme catalog
16. §4.3/4.4/4.7 structured file parts + line ranges + extmarks
17. §10.3 model cycling F2, §10.7 structured status/debug

**Phase D — intentionally skipped / KEEP**
- Home screen, prompt modes bar, custom scrollbar, green brand tokens, NIMBL notification log, superset message actions, NIMBL toasts wording where distinct.

---

## 22. Verification checklist (acceptance per surface)
- `bun run typecheck`, `bun test`, `bun run build`, `NIMBL_TEST_RENDERER=1 bun dist/nimbl.js` all green after each phase.
- Render snapshots at 80×24, 120×35, 60×24 for every changed surface.
- Keyboard parity: run through the §18 default bindings list.
- String parity: grep NIMBL for each §20 opencode string.

---

*Reference READMEs: `opencode/README.md` (agents build/plan + `@general`, Tab to switch), `docs/OPENCODE_PARITY_AUDIT.md` (prior audit), `docs/BACKEND_STATUS.md` (backend contract).*

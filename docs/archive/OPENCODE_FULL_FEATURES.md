# OpenCode — Complete Feature Inventory

**Audit date:** 2026-08-14 (opencode is the reference; unchanged by the NIMBL parity pass)
**Audited revision:** `a85d8d23aa` (v1.18.5)
**Scope:** Every file in the opencode monorepo (`C:\Users\jerem\Documents\GITHUB\opencode`) — packages `opencode`, `tui`, `core`, `plugin`, `server`, `sdk`, `sdk-next`, `cli`, `llm`, `schema`, `protocol`, `session-ui`, `app`, `desktop`, `web`, `console`, plus scripts, docs, tests, and infrastructure. This document is the exhaustive "everything it has" reference: terminal UI details, colors, typography, animations, features, tooling, and architecture.

---

## Table of Contents

1. [Repository & Package Overview](#1-repository--package-overview)
2. [Stack & Build System](#2-stack--build-system)
3. [Terminal UI (TUI) — Complete](#3-terminal-ui-tui--complete)
4. [Theme & Color System](#4-theme--color-system)
5. [Typography, Glyphs & Icons](#5-typography-glyphs--icons)
6. [Animations & Spinners](#6-animations--spinners)
7. [Keybindings (full table)](#7-keybindings-full-table)
8. [Dialogs & Modals](#8-dialogs--modals)
9. [Permission System](#9-permission-system)
10. [Tools (every tool)](#10-tools-every-tool)
11. [Agent Runtime & Loop](#11-agent-runtime--loop)
12. [Sessions, Messages & Persistence](#12-sessions-messages--persistence)
13. [Providers & Models](#13-providers--models)
14. [Server & API](#14-server--api)
15. [Plugins](#15-plugins)
16. [MCP](#16-mcp)
17. [LSP & Formatters](#17-lsp--formatters)
18. [Skills](#18-skills)
19. [Auth & Accounts](#19-auth--accounts)
20. [Config System](#20-config-system)
21. [CLI Subcommands (every flag)](#21-cli-subcommands-every-flag)
22. [Mini Mode (`--mini`)](#22-mini-mode---mini)
23. [Share, Sync, Worktrees, Snapshot](#23-share-sync-worktrees-snapshot)
24. [Notifications, Attention & Audio](#24-notifications-attention--audio)
25. [Editors, Clipboard & Selection](#25-editors-clipboard--selection)
26. [Diff Viewer](#26-diff-viewer)
27. [Which-Key](#27-which-key)
28. [Crash Screen](#28-crash-screen)
29. [Environment Variables](#29-environment-variables)
30. [Documentation](#30-documentation)

---

## 1. Repository & Package Overview

- **Name:** opencode (`opencode-ai` published npm name)
- **License:** MIT
- **Version:** 1.18.5 (all versioned workspace packages)
- **Package manager:** bun@1.3.14; workspaces under `packages/*`, `packages/console/*`, `packages/stats/*`, `packages/sdk/js`, `packages/slack`
- **31 package directories** under `packages/`: `app`, `cli`, `client`, `codemode`, `console` (`app/core/support`), `containers`, `core`, `desktop`, `docs`, `effect-drizzle-sqlite`, `effect-sqlite-node`, `enterprise`, `function`, `http-recorder`, `httpapi-codegen`, `identity`, `llm`, `opencode`, `plugin`, `protocol`, `schema`, `script`, `sdk` (`sdk/js`), `sdk-next`, `server`, `session-ui`, `slack`, `stats` (`app/core/server`), `storybook`, `tui`, `ui`, `web`
- **Secondary CLI** package `@opencode-ai/cli` (binary `lildax`) — commands `$`, `api`, `debug agents`, `migrate`, `service {start,restart,status,stop,password}`, `serve`; daemon service
- **Infrastructure:** SST v4 (`sst.config.ts`), `infra/` (console, enterprise, lake, monitoring, secret, stage, stats), Nix builds (`flake.nix`), Docker (`containers/`), GitHub Actions (26 workflows), `.opencode/` repo-local config (own dogfooding: agents `triage`, `duplicate-pr`; commands ai-deps/changelog/commit/issues/learn/rmslop/spellcheck/translate; skills `effect`; plugins `tui-smoke`; custom tools `github-pr-search`, `github-triage`)
- **Install:** shell script (`curl https://opencode.ai/install | bash`), installs to `$OPENCODE_INSTALL_DIR` → `$XDG_BIN_DIR` → `$HOME/bin` → `$HOME/.opencode/bin`
- **Platform binaries:** `opencode-<platform>-<arch>[-baseline|-musl]` dispatched by the npm `bin/opencode` Node shim (AVX2/musl detection at runtime)
- **READMEs:** 22 translations (`ar,bn,br,bs,da,de,es,fr,gr,it,ja,ko,no,pl,ru,th,tr,uk,vi,zh,zht`)

## 2. Stack & Build System

- **Language/runtime:** TypeScript on Bun (Node-compatible), ESM
- **TUI framework:** OpenTUI (`@opentui/core`, `@opentui/solid`, `@opentui/keymap`) + **SolidJS** (reactive JSX); `opentui-spinner`
- **AI SDK:** `ai` (Vercel AI SDK v5) + per-provider `@ai-sdk/*` packages
- **Effect:** Effect 4 for services/effects/streams, `effect/Schema` for all wire types
- **DB:** Drizzle + Effect SQLite (`@opencode-ai/effect-drizzle-sqlite`, `@opencode-ai/effect-sqlite-node`); `#db` platform-specific binding (bun vs node)
- **Parser:** yargs v18 (CLI); `@clack/prompts` (interactive prompts); `web-tree-sitter` + `tree-sitter-{bash,powershell}` (shell parsing), tree-sitter WASM (syntax highlight, 36 languages)
- **Other:** `fuzzysort` (fuzzy match), `remeda`, `turndown` (HTML→markdown), `@zip.js/zip.js`, `bonjour-service` (mDNS), `chokidar`/`@parcel/watcher`, `npm-package-arg`, `@octokit/rest`, `@agentclientprotocol/sdk` (ACP), `@modelcontextprotocol/sdk`, `open`, `xdg-basedir`, `ws`, `vscode-jsonrpc`, `vscode-languageserver-types`, `@silvia-odwyer/photon-node` (image resize WASM)
- **Build:** `bun` + `turbo`; `packages/opencode` custom bundler (`script/build.ts`) → per-platform binaries; typecheck `tsgo --noEmit` (`@typescript/native-preview`); lint `oxlint`; format `prettier` (semi:false, printWidth 120)
- **Tests:** `bun test` (30s timeout, `--only-failures`); Playwright for `@opencode-ai/app` e2e; `@opencode-ai/http-recorder` VCR cassettes; CLI help snapshot tests
- **Patched deps:** 16 `patchedDependencies` (solid-js, effect, @modelcontextprotocol/sdk, pacote, @ai-sdk/*, gcp-metadata, …); `trustedDependencies` (esbuild, node-pty, tree-sitter*, electron)

## 3. Terminal UI (TUI) — Complete

The TUI lives in `packages/tui/src` (`@opencode-ai/tui`) and is a full-screen SolidJS app rendered by an OpenTUI `CliRenderer`.

### 3.1 Renderer & bootstrap (`app.tsx`)
- `createCliRenderer` with `externalOutputMode: "passthrough"`, `targetFps: 60`, `gatherStats: false`, `exitOnCtrlC: false`, `useKittyKeyboard`, `autoFocus: false`, `openConsoleOnError: false`
- Mouse enabled by default (`config.mouse`), disabled via `OPENCODE_DISABLE_MOUSE`; right-mouse = copy selection (experimental); mouse-up = copy-on-select
- Console keybinding `Ctrl-Y` = copy selection
- `win32DisableProcessedInput()` on Windows
- Terminal window title: home → `"OpenCode"`; session → `"OC | <title>"` (truncated at 40); plugin route → `"OC | <plugin id>"`; toggle persisted in KV `terminal_title_enabled`
- Provider nesting: ExitProvider → EpilogueProvider → ErrorBoundary → TuiPaths → TuiTerminalEnvironment → TuiStartup → Clipboard → OpencodeKeymap → Args → KV → Toast → Route → TuiConfig → PluginRuntime → SDK → Permission → Project → Sync → Data → Theme → Local → PromptStash → Dialog → Frecency → PromptHistory → PromptRef → EditorContext → Location → App
- `OPENCODE_ROUTE` sets initial route; `OPENCODE_FAST_BOOT` skips startup gate; `TimeToFirstDraw` overlay via `OPENCODE_SHOW_TTFD`
- **StartupLoading** gate: delayed 500ms show, minimum 3s hold, `Spinner "Loading plugins..."` / `"Finishing startup..."` at bottom (zIndex 5000)

### 3.2 Routes
- **Home** (`routes/home.tsx`): centered column, **4-row block Logo**, prompt box (maxWidth from config `prompt.max_width`, default 75, `"auto"` → `max(75, floor(width*0.7))`), `home_footer` slot. Random placeholders: `["Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests"]` (shell mode: `ls -la`, `git status`, `pwd`). Auto-submits `--prompt`.
- **Home footer**: full-width bar — left: directory (abbreviated `~`, `:branch` suffix) + MCP status `⊙ <n> MCP` (colored) + `/status` hint; right: app version.
- **Home tips** (`feature-plugins/home/tips.tsx`): `● Tip ` (warning) + highlighted text, ~100 entries, hidden via `tips_hidden` KV. Tips cover: `@file` attach, `!` shell mode, `/undo`/`/redo`, `/share`, image drag/drop, `/editor`, `/init`, `/models`, `/themes` (themeCount built-ins), `/new`, `/sessions` + pin, quick-switch 1-9, `/compact`, `/export`, copy-last-message, palette, `/connect` (75+ providers), leader key, `f2` recent models, sidebar, page keys, interrupt, Plan agent, `@agent`, parent/child nav, config tips (opencode.json, tui.json, keybinds, mcp, `.md` commands, `$ARGUMENTS`/`$1`/`$2`, backticks shell, agents, permission patterns `"git *": "allow"` / `"rm -rf *": "deny"` / `"git push": "ask"`, formatters, LSP, `.ts` tools/plugins, `opencode run`, `--continue`, `-f file.ts`, `--format json`, `serve`, `--attach`, `upgrade`, `auth list`, `agent create`, GitHub `/opencode` `/oc`, themes system/custom/0-255, `{env:}`/`{file:}` config, instructions, temperature, steps, tool toggles, `share: auto/disabled`, `/unshare`, `doom_loop`, `external_directory`, `debug config`, `--print-logs`, `/timeline`, conceal, `/status`, scroll_acceleration, Docker `ghcr.io/anomalyco/opencode`, OpenCode Zen, AGENTS.md, `/review`, `/help`, `/rename`; platform-specific (undo tip on Windows, terminal suspend elsewhere)
- **Session** (`routes/session/index.tsx`): row `[main column] + [sidebar]`. Main: `scrollbox` (sticky bottom, `stickyScroll`, `scrollAcceleration`), then footer area: PermissionPrompt → QuestionPrompt → SubagentFooter → Prompt → Toast.
  - Sidebar width **42**; `wide` = width > 120; `sidebarVisible` if open or `sidebar==="auto" && wide`; overlay mode with translucent backdrop `RGBA(0,0,0,70)` (≈28% black)
  - KV toggles: `timestamps`, `tool_details_visibility`, `assistant_metadata_visibility`, `scrollbar_visible`, `diff_wrap_mode` ("word"/"none"), `animations_enabled`, `generic_tool_output_visibility`, `file_context_enabled`, `paste_summary_enabled`, `session_directory_filter_enabled`
  - **User message**: left border in **agent color** (`SplitBorder`), hover → `backgroundElement`, click → `DialogMessage` (Revert/Copy/Fork). File chips: ` File ` / ` Directory ` pill (bg secondary) + filename pill; QUEUED badge; timestamp (today → `HH:MM`, else date)
  - **Compaction divider**: `border=["top"]`, `title=" Compaction "`, borderColor `borderActive`
  - **Assistant message metadata footer** (last/final/interrupted): `▣ ` (agent color) + mode title-case + ` · <model>` muted + ` · <duration>` (e.g. `5.2s`, `1m 30s`) + ` · interrupted` muted
  - **Error box**: left border error, message muted
  - **Subagent hint**: `[shortcut] view subagents` + `[shortcut] background`

### 3.3 Message parts (`PART_MAPPING`)
- **Reasoning part**: `Thinking: <summary-title>` + spinner (warning at `thinkingOpacity` alpha) while streaming; done → `Thought: <title>` with `+`/`-` toggles; `<summary body>` rendered as markdown via `generateSubtleSyntax` (alpha = thinkingOpacity); `[REDACTED]` OpenRouter placeholder stripped
- **Text part**: `<markdown>` streaming, grid tables, conceal support, fg markdownText bg background
- **Tool part** dispatch: bash, glob, read, grep, webfetch, websearch, write, edit, task, execute, apply_patch, todowrite, question, skill, generic
  - **InlineTool**: icon + text; pending `~ <pending>`; spinner variants; strikethrough for denied; error expansion on click
  - **BlockTool**: left border (`┃`), backgroundPanel (hover backgroundMenu), title `# ...` muted + spinner while pending; diff/code content
  - **Shell**: block `# Running in <workdir>` + `$ <command>` + output (collapsed to 10 lines, `Click to expand/collapse`)
  - **Read**: `→ Read <path>`; `↳ Loaded <path>` muted
  - **Write**: `← Write <path>`; code with line numbers; `Diagnostics` `Error [line:col] message` (max 3)
  - **Edit/ApplyPatch**: full `<diff>` view (split when width>120), `← Edit <path>`, `← Patched <file>`, `# Created/Deleted/Moved`
  - **Task/subagent**: `│`/`✓`; `Agent Task — description`, `↳ <Tool> <title>`, `↳ Retrying (attempt N) · msg`, `↳ N toolcalls`, `↳ 3 toolcalls · 1m 2s`
  - **Todo**: `# Todos` block with TodoItems
  - **Question**: `# Questions` block Q (muted) / A (text)
- **Revert/undo banner**: left-border panel, `N message reverted` + `[redo shortcut] or /redo to restore`, lists reverted diff files with `+additions`/`-deletions`, click = confirm-redo

### 3.4 Markdown / Code / Diff / Images rendering
- **Markdown**: built-in OpenTUI `markdown` renderable, `internalBlockMode="top-level"`, grid tables, streaming
- **Code**: OpenTUI `code` renderable with tree-sitter WASM parsers fetched at runtime — **36 languages** (python/rust/go/cpp/csharp/bash/c/java/kotlin/ruby/php/scala/html/vue/hcl/json/yaml/haskell/css/julia/lua/ocaml/clojure/swift/toml/nix/diff/elixir/fsharp/r/make/vim/xml/agda); markdown/javascript/typescript use built-in parsers; `line_number` gutter minWidth 3
- **Diff**: OpenTUI `diff` renderable, split/unified, line numbers, full diff palette
- **Images in terminal**: not inline pixels — `[Image N]` / `[PDF N]` extmarks; copy-on-select via mouse drag; Ctrl-Y copy
- **Concealment**: `<leader>h` collapses code blocks to single line while streaming

### 3.5 Prompt composer (`component/prompt/index.tsx`)
- Textarea syntax-highlighted, minHeight 1, maxHeight `max(6, height/3)`, placeholder muted
- Left `SplitBorder` with `bottomLeft: "╹"`; border color = highlight() (leader→border; shell→primary; else agent color, alpha-fade-in); bottom edge `▀` half-block row
- **Left metadata row**: agent name (agent color) / `Shell`, `auto` badge, `· model` + provider, variant (warning bold); fade-in animation
- **Mode switch**: leading `!` at cursor 0 → shell mode (esc/backspace at col 0 to leave)
- **Extmarks**: `extmark.paste` (warning bg), `extmark.file` (warning bold fg), `extmark.agent` (secondary bold fg); paste ≥3 lines or >150 chars → `[Pasted ~N lines]` (KV `paste_summary_enabled`); images → `[Image N]`, PDFs → `[PDF N]`, SVG → `[SVG: name]`; editor selection context → `<system-reminder>`
- **History**: Up/Down cycles JSONL prompt history (max 50, deduped; draft stashed on first up)
- **Stash**: save/pop/list prompt drafts (JSONL, max 50), delete via ctrl+d
- **Editor integration**: `/editor` or `<leader>e` opens `$EDITOR`; re-aligns extmarks
- **Status line** (bottom row): left = directory (or workspace notice, `Creating worktree...`, move progress spinner, `(new working copy)`); right = editor-file context, `N tokens · $cost`, or `[agent shortcut] agents`, `[palette shortcut] commands`
- **Running status**: Knight-Rider spinner (40ms, agent color, blocks) + `esc interrupt` (two-press armed); retry messages `[retrying in Xs attempt #N]` with countdown, `(click to expand)`, gemini-quota special text "gemini is way too hot right now"; animations disabled → static `[⋯]`
- **Exit words**: `exit`, `quit`, `:q` submits quit
- **Slash commands**: submitted as `session.command` (first-line command + multi-line args preserved)

### 3.6 Autocomplete (`component/prompt/autocomplete.tsx`)
- Trigger `/` at word start (slash) or `@` (file/agent/MCP-resource/reference); positioned absolute above anchor (zIndex 100), SplitBorder, backgroundMenu scrollbox, max height 10; selected row bg `primary`; Tab completes (directory → `@dir/`), arrows/ctrl+p/n, Enter select, Esc hide
- Files from SDK `v2.fs.find` (limit 20) with **frecency** weighting; `#line` ranges parsed; MCP resources listed; skills excluded from server command list (browsed via `/skills`)

## 4. Theme & Color System

### 4.1 Token set (`theme/index.ts`)
`primary, secondary, accent, error, warning, success, info, text, textMuted, selectedListItemText, background, backgroundPanel, backgroundElement, backgroundMenu, border, borderActive, borderSubtle`; diff: `diffAdded, diffRemoved, diffContext, diffHunkHeader, diffHighlightAdded, diffHighlightRemoved, diffAddedBg, diffRemovedBg, diffContextBg, diffLineNumber, diffAddedLineNumberBg, diffRemovedLineNumberBg`; markdown: `markdownText, markdownHeading, markdownLink, markdownLinkText, markdownCode, markdownBlockQuote, markdownEmph, markdownStrong, markdownHorizontalRule, markdownListItem, markdownListEnumeration, markdownImage, markdownImageText, markdownCodeBlock`; syntax: `syntaxComment, syntaxKeyword, syntaxFunction, syntaxVariable, syntaxString, syntaxNumber, syntaxType, syntaxOperator, syntaxPunctuation`; `thinkingOpacity` (default 0.6)

### 4.2 Theme JSON schema
- `defs` (named refs) + `theme` keys with dark/light variants, hex, or numeric ANSI 0–255
- `resolveTheme(theme, mode)`: circular-ref detection; `transparent`/`none` → `RGBA(0,0,0,0)`; ANSI via `ansiToRgba` (0-15 table, 6×6×6 cube, grayscale ramp)
- `selectedForeground(theme, bg)`: explicit token; else luminance (`0.299r+0.587g+0.114b`) → black/white; else background
- `tint(base, overlay, alpha)`
- `generateSystem(colors, mode)`: builds theme from **terminal palette** (respects transparency); 12-step gray scale from bg luminance (factor 0.4)
- `generateSyntax(theme)` / `generateSubtleSyntax`: ~60 TextMate-style scope rules — comments italic, keywords italic, type bold+italic, headings bold (H1 bold+underline), links underline, checked lists success/unchecked muted, diff.plus/minus bg, `.builtin` error, `extmark.*` specials

### 4.3 Built-in themes (35)
`aura, ayu, catppuccin, catppuccin-frappe, catppuccin-macchiato, cobalt2, cursor, dracula, everforest, flexoki, github, gruvbox, kanagawa, material, matrix, mercury, monokai, nightowl, nord, one-dark, osaka-jade, opencode, orng, lucent-orng, palenight, rosepine, solarized, synthwave84, tokyonight, vesper, vercel, zenburn, carbonfox`

### 4.4 Default "opencode" theme (dark)
bg `#0a0a0a`, panel `#141414`, element `#1e1e1e`, border `#484848`, borderActive `#606060`, text `#eeeeee`, muted `#808080`, primary `#fab283` (peach), secondary `#5c9cf5`, accent `#9d7cd8`, error `#e06c75`, warning `#f5a742`, success `#7fd88f`, info `#56b6c2`; diffAdded `#4fd6be`, diffRemoved `#c53b53`, diffHighlightAdded `#b8db87`, diffHighlightRemoved `#e26a75`, diffAddedBg `#20303b`, diffRemovedBg `#37222c`. Light: bg `#ffffff`, panel `#fafafa`, element `#f5f5f5`, text `#1a1a1a`, muted `#8a8a8a`, primary `#3b7dd8`, secondary `#7b5bb6`, accent `#d68c27`, error `#d1383d`, success `#3d9a57`, diffRemoved `#c53b53`

### 4.5 Theme runtime
- Detects terminal mode via palette, `theme_mode_lock`/`theme_mode` KV, OSC 11 `?997;1n/2n` responses, SIGUSR2, refresh delays `[250, 1000]`
- `discoverThemes` globs `themes/*.json` (config dir + every ancestor `.opencode/`); plugin themes via `addTheme`/`upsertTheme`; `system` theme generated on demand
- Priority: defaults < plugin < custom < generated system

## 5. Typography, Glyphs & Icons

- `△` (permission/question), `▣` (assistant/turn summary), `┃`/`╹`/`▀`/`█` (borders & logo half-blocks), `●` (current/session/workspace/LSP dots), `•` (status bullets), `✓`/`✗`/`○`/`◌`/`◉`/`⊙`/`⟳`/`↳`/`→`/`←`/``/`⇆`/`↑↓`/`▼`/``/`▌`/`│`, ``/`✱`/`%`/`◈`/`$`/`#`, `~` (pending tools), `…`/`⋯`, `⬥ ◆ ⬩ ⬪ · ■ ⬝` (Knight-Rider), `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` (braille spinner), `▄ ▀` (logo shadows), `⬖` (getting-started), `✕` (dismiss), `+`/`-` (diff signs), `∷`/`├ ┤ ┬ ┴` (panel separators), `[x]`/`[ ]` (checkboxes), `[✓]`/`[•]`/`[ ]` (todos), `·` (separators)
- **Bold** via `TextAttributes.BOLD`; **italic** via syntax styles; **strikethrough** via `TextAttributes.STRIKETHROUGH`
- **CLI wordmark** (4 rows, block glyphs `█▀▀█ █▀▀█ …`), dim fg 90, shadow fg 235; non-TTY renders plain
- **Bold/underline** combos: H1 headings bold+underline; strong/emph/italic map in syntax
- Faint/dim (ANSI 90) used for reasoning and muted metadata

## 6. Animations & Spinners

- **Braille spinner** (`component/spinner.tsx`): `["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]`, 80ms, default color textMuted; disabled → static `⋯ `
- **Knight-Rider scanner** (`ui/spinner.ts`): `createFrames` width 8; `diamonds` style (`⬥ ◆ ⬩ ⬪`, `·` inactive) or `blocks` (`■`/`⬝`); bidirectional motion with hold frames (start 30, end 9); trail gradient `0.65^(i-1)` decay; lead alpha 1, glare 0.9/brightness 1.15; inactive factor 0.2; used for running prompt indicator (40ms, agent color) and mini footer
- **Go upsell `BgPulse`**: custom FrameBufferRenderable, caps FPS to 30; GO logo with 3 radial pulse rings (period 4600ms, width 3.8, tail 9.5, amplitude 0.55, ease-in-out, `^2.3` falloff, breathing 0.05), logo shimmer toward white/primary; 138-frame cache
- **Fade-ins** `createFadeIn` for agent/model/variant metadata alpha
- **Startup loading** spinner, **theme live-preview** on move in DialogThemeList

## 7. Keybindings (full table)

### Global / app
| command | keys |
|---|---|
| leader | `ctrl+x` |
| app_exit | `ctrl+c, ctrl+d, <leader>q` |
| command_list | `ctrl+p` |
| theme_list | `<leader>t` |
| sidebar_toggle | `<leader>b` |
| status_view | `<leader>s` |
| editor_open | `<leader>e` |
| terminal_suspend | `ctrl+z` |
| tips_toggle | `<leader>h` |

### Sessions
| command | keys |
|---|---|
| session_export | `<leader>x` |
| session_new | `<leader>n` |
| session_list | `<leader>l` |
| session_timeline | `<leader>g` |
| session_rename | `ctrl+r` |
| session_delete | `ctrl+d` |
| session_interrupt | `escape` |
| session_background | `ctrl+b` |
| session_compact | `<leader>c` |
| session_queued_prompts | `<leader>q` |
| session_child_cycle / reverse | `right` / `left` |
| session_parent | `up` |
| session_pin_toggle | `ctrl+f` |
| session_quick_switch_1..9 | `<leader>1`…`<leader>9` |
| messages_page_up/down | `pageup,pagedown, ctrl+alt+b/f` |
| messages_line_up/down | `ctrl+alt+y/e` |
| messages_half_page_up/down | `ctrl+alt+u/d` |
| messages_first/last | `ctrl+g, home` / `ctrl+alt+g, end` |
| messages_copy | `<leader>y` |
| messages_undo/redo | `<leader>u` / `<leader>r` |
| messages_toggle_conceal | `<leader>h` |

### Models/agents/providers
| command | keys |
|---|---|
| model_list | `<leader>m` |
| model_cycle_recent / reverse | `f2` / `shift+f2` |
| model_provider_list | `ctrl+a` (in model dialog) |
| model_favorite_toggle | `ctrl+f` |
| agent_list | `<leader>a` |
| agent_cycle / reverse | `tab` / `shift+tab` |
| variant_cycle | `ctrl+t` |

### Input (Emacs-ish)
| command | keys |
|---|---|
| input_submit | `return` |
| input_newline | `shift+return, ctrl+return, alt+return, ctrl+j` |
| input_clear | `ctrl+c` |
| input_paste | `ctrl+v` |
| input_move_left/right/up/down | `left,ctrl+b` / `right,ctrl+f` / `up` / `down` |
| input_line_home/end | `ctrl+a` / `ctrl+e` |
| input_visual_line_home/end | `alt+a` / `alt+e` |
| input_buffer_home/end | `home`/`end` |
| input_delete_line | `ctrl+shift+d` |
| input_delete_to_line_end/start | `ctrl+k` / `ctrl+u` |
| input_delete | `ctrl+d, delete` |
| input_undo/redo | `ctrl+-, super+z` / `ctrl+., super+shift+z` |
| input_word_forward/backward | `alt+f,alt+right,ctrl+right` / `alt+b,alt+left,ctrl+left` |
| input_delete_word_forward/backward | `alt+d` / `ctrl+w, ctrl+backspace` |
| input_select_all | `super+a` |
| history_previous/next | `up` / `down` |

### Dialogs / autocomplete / permission
| command | keys |
|---|---|
| dialog.select prev/next/page_up/page_down/home/end/submit | `up,ctrl+p` / `down,ctrl+n` / `pageup` / `pagedown` / `home` / `end` / `return` |
| dialog.prompt.submit | `return` |
| dialog.mcp.toggle | `space` |
| dialog.move_session new/delete/refresh | `ctrl+m` / `ctrl+d` / `ctrl+r` |
| prompt.autocomplete prev/next/hide/select/complete | `up,ctrl+p` / `down,ctrl+n` / `escape` / `return` / `tab` |
| permission.prompt.fullscreen | `ctrl+f` |
| stash_delete | `ctrl+d` |
| plugins.toggle | `space` |
| dialog.plugins.install | `shift+i` |

### Diff viewer
`diff_close`: `escape,q` · `diff_toggle`: `enter,space` · `diff_expand`: `right` · `diff_expand_all`: `E` · `diff_collapse`: `left` · `diff_switch_focus`: `tab` · `diff_next_hunk`: `]` · `diff_previous_hunk`: `[` · `diff_next_file`: `n` · `diff_previous_file`: `p` · `diff_toggle_file_tree`: `b` · `diff_single_patch`: `s` · `diff_switch_source`: `d` · `diff_toggle_view`: `v` · `diff_help`: `?`

### Which-key
`which_key_toggle`: `ctrl+alt+k` · layout: `ctrl+alt+shift+k` · pending: `ctrl+alt+shift+p` · group prev/next: `ctrl+alt+left/right` · scroll up/down: `ctrl+alt+up/down` · page: `ctrl+alt+pageup/pagedown` · home/end: `ctrl+alt+home/end`

## 8. Dialogs & Modals

- **Dialog shell** (`ui/dialog.tsx`): backdrop `RGBA(0,0,0,150)` (≈59% black), zIndex 3000, paddingTop height/4; widths medium 60 / large 88 / xlarge 116; click backdrop closes; stack semantics (clear/replace)
- **DialogSelect** (generic picker): bold title + muted `esc`; optional filter input (fuzzy, title weight 2× category); scrollbox with category headers (bold, accent); `●` current marker (primary); active row bg primary + selectedForeground; Tab/Shift-Tab cycles footer actions; mouse hover/move
- **DialogAgent**: primary agents, current highlighted, "native" descriptions
- **DialogModel**: sections **Favorites / Recent / Providers / Popular providers** (top 6 when not connected); `●` current; `(Favorite)`; `Free` footer; `-nano` disabled; actions `Connect provider` (`ctrl+a`) + `Favorite` (`ctrl+f`); sort release-date desc; chains into DialogVariant
- **DialogVariant**: flat, current highlighted, plus "Default"
- **DialogMcp**: rows server + status (`✓ Enabled`/`○ Disabled`/`⋯ Loading`); `space` toggles
- **DialogSessionList**: large; server-backed browse (100) + debounced search (150ms, 30 results); groups Pinned/Today/date; busy sessions spinner gutter; quick-switch number gutter; actions pin (`ctrl+f`), delete (`ctrl+d` two-press), rename (`ctrl+r`)
- **DialogThemeList**: live-preview on move
- **DialogSkill**: `/skills`, lists skills name-padded + description
- **DialogConsoleOrg**: groups by `email host`, categoryView email accent + host muted
- **DialogWorkspaceList**: `●` gutter, workspace type footer, delete two-press
- **DialogStash**: first-line preview (50 chars), relative time, `~N lines`, delete two-press
- **DialogMoveSession**: xlarge, project copies + subdirs, `new/delete/refresh` actions
- **DialogStatus**: bullet rows — MCP (colored), LSP, formatters, plugins; counts in headers
- **DialogDebug**: label-value rows (label padded 10), enter copies, `✓ copied`
- **Alert / Confirm / Prompt / ExportOptions / Help**: as documented in the NIMBL parity plan (ok/cancel chips, 3-row textarea, busy spinner "Working...")
- **RetryAction / Go-upsell**: `BgPulse` animated art + two buttons (`don't show again` / action)
- **WorkspaceUnavailable / WorkspaceFileChanges / SessionDeleteFailed**: two-step confirm + warp flows
- **Plugin manager**: list + install (`shift+i`), toggle (`space`)
- **Command palette**: DialogSelect titled "Commands", **Suggested** category, keybinding footers
- **Provider connect dialog**: sorted by PROVIDER_PRIORITY (opencode 0, opencode-go 1, openai 2, github-copilot 3, anthropic 4, google 5); categories Popular/Providers; OAuth flows (CodeMethod paste code / AutoMethod waiting); API key method; custom provider (validated id)

### 8.1 Permission modal (full detail)
Three-stage machine **permission → always → reject**:
- **Stage 1 "Permission required"**: header `△` + bold "Permission required"; icon+title per type; buttons Allow once / Allow always / Reject (selected = warning bg + contrast text); `left/right/h/l` cycle, `return` confirm, `escape` reject, `ctrl+f` fullscreen (absolute overlay); footer `[ctrl+f] fullscreen ⇆ select enter confirm`
- **Stage 2 "Always allow"**: Confirm/Cancel; "This will allow <permission> until OpenCode is restarted." or pattern list
- **Stage 3 "Reject"**: left border error; `△` error + "Reject permission"; textarea "Tell OpenCode what to do differently"; `enter` sends reject with message; `escape`/`ctrl+c`/`ctrl+d` cancel
- Mini footer version renders in 12-row footer (`PERMISSION_ROWS = 12`)

### 8.2 Question modal
- Tab bar (multi-question): per-question tabs + **Confirm** tab; active tab accent bg; `(select all that apply)` suffix for multiple; number gutter, active text secondary, multi `[✓]`/`[ ]` success; "Type your own answer" custom row → inline textarea; Confirm tab `Review` + per-question `header: answer` (`(not answered)` in error); footer `⇆ tab · ↑↓ select · enter submit/toggle/confirm · esc dismiss`; digits 1-9 answer; single question auto-submits
- Mini footer version: 14 rows (`QUESTION_ROWS = 14`)

## 9. Permission System

### 9.1 Schema
`Rule = {permission, pattern, action: "allow"|"deny"|"ask"}`; `Ruleset = Rule[]`; `Request = {id, sessionID, permission, patterns, metadata, always, tool?}`; `Reply = "once"|"always"|"reject"`; events `permission.asked`, `permission.replied`

### 9.2 Config permission keys
`read, edit, glob, grep, list, bash, task, external_directory, todowrite, question, webfetch, websearch, lsp, doom_loop, skill` + arbitrary rest; bare string normalizes to `{"*": value}`; key order preserved

### 9.3 Runtime
- `evaluate`: last matching `Wildcard.match` (permission + pattern), default ask; `fromConfig` expands `~/`/`$HOME`; `merge` = flat concat (later wins)
- **Wildcard**: backslashes → `/`; `*` → `.*`, `?` → `.`; trailing `" .*"` optional (so `"git checkout *"` matches `"git checkout"`); case-insensitive only on win32
- `ask` flow: deny → DeniedError; always-allow list (`approved`); reject cascades to all pending for session; `always` appends rules
- `disabled`/`visibleTools`: tool hidden iff last matching rule is `pattern:"*"` + `action:"deny"`; edit|write|apply_patch → `edit`; mcp resource tools → `read`

### 9.4 Default disposition (build agent)
`*` allow; `read` allow except `*.env`/`*.env.*` ask, `.env.example` allow; `edit/bash/glob/grep/webfetch/websearch/skill/task/todowrite/lsp` allow (via `*`); `external_directory` ask (except whitelisted truncation/tmp/skills/references); `doom_loop` ask; `question/plan_enter/plan_exit` deny (build re-allows question + plan_enter)

### 9.5 `external_directory` (the feature at the center of this audit)
- Default `{ "*": "ask", <whitelisted>: "allow" }`; whitelist = truncation glob (`<data>/tool-output/*`), `Global.Path.tmp/*`, skill dirs `/*`, reference dirs `/*`
- Enforced by `assertExternalDirectoryEffect` on read, write, edit, apply_patch, grep, glob, lsp, shell (FILES commands)
- Modal: `← Access external directory <dir>` + patterns list; Allow once/Always/Reject
- **Never inherits the top-level `"*"` allow rule** — separate permission name

## 10. Tools (every tool)

| Tool | id | Params | Permission | Notes |
|---|---|---|---|---|
| invalid | `invalid` | tool, error | none | AI SDK repair-handler target |
| read | `read` | filePath, offset?, limit? (2000) | read | miss heuristic w/ suggestions; directories list; images/PDFs → attachments; binary detection; 50KB/2000-char caps; LSP warm-up; instruction injection `<system-reminder>` |
| write | `write` | content, filePath (absolute) | edit | diff computed; BOM handled; formatter sync; LSP diagnostics appended |
| edit | `edit` | filePath, oldString, newString, replaceAll? | edit | per-file Semaphore; 9-level replacer cascade (Simple→LineTrimmed→BlockAnchor→WhitespaceNormalized→IndentationFlexible→EscapeNormalized→TrimmedBoundary→ContextAware→MultiOccurrence); disproportionate-match guard |
| apply_patch | `apply_patch` | patchText | edit (one ask) | `*** Begin/End Patch`, Add/Delete/Update/Move; 4-level matching; git apply |
| bash | `bash` | command, timeout?, workdir? | bash (+external_directory for FILES cmds) | tree-sitter parsed; streaming + ring buffer; timeout kill (120s default); `(no output)`; `<shell_metadata>`; shell.env hook |
| glob | `glob` | pattern, path? | glob | ripgrep, limit 100 |
| grep | `grep` | pattern, path?, include? | grep | ripgrep, limit 100, grouped rows |
| webfetch | `webfetch` | url, format?, timeout? | webfetch | Cloudflare challenge retry; 5MB cap; image→attachment; turndown markdown |
| websearch | `websearch` | query, numResults?, livecrawl?, type?, contextMaxCharacters? | websearch | exa/parallel MCP; year in description |
| task | `task` | description, prompt, subagent_type, task_id?, command?, background? | task | depth limit; subagent session; foreground/background |
| todowrite | `todowrite` | todos[] | todowrite | SQLite; JSON output |
| question | `question` | questions[] | (UI flow) | multiple questions; tab UI |
| skill | `skill` | name | skill | loads SKILL.md + files |
| lsp | `lsp` (experimental) | operation, filePath, line, character, query? | lsp | 9 LSP operations |
| execute | `execute` (experimental code-mode) | code | per-MCP-tool | confined interpreter over MCP tools |
| plan_exit | `plan_exit` (experimental) | {} | plan_exit | asks "switch to build agent?" |
| MCP resource tools | `list_mcp_resources`, `list_mcp_resource_templates`, `read_mcp_resource` | … | read (patterns `mcp:<server>:*`) | registered when server advertises resources |
| MCP tools | per-server | input schema | `<mcp tool key>` | converted via McpCatalog |

### Truncation service
`MAX_LINES 2000`, `MAX_BYTES 50KB` (config `tool_output.max_lines/max_bytes`); head/tail; full output written to `<data>/tool-output`; hint differs by task-tool availability; 7-day retention, hourly cleanup; `Truncate.GLOB` always-allowed

## 11. Agent Runtime & Loop

- **Built-in agents**: build (primary), plan (primary), general (subagent), explore (subagent), compaction (hidden), title (hidden), summary (hidden)
- **`runLoop(sessionID)`** steps: filterCompacted → latest → hasToolCalls → loop-exit guard → step/fork title+summary → model resolve → task pop (subtask/compaction) → auto-compaction on overflow → agent/steps → SessionReminders → assistant message → processor.create → SessionTools.resolve → structured output tool → plugin message transform → system parts (skills, environment, instructions, mcp, messages) → process → finish handling → compact/continue
- **Processor** (`processor.ts`): streams llm, `handleEvent` normalizes reasoning/tool/text/step events; **doom-loop detection** (3 identical tool calls → permission.ask `doom_loop`); `failToolCall`; `halt` on ContextOverflowError; `cleanup` finalizes
- **Retry** (`retry.ts`): initial 2000ms, ×2, cap 30s (or headers); never for ContextOverflow; FreeUsageLimitError → Go upsell; GoUsageLimitError → account rate-limit
- **Title generation**: hidden title agent, temp 0.5, strips `<think>`, 100-char cap
- **Session reminders**: plan/build-switch reminders, experimental plan-mode phases
- **System prompt**: agent.prompt or provider default (muse-spark→meta, gpt-4|o1|o3→beast, gpt/codex→codex/gpt, gemini→gemini, claude→anthropic, trinity→trinity, kimi→kimi, else default); environment block (`You are powered by the model named...`); instructions; mcp_instructions; skills; structured-output; MAX_STEPS_PROMPT
- **Compaction**: prune ≥20K tokens, protect 40K, tail 2 turns, tool-output 2K chars; compaction agent; `experimental.session.compacting` hook; prune clears old tool outputs (`[Old tool result content cleared]`)
- **Revert/undo**: git-based snapshots per project (`<data>/snapshot/<project>/<hash>`); track/patch/restore/diff; 7-day/2MB prune

## 12. Sessions, Messages & Persistence

- SQLite (Drizzle) session/message/part tables; `session.list/listGlobal` filters; fork deep-copies with `(fork #N)` titles
- `getUsage`: cache tokens subtracted from input; reasoning at output rate; Copilot `totalNanoAiu`; Anthropic/Bedrock/Venice/Vertex cache metadata
- `message-v2.ts`: `toModelMessagesEffect` (media injection for providers without tool-result media: anthropic/openai/bedrock-mantle/vertex-anthropic/gemini-3); `fromError` maps DOM/ECONNRESET/zlib/header/stream errors; pagination cursors (base64url `{id,time}`); `filterCompacted`; `latest`
- **Compaction parts**, **status map** (idle/busy/retry), **run-state Runner** (Idle/Running/Shell/ShellThenRun), **instruction loading** (AGENTS.md/CLAUDE.md/CONTEXT.md + config.instructions globs/URLs; `resolve()` per-read injection)
- **Todo** SQLite; **KV store** persists all user prefs

## 13. Providers & Models

- **models.dev** catalog: fetched from `https://models.dev/api.json`, cached `Global.Path.cache/models.json`, TTL 5 min, cross-process flock, atomic write; background refresh every 60 min; `OPENCODE_DISABLE_MODELS_FETCH`/`OPENCODE_MODELS_URL`/`OPENCODE_MODELS_PATH`
- Model schema: id, name, family, release_date, attachment, reasoning, temperature, tool_call, reasoning_options (effort/toggle/budget_tokens), interleaved, cost (input/output/cache read/write/tiers/context_over_200k), limit (context/input/output), modalities, experimental modes, status
- **Runtime `Provider.Info`**: id, name, source (env/config/custom/api), env[], key, options, models; `ListResult` (all + defaults + connected)
- **BUNDLED_PROVIDERS** SDK factory table: amazon-bedrock, amazon-bedrock/mantle, anthropic, azure, google, google-vertex, google-vertex/anthropic, openai, openai-compatible, openrouter, xai, mistral, groq, deepinfra, cerebras, cohere, gateway, togetherai, perplexity, vercel, alibaba, github-copilot, venice, gitlab + arbitrary npm fallback
- **Built-in provider custom loaders**: anthropic (beta headers), opencode (zero-cost public models), openai (responses), meta/xai (responses), github-copilot (responses/chat), azure (resourceName), azure-cognitive-services, amazon-bedrock (regions/credentials/cross-region prefixes), llmgateway, openrouter, nvidia, vercel, google-vertex, google-vertex-anthropic, sap-ai-core, zenmux, gitlab (duo workflow discovery), cloudflare-workers-ai, cloudflare-ai-gateway, cerebras, kilo, snowflake-cortex
- **Reasoning variants**: OpenAI effort gates by release date; Anthropic adaptive thinking; Gemini thinkingConfig; gateway; bedrock; openrouter; ai-gateway; github-copilot; mistral; groq; SAP modelParams; openai-compatible effort; minimax M3; GLM-5.2; Kimi/Moonshot adaptive; grok-3-mini
- **Prompt caching**: `cacheControl:{type:"ephemeral"}` on first 2 system + last 2 messages (anthropic/bedrock/copilot/openaiCompatible); `promptCacheKey`/`setCacheKey` for openai/azure/xai/mistral/venice/deepinfra/cerebras; gateway `caching:"auto"`
- **Model selection**: `defaultModel` precedence config.model → model.json state → first provider; `sort()` prioritizes gpt-5/claude-sonnet-4/big-pickle/gemini-3-pro; `getSmallModel` family priority gemini-flash/gpt-nano/claude-haiku

## 14. Server & API

- **Server** (`server/server.ts`): Effect HttpRouter; default port 4096; mDNS `opencode-<port>._http._tcp` (bonjour); graceful shutdown 1s; `AI_SDK_LOG_WARNINGS=false`
- **Route tree**: rootApiRoutes (`/global/*`, `/auth/:providerID`, `/log`), eventApiRoutes (`/event` SSE), ptyConnectApiRoutes (WebSocket `/pty/:ptyID/connect`), instanceApiRoutes (all `/session`, `/provider`, `/config`, `/file`, `/mcp`, `/permission`, `/question`, `/experimental/*`, `/project`, `/pty`, `/tui`, `/sync`, `/workspace`), serverRoutes (v2 `/api/*`), `/doc` (OpenAPI), `/*` (embedded web UI)
- **SSE**: first event `server.connected`; heartbeat every 10s; headers no-cache/nosniff
- **Auth**: `OPENCODE_SERVER_PASSWORD`/`OPENCODE_SERVER_USERNAME`; Basic auth; `www-authenticate`
- **Workspace routing**: proxies to remote workspace targets; sync fences (`x-opencode-sync`); 503 while syncing
- **v2 protocol API** (`packages/protocol` at `/api/*`): session (list w/ base64url cursors, create, active, get, agent/model switch, prompt, compact, wait, revert stage/clear/commit, context, history, event SSE, interrupt, message), plus health/location/agent/message/model/provider/integration/credential/permission/filesystem/command/skill/event/pty/question/reference/project-copy
- **SDK packages**: `@opencode-ai/sdk` (openapi-ts generated client classes Global/Project/Pty/Config/Tool/Instance/Path/Vcs/Session/Command/Oauth/Provider/Find/File/App/Auth/Mcp/Lsp/Formatter/Control/Tui/Event), `sdk-next` (embedded in-process `OpenCode.create()`), `@opencode-ai/client` (Effect HTTP client)

## 15. Plugins

- **Plugin API**: `Plugin = (input, options?) => Promise<Hooks>`; hooks: `dispose`, `event`, `config`, `tool` map, `auth`, `provider.models`, `chat.message`, `chat.params`, `chat.headers`, `experimental.chat.messages.transform`, `experimental.chat.system.transform`, `experimental.provider.small_model`, `experimental.session.compacting`, `experimental.compaction.autocontinue`, `experimental.text.complete`, `tool.definition`, `permission.ask`, `command.execute.before`, `tool.execute.before/after`, `shell.env`
- **Loading**: `plugin` config (npm/relative paths), `{plugin,plugins}/*.{ts,js}` auto-discovery in `.opencode` dirs; engine semver check (`engines.opencode`); `plugin create` install flow
- **Built-in server plugins (auth)**: OpenAI codex (OAuth loopback 1455 + device flow + WebSocket pool), GitHub Copilot (device flow + enterprise), GitLab, Poe, xAI Grok (loopback 56121 + device), DigitalOcean (implicit token 1456), Snowflake Cortex, Cloudflare (workers-ai + ai-gateway), Azure
- **TUI plugins**: `plugin/tui/` runtime (keymap modules, theme upsert, slots, command shims, PluginMeta tracking)
- `oc-themes` array in package.json for plugin themes

## 16. MCP

- `@modelcontextprotocol/sdk` client; capabilities: roots enabled, sampling/elicitation/tasks disabled
- Statuses: connected/disabled/failed/needs_auth/needs_client_registration
- Transports: stdio (`BUN_BE_BUN=1` for `opencode` command), StreamableHTTP, SSE fallback; connect timeout 30s
- Tool catalog `McpCatalog.convertTool`; tools keyed `sanitize(server)_sanitize(name)`; per-request timeout (config → experimental.mcp_timeout → undefined); `resetTimeoutOnProgress`
- Resources/resourceTemplates/prompts collected; keys escaped (`%`→`%25`, `:`→`%3A`)
- **OAuth**: RFC 7591 dynamic client registration; callback `http://127.0.0.1:19876/mcp/oauth/callback`; tokens in `mcp-auth.json` (0600, flock)

## 17. LSP & Formatters

- **LSP** (`lsp/`): client over stdio, ~37 built-in servers (typescript, vue, eslint, oxlint, biome, gopls, rust, clangd, svelte, astro, jdtls, kotlin-ls, yaml-ls, lua-ls, intelephense, prisma, dart, ocaml-lsp, bash, terraform, texlab, dockerfile, gleam, clojure-lsp, nixd, tinymist, haskell-language-server, julials, …); 9-operation tool; diagnostics after edit/write/apply_patch; workspace symbols; `lsp.status` endpoint
- **Formatters** (`format/`): gofmt, mix, prettier, oxfmt, biome, zig, clang-format, ktlint, ruff, air (R), uv, rubocop, standardrb, htmlbeautifier, dart, ocamlformat, terraform, latexindent, gleam, shfmt, nixfmt, rustfmt, pint, ormolu, cljfmt, dfmt — extension-mapped + `enabled(ctx)` binary discovery; `formatter.status` endpoint

## 18. Skills

- Built-in `customize-opencode` ships always
- Discovery sources: `~/.claude/skills/**`, `~/.agents/skills/**`, project `.claude`/`.agents` walked up, config dirs `{skill,skills}/**/SKILL.md`, `skills.paths` (`~/` expanded), `skills.urls` (remote discovery via `index.json`, version-gated atomic refresh)
- SKILL.md: YAML frontmatter `name` (required) + `description`; runtime `get/require/all/dirs/available(agent?)`; `fmt` renders `<available_skills>` XML or markdown

## 19. Auth & Accounts

- **Credential store** `auth.json` (0600): OAuth (refresh/access/expires/accountId/enterpriseUrl), ApiAuth (key/metadata), WellKnown; `OAUTH_DUMMY_KEY`; `OPENCODE_AUTH_CONTENT` override
- `opencode auth login` → browser/auto/code flows; account device-flow login (console/enterprise), account SQLite + token refresh (5-min eager), org-scoped remote config
- MCP OAuth (see §16)

## 20. Config System

- **Load order**: remote well-known configs → global config (`config.json`/`opencode.json`/`opencode.jsonc` + legacy TOML) → `OPENCODE_CONFIG` → project `opencode.json`/`opencode.jsonc` (walked up) → `.opencode` dirs → `OPENCODE_CONFIG_CONTENT` → console org config → managed config dir → macOS MDM plist
- **Top-level keys**: `$schema, shell, logLevel, server, command, skills, references, watcher, snapshot, plugin, share, autoshare, autoupdate, disabled_providers, enabled_providers, model, small_model, default_agent, subagent_depth, username, mode, agent, provider, mcp, formatter, lsp, instructions, layout, permission, tools, attachment, enterprise, tool_output, compaction, experimental` — unknown keys rejected
- **Config variables**: `{env:VAR}` and `{file:path}` substitution
- **TUI config** `tui.json`: `$schema, theme, keybinds, plugin, plugin_enabled, leader_timeout (2000), attention {enabled, notifications, sound, volume 0.4, sound_pack opencode.default, sounds}, prompt {max_height, max_width}, scroll_speed, scroll_acceleration, diff_style, mouse`; migration out of opencode.json
- **Provider config**: api/name/env/id/npm/whitelist/blacklist/options (apiKey, baseURL, enterpriseUrl, setCacheKey, timeout, headerTimeout, chunkTimeout)/models (per-model options/headers/variants)
- **Agent config**: model/variant/temperature/top_p/prompt/tools/disable/description/mode/hidden/options/color (hex or token name)/steps/permission; markdown agents `{agent,agents}/**/*.md` and modes `{mode,modes}/*.md`; commands `{command,commands}/**/*.md`

## 21. CLI Subcommands (every flag)

- **`opencode [project]`** (TUI): `--model/-m`, `--continue/-c`, `--session/-s`, `--fork`, `--prompt`, `--agent`, `--auto` (alias `--yolo`, `--dangerously-skip-permissions`), `--mini`, `--replay`/`--no-replay`, `--replay-limit`, `--demo`, network options
- **`run [message..]`**: `--command`, `--continue/-c`, `--session/-s`, `--fork`, `--share`, `--model/-m`, `--agent`, `--format default|json`, `--file/-f` (multi), `--title`, `--attach <url>`, `--password/-p`, `--username/-u`, `--dir`, `--port`, `--variant`, `--thinking`, `--mini`, `--interactive/-i`, `--replay`/`--no-replay`, `--replay-limit`, `--auto`, `--demo`; JSON events `tool_use|step_start|step_finish|text|reasoning|error`; non-interactive denies question/plan_enter/plan_exit
- **`serve`**: network options; prints listening URL
- **`web`**: serve + open browser; prints Local/Network access URLs
- **`acp`**: ACP NDJSON server over stdio (`--cwd`)
- **`attach <url>`**: attach TUI (`--dir`, `--continue`, `--session`, `--fork`, `--password`, `--username`, `--mini`, `--replay`/`--no-replay`, `--replay-limit`)
- **`agent`**: `create` (`--path`, `--description`, `--mode`, `--permissions/--tools`, `--model`) and `list`
- **`providers`** (alias `auth`): `list/ls`, `login [url]` (`--provider/-p`, `--method/-m`), `logout`
- **`console`**: `login [url]`, `logout`, `switch`, `orgs`, `open`
- **`mcp`**: `add [name]` (`--url`, `--env`, `--header`), `list/ls`, `auth [name]`/`auth list`, `logout`, `debug`
- **`models [provider]`**: `--verbose`, `--refresh`
- **`stats`**: `--days`, `--tools`, `--models`, `--project` (ASCII box-drawing OVERVIEW/COST & TOKENS/MODEL USAGE/TOOL USAGE)
- **`session`**: `list` (`--max-count/-n`, `--format table|json`), `delete <id>`
- **`export [sessionID]`**: `--sanitize`
- **`import <file>`**: file or share URL
- **`github`**: `install`, `run` (`--event`, `--token`)
- **`pr <number>`**
- **`plugin <module>`** (alias `plug`): `--global/-g`, `--force/-f`
- **`db [query]`**: `--format json|tsv`; `db path`
- **`upgrade [target]`**: `--method/-m` (curl/npm/pnpm/bun/brew/choco/scoop)
- **`uninstall`**: `--keep-config/-c`, `--keep-data/-d`, `--dry-run`, `--force/-f`
- **`generate`**: internal OpenAPI codegen
- **`debug`**: `config`, `lsp diagnostics|symbols|document-symbols`, `rg files|search`, `file search|read|list`, `scrap`, `skill`, `snapshot track|patch|diff`, `startup`, `agent`, `v2`, `info`, `paths`, `wait`
- **`completion`** (yargs built-in)
- Global: `--help/-h`, `--version/-v`, `--print-logs`, `--log-level`, `--pure`

## 22. Mini Mode (`--mini`)

- Split-footer renderer: `screenMode:"split-footer"`, footerHeight 4, capture-stdout, consoleMode disabled, useMouse false, targetFps 30/maxFps 60, kitty keyboard on win32
- Entry/exit splash into scrollback; `FOOTER_HEIGHT = 4`
- Footer: mode chip (`BUILD`/`SHELL`/`EXIT`), status spinner, usage `N tokens (N%) · $cost`, model + variant, context hints, command hints; panels: command menu (grouped), skill select, model select, variant select, queued-prompts menu, subagent tab bar + inspector
- Scrollback writer: entry kinds system/user/assistant/reasoning/tool/error; code blocks with line_number gutter; diff snapshots; task snapshots; todo snapshots (`[✓]`/`~[ ]`/`[•]`/`[ ]`); question snapshots; markdown streaming; turn summary `▣ agent · model · duration`

## 23. Share, Sync, Worktrees, Snapshot

- **Share**: `opencode run --share` / `/share`; legacy `opncd.ai` vs console `/api/shares`; queued delta sync (1000ms debounce) of session/message/part/session_diff/model; `SessionShareTable`
- **Sync**: event-sourcing (type/id/seq/aggregateID/data), per-aggregate monotonic seq, one-writer; replay/history/steal endpoints
- **Worktree**: `git worktree add --no-checkout -b opencode/<slug>` or `--detach`; list/remove/reset (fetch → reset --hard → clean -ffdx → submodule); root `data/worktree/<projectID>/`; `commands.start` + startCommand; `WorktreeEvent`
- **Snapshot**: per-project hidden git repo `data/snapshot/<projectID>/<hash>`; track/patch/restore/revert/diff; 2MB file limit; hourly `git gc --prune=7.days`; `config.snapshot` toggle
- **Background jobs**: registry with extend/wait/waitForPromotion/promote/cancel (subagent backgrounding)
- **Git wrapper**: safe defaults (core.autocrlf=false, fsmonitor=false, longpaths, symlinks, quotepath=false, --no-optional-locks); branch/default/merge-base; status/diff/stats/patch/patchAll/patchUntracked

## 24. Notifications, Attention & Audio

- OS notifications (focus-aware `when: "blurred"|"focused"|"always"`); sounds default `bip-bop-01`, question `bip-bop-03`, permission `staplebops-06`, error `nope-03`, done `bip-bop-01`, subagent_done `yup-01`; volume 0.4; sound packs (`opencode.default`); title cap 80 / message 240; ANSI stripped
- Notifications plugin: "Question needs input", "Permission needs input", "Session done", error mapping ("Session aborted", "Model stopped responding" SSE timeout, "Session error"); subagent suppression

## 25. Editors, Clipboard & Selection

- External `$EDITOR` with prompt content round-trip; zed-specific; clipboard write/read (OS-native, images via data URLs); copy-on-select; console Ctrl-Y

## 26. Diff Viewer

- Route `"diff"`, zIndex 2500; header `Diff <source>` + N files; sources: Working tree / Main branch / Last turn
- File tree 32 wide; focus files/patches via tab; patch pane per-file header `file +adds -dels`; split/unified (MIN_SPLIT_WIDTH 100); wrapMode char; single-patch mode (`s`); hunk jumping `[`/`]`; file jumping `n`/`p`; `m` mark reviewed; `E` expand all; `?` help; loading/empty/error states

## 27. Which-Key

- Disabled by default; toggle `ctrl+alt+k`; dock or overlay (zIndex 3500) layout; panel height 30% (clamped 8-16 rows); up to 3 columns; header tabs = binding groups (active tab primary bg); scroll indicators; "No reachable bindings"; footer `toggle <key> · <next-mode> <key>`

## 28. Crash Screen

- Full-screen fallback: headline bold `opencode crashed`; error panel with `title=" Error "`; buttons Copy report (`✓ Copied`)/Restart/Quit (min width 15, key letter beneath); stack trace panel with `bottomTitle=" ↑↓ scroll "`; auto-builds GitHub issue URL; keys up/down/pgup/pgdn/home/end scroll, `c` copy, `r` restart, `q` quit

## 29. Environment Variables

`OPENCODE_SERVER_PASSWORD`, `OPENCODE_SERVER_USERNAME`, `OPENCODE_CONFIG`, `OPENCODE_CONFIG_CONTENT`, `OPENCODE_CONFIG_DIR`, `OPENCODE_TUI_CONFIG`, `OPENCODE_DISABLE_PROJECT_CONFIG`, `OPENCODE_DISABLE_AUTOUPDATE`, `OPENCODE_ALWAYS_NOTIFY_UPDATE`, `OPENCODE_DISABLE_AUTOCOMPACT`, `OPENCODE_DISABLE_PRUNE`, `OPENCODE_DISABLE_MODELS_FETCH`, `OPENCODE_MODELS_URL`, `OPENCODE_MODELS_PATH`, `OPENCODE_DISABLE_MOUSE`, `OPENCODE_DISABLE_TERMINAL_TITLE`, `OPENCODE_SHOW_TTFD`, `OPENCODE_DISABLE_FFF` (win32), `OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT` (win32), `OPENCODE_DISABLE_SHARE`, `OPENCODE_DB`, `OPENCODE_WORKSPACE_ID`, `OPENCODE_EXPERIMENTAL_WORKSPACES`, `OPENCODE_EXPERIMENTAL_REFERENCES`, `OPENCODE_EXPERIMENTAL_FILEWATCHER`, `OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER`, `OPENCODE_EXPERIMENTAL_NATIVE_LLM`, `OPENCODE_EXPERIMENTAL_CODE_MODE`, `OPENCODE_EXPERIMENTAL_LSP_TOOL`, `OPENCODE_EXPERIMENTAL_PLAN_MODE`, `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`, `OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS`, `OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX`, `OPENCODE_ENABLE_EXA`, `OPENCODE_ENABLE_PARALLEL`, `OPENCODE_ENABLE_QUESTION_TOOL`, `OPENCODE_PURE`, `OPENCODE_PERMISSION`, `OPENCODE_PLUGIN_META_FILE`, `OPENCODE_CLIENT`, `OPENCODE_FAKE_VCS`, `OPENCODE_AUTO_HEAP_SNAPSHOT`, `OPENCODE_GIT_BASH_PATH`, `OPENCODE_AUTH_CONTENT`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, plus per-provider `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROK_API_KEY`, `MISTRAL_API_KEY`, `GITLAB_TOKEN`, `AWS_*`, `GOOGLE_VERTEX_*`, `AZURE_RESOURCE_NAME`, `AZURE_COGNITIVE_SERVICES_RESOURCE_NAME`, `CLOUDFLARE_ACCOUNT_ID/API_KEY/GATEWAY_ID/API_TOKEN/CF_AIG_TOKEN`, `SNOWFLAKE_ACCOUNT/CORTEX_TOKEN/CORTEX_PAT`, `AICORE_SERVICE_KEY/DEPLOYMENT_ID/RESOURCE_GROUP`

## 30. Documentation

- **`packages/web`** Astro/Starlight docs in 20 languages: `cli, config, rules, agents, commands, permissions, tools, custom-tools, skills, models, providers, network, plugins, mcp-servers, lsp, formatters, themes, keybinds, tui, server, web, share, sdk, go, github, gitlab, ide, enterprise, ecosystem, troubleshooting, windows-wsl, zen, references, policies, acp`
- `packages/docs` (Mintlify starter), `specs/` (project.md, tui-package.md, storage/, v2/ 10 design docs), `CONTRIBUTING.md`, `CONTEXT.md` (session runtime design), `STATS.md`, `SECURITY.md`

---

*End of opencode complete feature inventory. Generated by full-repository read of commit `a85d8d23aa`.*

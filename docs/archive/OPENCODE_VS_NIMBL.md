# OpenCode vs NIMBL — Complete Feature Comparison

**Generated:** 2026-08-14 (updated after the NIMBL parity feature pass)
**Sources:** `docs/OPENCODE_FULL_FEATURES.md` (opencode v1.18.5, commit `a85d8d23aa`) and `docs/NIMBL_FULL_FEATURES.md` (NIMBL after commit `16ac90b` + `external_directory` + parity feature pass).

This document compares the two projects line by line across every category. Legend:
-  **Match** — NIMBL has it with equivalent behavior
-  **Partial** — NIMBL has a version, with gaps noted
-  **Missing** — opencode has it, NIMBL does not
-  **NIMBL-only** — NIMBL has something opencode lacks

---

## 0. Executive Summary

| Dimension | opencode | NIMBL |
|---|---|---|
| Version audited | 1.18.5 (monorepo, 31 packages) | post-`16ac90b` + parity pass (single package) |
| TUI framework | OpenTUI + SolidJS | OpenTUI + SolidJS (same) |
| AI integration | Vercel AI SDK v5 + Effect-native runtime | Vercel AI SDK v7 |
| Persistence | SQLite (Drizzle) + git snapshots | JSON files with CAS + lock |
| Core philosophy | Code generator (agent platform, 75+ providers, plugins, MCP, LSP, server, SDK, desktop/web) | **Learning companion** — teaches, Socratic method, token-efficient |
| Permission model | Rule-based rulesets, `external_directory`, `doom_loop` ask | Rule-based settings, `external_directory`, `doom_loop` ask (both added) |
| Tools | 17 + MCP + LSP + code-mode | 14 |
| Slash commands | ~50 palette + `/init` `/review` + MCP + skills | ~50 |
| Keybindings | ~120 (Emacs leader-driven) | ~18 app-level + Emacs composer editing (added) |
| Themes | 35 + custom + system-generated | 3 real + live preview (was 1; added) |
| Benchmarks | None shipped in-repo (tests only) | **P3-01 retrieval benchmark with frozen corpus** |
| Pedagogy | None | **Learning state, Socratic prompts, concept tracking** |
| Edit robustness | 9-strategy replacer cascade | 7-strategy cascade (added) |
| Reject feedback | Feedback fed to model | Fed to model (added) |
| Remote skills | index.json discovery | index.json discovery (added) |
| Retry-after | Header-aware backoff | Header-aware backoff (added) |
| Model suggestions | "Did you mean" | "Did you mean" (added) |

---

## 1. Repository & Packaging

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| Monorepo | 31 packages | Single package |  |
| npm published | `opencode-ai` | private |  |
| Platform binaries | Per-OS/arch + baseline/musl | Bun bundle `dist/nimbl.js` |  NIMBL single binary; no per-platform builds |
| Install script | curl pipe installer | `bun install` + `bun link` |  |
| Desktop app | Electron (`packages/desktop`) | None |  |
| Web app | SolidJS web shell + docs site | None |  |
| Console/billing app | `packages/console` + stats site | None |  |
| Slack integration | `packages/slack` | None |  |
| VS Code extension | `sdks/vscode` | None (roadmap: IDE plugins) |  |
| GitHub action | `github/` action + `opencode github` | None |  |
| Enterprise deployment | `packages/enterprise` | None |  |
| Nix/Docker packaging | `flake.nix`, `containers/` | None |  |
| 22 translated READMEs | Yes | 1 (English) |  |
| `AGENTS.md` | Yes (short) | Yes (comprehensive, 17KB) |  NIMBL more detailed |
| Docs site (Starlight, 20 languages) | Yes | No (docs/ markdown) |  |

---

## 2. TUI Shell & Layout

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| Full-screen OpenTUI renderer, 60fps | Yes | Yes (same flags) |  |
| Mouse enabled by default | Yes (`config.mouse`) | Yes |  |
| Kitty keyboard protocol | Yes | No (uses `win32DisableProcessedInput`) |  |
| Home screen with block logo | Yes (4-row) | Yes (6-row `█`-glyph NIMBL) |  |
| Compact logo on small terminals | Yes | Yes (`LOGO_COMPACT`) |  |
| Home tagline/sub-tagline | Yes | Yes |  |
| Rotating prompt placeholders | Yes | Yes (10s cycle, randomized) |  |
| Home footer (dir + version) | Yes (dir + MCP count + `/status` + version) | Yes (dir + NIMBL) |  |
| Home tips line | Yes (~100 rotating tips) |  |  |
| Getting-started card | Yes (sidebar footer) |  |  |
| Session list / resume | Yes (dialog + quick-switch) | Yes (dialog + Ctrl+1-9) |  |
| Sidebar (42 wide) | Yes | Yes |  |
| Sidebar auto/hide/overlay | Yes (auto at >120, overlay w/ scrim) | Yes (same) |  |
| Sidebar Context section (tokens/percent/cost) | Yes | Yes |  |
| Sidebar Todo section | Yes | Yes (parses tool output) |  |
| Sidebar Modified Files | Yes | Yes (rough diff) |  |
| Sidebar LSP section | Yes |  (no LSP) |  |
| Sidebar MCP section | Yes |  (no MCP) |  |
| Terminal window title | Yes (`OC | <title>`, toggle) | Yes (`NIMBL | <title>`) |  |
| Terminal suspend (ctrl+z) | Yes |  |  |
| Minimum terminal guard | Yes | Yes (60×18) |  |
| Workspace notice in composer status | Yes (`Creating worktree...`, `(new working copy)`) |  worktree dialog exists; no composer status label |  |
| Scroll acceleration | Yes (`scroll_acceleration`) |  (plain scroll) |  |
| Page/line/half-page scrolling | Yes (ctrl+alt combos) | Yes (pageup/pagedown/home/end only) |  |

---

## 3. Theme & Colors

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| Semantic token palette | Yes (full set incl. selectedListItemText, borderSubtle) | Yes (nearly identical names) |  |
| Diff palette tokens | Yes (13 tokens) | Yes (13 tokens, same hex values) |  |
| Markdown palette tokens | Yes (16) | Yes (16, same hex values) |  |
| Syntax palette tokens | Yes (9) | Yes (9, same hex values) |  |
| `thinkingOpacity` | Yes (0.6) | Yes (0.6) |  |
| Built-in themes | **35** | **3 real (`nimbl`/`opencode`/`mono`) + live preview + startup apply** |  (was ) |
| Custom themes from JSON | Yes (`themes/*.json`) |  |  |
| System theme from terminal palette | Yes (OKLab quantization) |  |  |
| Light/dark variants per theme | Yes |  |  |
| Theme live-preview on move | Yes | **Yes** |  |
| Plugin themes (`oc-themes`) | Yes |  |  |
| ANSI 0-255 numeric theme values | Yes |  |  |
| `selectedForeground` luminance contrast | Yes |  (white text fixed) |  |
| Agent color mapping | Yes (build/plan/general/explore + config `color`) | Yes (build/plan/explain/learn) |  |

**Color parity note:** NIMBL deliberately copied opencode's exact hex palette (secondary `#5c9cf5`, accent `#9d7cd8`, error `#e06c75`, warning `#f5a742`, success `#7fd88f`, diff colors) and is the closest single-theme match possible. Brand override: primary `#06402b`, brand `#16885a`, foreground `#4ade80`.

---

## 4. Borders, Glyphs & Typography

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| Heavy left border `┃` (SplitBorder) | Yes | Yes |  |
| Composer `╹` corner + `▀` bottom row | Yes | Yes |  |
| EmptyBorder 12-prop spread | Yes | Yes |  |
| `△` warning/error glyph | Yes | Yes |  |
| `▣` assistant footer glyph | Yes | Yes |  |
| `●` current marker | Yes | Yes |  |
| `✓`/`✗`/`○`/`◉`/`⊙`/`⟳`/`↳`/`→`/`←`/`⇆` | Yes | Yes (tool icons) |  |
| Tool icons `$ ✱ → % ◈  │` | Yes | Yes (same set) |  |
| Braille spinner `⠋⠙⠹…` | Yes | Yes (10-frame, 80ms) |  |
| Knight-Rider scanner | Yes (blocks + diamonds) |  (braille only) |  |
| Static `⋯` when animations off | Yes | Yes |  |
| Strikethrough for denied tools | Yes | Yes (`TextAttributes.STRIKETHROUGH`) |  |
| Bold headings H1 + underline | Yes | Yes |  |
| CLI wordmark (block ASCII) | Yes | Yes (`NIMBL` logo) |  |
| Emoji stripping in assistant output | Yes | Yes (`stripEmojis`) |  |

---

## 5. Message Rendering

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| User message left border in agent color | Yes | Yes |  |
| File/Directory attachment chips | Yes | Yes (File/Directory pills) |  |
| QUEUED badge | Yes | Yes |  |
| Message timestamp (HH:MM / date) | Yes (KV toggle) | Yes (`ctrl+alt+t`) |  |
| Hover background on messages | Yes | Yes |  |
| Click message → actions dialog | Yes (Revert/Copy/Fork) | Yes (Revert/View/Trim/Copy/Fork/Edit+resend) |  |
| Compaction divider | Yes | Yes |  |
| Assistant metadata footer | Yes (`▣ mode · model · duration`) | Yes (`▣ mode · model · duration`) |  |
| `· interrupted` suffix | Yes | Yes (added) |  |
| Duration format (ms/s/m/h/d) | Yes | Yes (same ladder) |  |
| Reasoning: `Thinking:` spinner + summary title | Yes | Yes |  |
| Reasoning: `+`/`-` thought toggle | Yes | Yes |  |
| Reasoning: subtle syntax at thinkingOpacity | Yes | Yes (`generateSubtleSyntax`-style via RGBA) |  |
| Reasoning: `[REDACTED]` stripping | Yes | Yes |  |
| Thinking visibility toggle (/thinking) | Yes | Yes (persisted global config) |  |
| Conceal code blocks | Yes (`<leader>h`) | Yes (`ctrl+h`, click to reveal) |  |
| Markdown grid tables | Yes | Yes |  |
| Streaming markdown | Yes | Yes |  |
| Code block line numbers | Yes | Yes (NativeCode) |  |
| Inline tool rows with icons | Yes | Yes |  |
| Block tool cards | Yes | Yes |  |
| Shell block (`# Running in <workdir>` + output preview) | Yes | Yes (OutputPreview 10 lines) |  |
| Read `↳ Loaded <path>` | Yes | Yes |  |
| Write/Edit diff in card | Yes | Yes |  |
| Diagnostics after write/edit (`Error [line:col]`) | Yes (LSP) |  |  |
| Todo block `# Todos` | Yes | Yes |  |
| Question block `# Questions` | Yes | Yes |  |
| Subagent task card with duration | Yes (`↳ 3 toolcalls · 1m 2s`) | Yes (`# Subagent Task — desc` + `· duration`) |  |
| Retry message in subagent card | Yes |  (error detail only) |  |
| Revert/undo banner with redo hint | Yes |  (toast only) |  |
| Error box | Yes | Yes |  |
| System message (single muted line) | Yes | Yes |  |

---

## 6. Composer & Input

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| Syntax-highlighted textarea | Yes | Yes |  |
| Placeholder muted / cursor themed | Yes | Yes |  |
| Max height responsive | Yes | Yes |  |
| Agent/model/variant metadata line | Yes | Yes (agent · model · provider) |  |
| Shell mode `!` prefix | Yes |  (TUI runs `!`cmd`` blocks, not composer shell mode) |  |
| `@` file/agent/MCP mention autocomplete | Yes (files/agents/MCP resources/references) | Yes (files + agents only) |  |
| `#line` ranges in mentions | Yes | Yes (attachment parsing) |  |
| Slash autocomplete with aliases | Yes | Yes (aliases, subsequence match) |  |
| Tab completes / Enter selects / Esc hides | Yes | Yes |  |
| Paste summary `[Pasted ~N lines]` | Yes (KV toggle) | Yes (3 lines/150 chars) |  |
| Image/PDF paste extmarks | Yes |  |  |
| Prompt history (JSONL, up/down) | Yes | Yes (draft history) |  |
| Prompt stash (save/pop/list) | Yes | Yes |  |
| External editor (`/editor`, `$EDITOR`) | Yes | Yes (suspends renderer) |  |
| Emacs-style input keybindings | Yes (~30) | **Yes (ctrl+a/e, alt+a/e, alt+b/f, alt+d, ctrl+w/k/u, super+a — ctrl+b/f/d/y/z omitted to keep app shortcuts)** |  (was ) |
| Newline keys (shift+enter, ctrl+j) | Yes | Yes (shift+return, ctrl+j) |  |
| Word forward/back/delete | Yes | **Yes** |  |
| Undo/redo in textarea | Yes |  (app-level ctrl+z/y reserved) |  |
| Status line usage `N tokens · $cost` | Yes | Yes (context hint) |  |
| Running spinner + two-press interrupt | Yes | Yes (2s window) |  |
| Retry countdown `[retrying in Xs attempt #N]` | Yes | Yes (added) |  |
| Gemini quota easter egg | Yes | Yes (added) |  |
| Exit words (`exit`/`quit`/`:q`) | Yes | Yes |  |
| Multi-line slash command args | Yes | Yes |  |
| Context hint `[key] label` | Yes | Yes (composer hints) |  |

---

## 7. Dialogs & Modals

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| Dialog shell (backdrop 59%, widths 60/88/116) | Yes | Yes (same) |  |
| Generic SelectDialog (filter/search/fuzzy) | Yes | Yes |  |
| Category headers + Suggested group | Yes | Yes |  |
| Footer actions with keybindings | Yes | Yes |  |
| Model dialog: Favorites/Recent/Providers/Popular | Yes | Yes (same sections) |  |
| Model dialog: `(Favorite)`, `Free` footer, `-nano` disabled | Yes | Yes |  |
| Connect provider dialog (OAuth/API/custom) | Yes | Yes (API key + hints only) |  |
| Agent dialog | Yes | Yes (4 modes) |  |
| Sessions dialog (pinned/today/date, search) | Yes | Yes |  |
| Sessions two-stage delete | Yes | Yes |  |
| Timeline dialog | Yes | Yes |  |
| Message actions (Revert/Copy/Fork/Edit) | Yes | Yes |  |
| Variant dialog/cycling | Yes |  (no variants) |  |
| MCP dialog (`/mcps`) | Yes |  (no MCP) |  |
| Skill dialog (`/skills`) | Yes | Yes |  |
| Console org dialog | Yes |  |  |
| Workspace list dialog | Yes | Yes (worktrees) |  |
| Move-session dialog | Yes |  |  |
| Stash dialog | Yes | Yes |  |
| Status dialog (MCP/LSP/formatters/plugins) | Yes |  (details dialog only) |  |
| Debug dialog (copy) | Yes | Yes (debug console dialog) |  |
| Alert/Confirm/Prompt/ExportOptions | Yes | Yes |  |
| Plugin manager dialog | Yes |  |  |
| Command palette | Yes | Yes |  |
| Which-key | Yes |  |  |
| Go-upsell `BgPulse` animation | Yes |  |  |

---

## 8. Permission System

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| Rule-based rulesets (permission/pattern/action) | Yes | Yes (settings map) |  |
| `ask/allow/deny` | Yes | Yes |  |
| Wildcard pattern matching | Yes (`*`, `?`, trailing `.*` optional, win32-ci) | Yes (`*` only, always ci) |  |
| Global `"*"` default rule | Yes | Yes (default ask) |  |
| **`external_directory` permission** | Yes (whitelisted dirs default-allow, else ask; never inherits `*`) | **Yes (added — same semantics, never inherits `*`)** |  |
| `external_directory` modal | `← Access external directory <dir>` | `← Access external directory <dir>` |  |
| Tool-specific defaults (read env ask, etc.) | Yes (`.env`/`.env.*` ask, `.env.example` allow) | Yes (protected files blocked entirely) |  NIMBL stricter |
| Permission modal: Allow once/Always/Reject | Yes (3-stage machine) | Yes (3-stage machine) |  |
| Reject with message fed back to model | Yes (`CorrectedError` with feedback) | **Yes (reject resolves `{reject: message}`, fed to model as tool error)** |  |
| "Always" two-stage confirm | Yes | Yes |  |
| Ctrl+F fullscreen permission prompt | Yes | Yes |  |
| Doom-loop permission (`doom_loop`) | Yes (ask after 3 identical calls) | **Yes (ask via modal on first trigger, hard-stop on repeat)** |  |
| Permission `always` list per session | Yes | Yes (alwaysAllowed set + persisted rule) |  |
| Reject cascades to other pending | Yes |  (drains on run end only) |  |
| `disabled()`/tool visibility from deny rules | Yes |  (tools always listed) |  |
| Subagent permission inheritance (parent denies flow down) | Yes |  (child uses its own + project) |  |
| Headless `--auto`/`--yes` auto-approval | Yes (`--auto`, `--yolo`, `--dangerously-skip-permissions`) | Yes (`--yes`/`-y`) |  |
| Non-interactive run denies question/plan | Yes |  (headless throws unless allow/--yes) |  |

---

## 9. Tools

| Tool | opencode | NIMBL | Status |
|---|---|---|---|
| read |  |  |  NIMBL: no miss-heuristic, no directory listing, no image/PDF attachments, no LSP warm-up, no instruction injection |
| write |  |  |  NIMBL: no formatter sync, no BOM, no LSP diagnostics |
| edit |  (9-replacer cascade) | ** (7-strategy cascade: exact → line-trimmed → block-anchor → whitespace-normalized → indentation-flexible → trimmed-boundary → context-aware; ambiguous + disproportionate guards; replaceAll)** |  (was ) |
| apply_patch |  (custom parser, 4-level match) |  (git apply) |  NIMBL project-only, git-based |
| bash/shell |  (tree-sitter parse, external_directory for FILES cmds, streaming) |  (bounded, timeout) |  NIMBL: no path arg parsing, no external_directory gate, no streaming into ring |
| glob |  (ripgrep, 100) |  (Bun.Glob, 200) |  |
| grep |  (ripgrep, 100) |  (Bun regex scan, 100) |  NIMBL slower, case-insensitive only |
| webfetch |  (CF challenge retry, images→attachments, 5MB) |  (basic fetch, tag strip) |  NIMBL no attachment, no CF retry |
| websearch |  (exa/parallel MCP) |  (DuckDuckGo HTML) |  |
| task/delegate |  (depth limit, background, resume) |  (depth 3, foreground only) |  no background |
| todowrite |  |  |  |
| question |  (multi-question tabs) |  (single question) |  |
| skill |  |  |  |
| lsp |  (9 ops, experimental) |  |  |
| execute (code-mode) |  (confined interpreter, experimental) |  |  |
| invalid (repair tool) |  |  |  |
| plan_exit |  (experimental) |  |  |
| MCP tools + resource tools |  |  |  |
| Custom JS/TS tools in config |  (`tool/tools/*.{js,ts}`) |  (markdown commands only) |  |
| Output truncation service |  (2000 lines/50KB, spill file, 7-day) |  (clip, no spill file) |  |
| Tool output preview in metadata |  (30KB preview) |  (output preview UI) |  |

---

## 10. Agent Runtime

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| Streaming agent loop | Yes | Yes |  |
| Tool steps limit | Yes (`agent.steps`) | Yes (12 default) |  |
| Attempts/retry | Yes (2000ms base ×2, cap 30s, header-aware) | Yes (500ms ×2, max 3) |  |
| Retry-after header support | Yes | **Yes (`retryAfterMs`, capped 30s)** |  |
| Doom-loop detection | Yes (3 identical calls → ask) | **Yes (3 → ask, then stop on repeat)** |  |
| No retry after streamed activity | Yes | Yes |  |
| Context overflow auto-compaction | Yes | Yes (82% threshold, keep 12) |  |
| Compaction agent (LLM summary) | Yes |  (heuristic extract, no LLM) |  |
| Structured output tool | Yes |  |  |
| Title agent | Yes (LLM title) |  (heuristic from first message) |  |
| Summary agent | Yes (LLM PR-style summary) |  (heuristic) |  |
| Session reminders (plan/build-switch) | Yes |  |  |
| System prompt per provider | Yes (10+ templates) |  (one style) |  |
| Environment block (model name/cwd/date) | Yes |  (identity line only) |  |
| LSP/MCP/plugin integration in prompt | Yes |  |  |
| Media injection for non-media models | Yes |  |  |
| Interleaved reasoning handling | Yes |  |  |
| Surrogate sanitization | Yes |  |  |
| Per-file edit semaphore | Yes |  |  |
| Per-model tool filtering (gpt → apply_patch) | Yes |  |  |
| Agent steps prompt (MAX_STEPS) | Yes |  |  |
| Subagent depth config | Yes | Yes (3) |  |
| Background subagents | Yes (experimental) |  |  |
| Learning/Socratic teaching integration |  | **Yes** |  NIMBL-only |

---

## 11. Sessions & Storage

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| Session CRUD + fork + parent/child | Yes | Yes |  |
| Child session navigation (parent/prev/next) | Yes | Yes (subagent nav bar) |  |
| SQLite database | Yes |  (JSON) |  |
| CAS optimistic concurrency |  (SQLite) | **Yes (revision CAS + lock)** |  NIMBL JSON-CAS |
| Cross-process lock | SQLite | Yes (`.nimbl/sessions.lock`) |  |
| Corrupt store recovery + backup | Yes (migrations) | Yes (fingerprint + corrupt backup) |  |
| Retention/archival | Yes (archived sessions) | Yes (90d/50/100) |  |
| Undo/redo snapshots | Yes (git snapshot service) | Yes (JSON snapshots + assert-current) |  |
| Revert to message | Yes | Yes |  |
| Full-file unified diffs for undo | Yes | Yes |  |
| Session search | Yes (SDK) | Yes (title/body scoring) |  |
| Message pagination/cursors | Yes |  (in-memory) |  |
| Session title/summary metadata | Yes | Yes |  |
| Pin sessions | Yes | Yes |  |
| Queued prompts | Yes | Yes (queue/reject/replace) |  |
| Drafts + history | Yes | Yes |  |
| Todos persisted | Yes (SQLite) | Yes (in session) |  |
| Sync (event-sourcing) | Yes |  |  |
| Import/export JSON | Yes | Yes (markdown/json) |  |
| Session share (hosted + deltas) | Yes |  (manual hosted share) |  |

---

## 12. Providers & Models

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| Live models.dev catalog | Yes (5-min TTL + snapshot + background refresh) | Yes (2h TTL `applyLiveCatalog`) |  NIMBL slower refresh |
| Provider count | 75+ (via models.dev) | 18 (static + live overlay) |  |
| Custom providers (npm SDK, baseURL) | Yes (arbitrary npm fallback) |  |  |
| Provider auth plugins (OAuth) | Yes (OpenAI/Copilot/xAI/etc.) |  (API keys + PKCE stubs) |  |
| Per-model reasoning variants | Yes (effort lists per family) |  |  |
| Prompt caching (cacheControl/promptCacheKey) | Yes | Yes (same mechanisms) |  |
| Reasoning budget tokens | Yes |  |  |
| Temperature/topP/topK per family | Yes |  |  |
| JSON-schema sanitization per provider | Yes |  |  |
| Model not-found "Did you mean" | Yes | **Yes (edit-distance suggestions)** |  |
| Small model for titles | Yes |  |  |
| Default model sort heuristics | Yes | Yes (defaultModelFor) |  |
| Per-provider message transforms | Yes |  |  |
| Copilot/ChatGPT subscription auth | Yes |  |  |
| Provider enable/disable lists | Yes | Yes (allowlist/denylist) |  |
| Provider routing by prompt intent |  (manual via /route? none) | **Yes (rankProviders)** |  NIMBL-only |
| Provider health checks |  (via status) | **Yes (checkProviderHealth)** |  NIMBL-only |
| Live provider pricing | Yes (models.dev costs) | Yes (models.dev pricing) |  |
| Free-model handling | Yes (opencode public models zeroed) | Yes (Free footer) |  |

---

## 13. Server, API & SDK

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| Headless server (`serve`) | Yes |  |  |
| HTTP API (legacy + v2 protocol) | Yes (full REST/SSE) |  |  |
| WebSocket PTY | Yes |  |  |
| mDNS discovery | Yes |  |  |
| Embedded web UI | Yes |  |  |
| SDK packages (JS, next-gen, Effect) | Yes |  |  |
| ACP protocol server | Yes |  |  |
| Server password auth | Yes |  |  |
| Remote workspace proxy/fences | Yes |  |  |
| Headless CLI run | Yes (`opencode run`) | Yes (`nimbl run`) |  |
| JSON event output | Yes (`--format json`) |  |  |
| Attach to running server | Yes (`--attach`) |  |  |
| `--mini` split-footer mode | Yes |  |  |

---

## 14. Plugins & MCP

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| Plugin system (npm/path, hooks) | Yes (30+ hooks) |  (config stub only) |  |
| Plugin install CLI | Yes (`opencode plugin`) |  |  |
| Plugin manager TUI dialog | Yes |  |  |
| Custom JS/TS tools | Yes |  |  |
| MCP client (stdio/SSE/HTTP) | Yes |  (config stub only) |  |
| MCP OAuth | Yes |  |  |
| MCP tools in agent | Yes |  |  |
| MCP resources/templates/prompts | Yes |  |  |

---

## 15. LSP & Formatters

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| LSP client (37 servers) | Yes |  |  |
| LSP diagnostics after edits | Yes |  |  |
| LSP tool (9 operations) | Yes |  |  |
| Formatter integration (25 formatters) | Yes |  |  |
| `/status` LSP/formatter status | Yes |  |  |

---

## 16. Skills

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| SKILL.md frontmatter | Yes | Yes |  |
| Project skills dir | Yes (`.claude`/`.agents`/`.opencode`) | Yes (`.nimbl/skills`) |  |
| Global skills dirs | Yes (`~/.claude`, `~/.agents`, config dirs) | Yes (OS config `nimbl/skills`) |  |
| `skills.paths` config | Yes | Yes |  |
| Remote skill URLs | Yes (index.json discovery) | **Yes (index.json discovery via `syncRemoteSkills`, versioned cache)** |  |
| Built-in `customize-opencode` skill | Yes |  |  |
| Skill files listing in tool output | Yes | Yes (≤20 files) |  |
| `<available_skills>` system prompt | Yes | Yes |  |
| Skill permission gating | Yes | Yes |  |
| Skill dialog | Yes | Yes |  |

---

## 17. Auth & Accounts

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| Credential store (0600) | Yes | Yes |  |
| OAuth browser flows | Yes (many providers) |  (PKCE primitives only) |  |
| Device-code login | Yes |  |  |
| Console/enterprise accounts | Yes |  |  |
| Credential diagnostics | Yes | Yes (`credentialDiagnostics`) |  |
| Key redaction in exports | Yes | Yes (redactSecrets) |  |

---

## 18. Config System

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| JSON/JSONC config | Yes | Yes |  |
| Legacy TOML migration | Yes |  |  |
| Config validation (unknown keys rejected) | Yes |  (diagnostics, unknown tolerated) |  |
| Config variables `{env:}`, `{file:}` | Yes |  |  |
| Remote well-known configs | Yes |  |  |
| Managed config / MDM | Yes |  |  |
| `.opencode` dirs walked up | Yes |  (project root only) |  |
| Project instructions AGENTS.md | Yes (+ CLAUDE.md, CONTEXT.md) | Yes (AGENTS.md + NIMBL.md) |  |
| Instruction URLs | Yes |  |  |
| Per-file instruction injection on read | Yes |  |  |
| Keybind config | Yes (TUI json, full) | Yes (settings.json) |  |
| `{env:VAR}` in prompts |  | Yes (prompt-context) |  |
| Settings priority chain | Yes (10 layers) | Yes (5 layers) |  |

---

## 19. CLI

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| TUI default command | Yes | Yes |  |
| Headless run | Yes | Yes |  |
| `--continue`/`--session`/`--fork` | Yes | Yes |  |
| `--prompt`/`--file` attachments | Yes |  (`--prompt` only) |  |
| `--model`/`--agent` | Yes | Yes |  |
| `--auto`/`--yes` | Yes | Yes |  |
| Session list/delete/rename | Yes | Yes |  |
| Stats (SQLite aggregation) | Yes | Yes (JSON) |  |
| Export/import sessions | Yes |  (export only) |  |
| Providers list/login/logout | Yes | Yes (list only) |  |
| Models list | Yes | Yes |  |
| Agent create (LLM-assisted) | Yes |  |  |
| MCP CLI | Yes |  |  |
| GitHub agent CLI | Yes |  |  |
| PR helper | Yes |  |  |
| Upgrade/uninstall | Yes |  |  |
| Debug subcommands (13) | Yes |  (doctor only) |  |
| Completion script | Yes |  |  |
| `db` raw SQL shell | Yes |  |  |
| Shell completion | Yes |  |  |

---

## 20. Notifications, Audio & Editors

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| OS notifications | Yes (focus-aware) |  (in-app only; sound inert) |  |
| Sound packs + per-event sounds | Yes |  |  |
| Notification center with read state | Yes | Yes (cap 200) |  |
| External editor integration | Yes | Yes |  |
| OS clipboard + copy-on-select | Yes | Yes (OSC52) |  |
| Image paste handling | Yes |  |  |

---

## 21. Retrieval & Context (NIMBL strength)

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| Automatic project-wide file dump | Yes (instructions + context via file listing) |  (design constraint) |  NIMBL deliberate |
| Lexical context selection |  (no scoring) | **Yes (TF/proximity/symbol/path scoring)** |  NIMBL-only |
| Dependency graph expansion |  | **Yes (budgeted BFS, edge types)** |  NIMBL-only |
| Structural/parser-backed chunks |  | **Yes (Babel declarations)** |  NIMBL-only |
| Hybrid semantic retrieval |  | **Yes (local + hosted embeddings, vector index, MMR)** |  NIMBL-only |
| Ignore-aware indexing | Yes (git) | Yes (nested .gitignore) |  |
| Token/char budgeted excerpts |  | **Yes (budget fitting, compression)** |  NIMBL-only |
| Retrieval telemetry |  | **Yes (full ContextRetrievalTelemetry)** |  NIMBL-only |
| Retrieval benchmark |  | **Yes (P3-01 frozen corpus, 7 modes)** |  NIMBL-only |

---

## 22. Pedagogy & Learning (NIMBL moat)

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| Teaching/explanation-first responses |  | **Yes (mode prompts, response style)** |  NIMBL-only |
| Socratic question prompts |  | **Yes (question tool + learning)** |  NIMBL-only |
| Concept encounter tracking |  | **Yes (18 concepts)** |  NIMBL-only |
| Spaced repetition scheduling |  | **Yes (30/7/2/1 day)** |  NIMBL-only |
| Misconception tracking/correction |  | **Yes** |  NIMBL-only |
| Quizzes & goals |  | **Yes** |  NIMBL-only |
| Teaching focus in system prompt |  | **Yes (teachingPrompt)** |  NIMBL-only |
| Learn agent mode |  | **Yes (4th mode)** |  NIMBL-only |

---

## 23. Security

| Feature | opencode | NIMBL | Status |
|---|---|---|---|
| Env-file read protection | Ask (`.env`/`.env.*`) | Block (plus `.env.example` allowed) |  NIMBL stricter |
| Protected credential files | Via permission | Block (names/extensions) |  NIMBL stricter |
| Symlink/junction escape detection | Yes (canonical) | Yes (realpath canonical) |  |
| External directory gating | Yes (ask default) | Yes (ask default, added) |  |
| Shell sandboxing | No (explicit) | No (explicit) |  |
| Key redaction | Yes | Yes |  |
| Session data plaintext | Yes | Yes (documented) |  |
| Temp pre-approved dir | Yes (`Global.Path.tmp`) |  |  |

---

## 24. Observations & Conclusions

### Where NIMBL is genuinely ahead (or opencode lacks it)
1. **Learning/teaching system** — opencode has zero pedagogy; NIMBL's entire identity.
2. **Retrieval engine** — lexical scoring, dependency graph, structural chunks, hybrid fusion with MMR, telemetry, and a **reproducible benchmark** are all NIMBL-only.
3. **Provider routing & health** — prompt-intent routing and live health checks are NIMBL-only.
4. **CAS session storage with cross-process locking** — opencode uses SQLite; NIMBL's JSON-CAS is notable given no DB.
5. **Token budgeting discipline** — `fitRequestToBudget`, compression modes, per-loop context guard.
6. **Stricter default security** — protected-path blocking vs opencode's ask.

### Where NIMBL is clearly behind
1. **Platform surface** — server, SDK, web/desktop/console apps, Slack, GitHub action, VS Code extension.
2. **Plugins, MCP, LSP, formatters** — all opencode surface areas NIMBL deliberately stubbed.
3. **Providers** — 75+ (including OAuth subscriptions) vs 18 API-key providers.
4. **Reasoning variants & per-family transforms** — NIMBL has none.
5. **Themes** — 35 + custom + system vs 3 real (gap narrowed; custom/system theme files still missing).
6. **Keybindings/editor ergonomics** — ~120 vs ~18 app-level + Emacs composer editing (gap narrowed).
7. **Tool sophistication** — ripgrep, streaming shell, image/PDF read, code-mode execution, structured output.

### Deliberate exclusions (per AGENTS.md / roadmap — NOT gaps)
- MCP, plugins, LSP (explicitly declared out of scope)
- Total/session thinking-time metric (explicitly out of scope)
- Autonomous autonomous agent mode / Code Mode (roadmap)
- Semantic+graph retrieval were "planned"; now implemented (the benchmark gates claims)

### Recommended next work packages (ranked by parity leverage)
1. **Custom/system themes from JSON files** — extend the new 3-theme system to read `themes/*.json` (small, visible).
2. **Textarea undo/redo** — wire OpenTUI's built-in undo/redo actions behind a non-conflicting binding.
3. **Reasoning variants** — per-model effort lists for opencode-zen/go models.
4. **Reject cascade** — reject all pending approvals for a session (opencode parity).
5. **Which-key** — discoverability of the ~18 bindings.
6. **MCP/LSP** — largest gap, largest effort; matches roadmap Phase 7.

---

## 25. Parity Feature Pass (2026-08-14) — What Was Added

This pass closed the following previously-/ gaps in NIMBL:

| Feature | Before | After |
|---|---|---|
| Themes | 1 real palette, 2 inert | **3 real palettes + reactive live switching + live preview + startup apply** |
| Edit tool | Simple `replace` | **7-strategy `applyEdit` cascade** (exact→line-trimmed→block-anchor→whitespace→indentation→boundary→context) with ambiguity/disproportionate guards and `replaceAll` |
| Reject-with-message | Collected, not fed back | **Fed to the model as a tool error** (`{reject: message}`) |
| Composer editing | Arrows only | **Emacs-style keys** (ctrl+a/e, alt+a/e, alt+b/f, alt+d, ctrl+w/k/u, super+a) |
| Remote skills | `skills.urls` configured but inert | **`syncRemoteSkills` index.json discovery + versioned cache** |
| Doom-loop | Silent auto-stop | **Asks the user** (`doom_loop` modal), continues on approval |
| Model suggestions | Plain error | **"Did you mean" edit-distance suggestions** |
| Retry-after | Ignored | **Header-aware backoff** (`retryAfterMs`, capped 30s) |

Verification: `bun run typecheck` clean · **232 tests pass (606 expect)** across 35 files · `bun run build` clean · `NIMBL_TEST_RENDERER=1` smoke exit 0. Home screen left untouched per request.

---

*End of comparison.*

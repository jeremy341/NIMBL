# NIMBL — Research & Design Report

> **Token-efficient AI coding companion that teaches.**
> Learn more. Use fewer tokens.

**Language:** TypeScript (ESNext)
**Runtime:** Bun 1.3.14+
**TUI Framework:** OpenTUI 0.4.5 with SolidJS 1.9.10
**Theme:** Black (#0a0a0a) primary, Forest Green (#06402b) accent

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Solution Overview](#2-solution-overview)
3. [Competitive Landscape & Token Waste Analysis](#3-competitive-landscape--token-waste-analysis)
4. [Research: Token Compression Techniques](#4-research-token-compression-techniques)
5. [Architecture](#5-architecture)
6. [Stack Decision & Evolution](#6-stack-decision--evolution)
7. [TUI Design](#7-tui-design)
8. [Dependencies](#8-dependencies)
9. [TypeScript Configuration](#9-typescript-configuration)
10. [Testing Strategy](#10-testing-strategy)
11. [Token Cost Analysis](#11-token-cost-analysis)
12. [Learning System Research (Future)](#12-learning-system-research-future)
13. [Provider Integration](#13-provider-integration)
14. [Build Plan & Actual History](#14-build-plan--actual-history)
15. [Branding](#15-branding)
16. [Known Issues & Future Work](#16-known-issues--future-work)

---

## 1. Problem Statement

### 1.1 The Token Waste Crisis

Existing AI coding tools consume 100K–1M tokens per task:

| Tool | Tokens/Task | Monthly Cost | Waste Source |
|------|-------------|-------------|--------------|
| Cursor | 200K–1M | $20–$200 | Project maps, file dumps, full-file context |
| Claude Code | 100K–500K | $20–$100 | Large conversation history, redundant file reads |
| GitHub Copilot | 50K–200K | $10–$39 | Heavy IDE integration overhead |
| Windsurf | 150K–600K | $15–$60 | Similar to Cursor |

Most providers charge $0.15–$10 per 1M input tokens and $0.60–$30 per 1M output tokens. At 500K tokens per task, a team of 5 developers doing 20 tasks/day spends $7,500–$30,000/month on inference alone.

### 1.2 The Pedagogical Gap

Every existing AI coding tool is a **code generator**. None teach:

- **Why** a change is needed (only what changed)
- **How** to approach similar problems independently
- **What** patterns or principles apply
- **Skill progression** — tracking what the developer learns over time

### 1.3 The Distribution Barrier

Zero-setup distribution is a product goal. The current repository is private-package source software and requires installation plus a configured provider.

---

## 2. Solution Overview

### 2.1 Token Efficiency Target

The following mechanisms are proposed and require implementation plus controlled validation:

1. **Semantic search + graph traversal** — not implemented; current retrieval is lexical
2. **AST/structural compression** — implemented as parser-backed structural chunks plus a declaration-preserving compression fallback; percentage claims remain benchmark-gated
3. **Provider prompt caching** — implemented as stable-prefix/provider metadata support; local retrieval caching remains a separate mechanism
4. **No automatic project maps or file dumps** — implemented as a current design constraint

### 2.2 Learning Companion (vs Code Generator)

NIMBL teaches as it helps:

- Explains *why* changes are needed, not just *what* changed
- Uses Socratic questioning — asks instead of solving
- Records basic concept encounters (future: assessed skill tree and spaced repetition)
- Can connect to a separately installed local model server such as Ollama

### 2.3 Zero-Setup Distribution

```bash
bunx nimbl
```

Current providers require either configured credentials or a separately running local service. Keyless provider support and package publication are future work.

---

## 3. Competitive Landscape & Token Waste Analysis

### 3.1 AI Coding Tools Market Map (2026)

| Tool | TUI/CLI | Agent Mode | Pedagogy | Token Cost/Task | Offline | Open Source |
|------|---------|-----------|----------|----------------|---------|-------------|
| **NIMBL** | **OpenTUI** | **Yes** | **Prompt-directed** | **Not benchmarked** | **Local connector** | **Yes** |
| Cursor | GUI | Yes | No | 200K–1M | Limited | No |
| Claude Code | TUI (Ink) | Yes | No | 100K–500K | No | No |
| Copilot | IDE | Yes | No | 50K–200K | No | No |
| Windsurf | GUI | Yes | No | 150K–600K | No | No |
| opencode | TUI (OpenTUI) | Yes | No | 50K–200K | Yes | Yes |
| CodeGPT | GUI | Limited | No | 100K–300K | No | No |
| Cody (Sourcegraph) | IDE | Yes | No | 100K–400K | No | Yes |
| Continue | IDE | Yes | No | 100K–300K | No | Yes |

### 3.2 Key Insight: Pedagogy is the Moat

Every competitor optimizes for **generation speed** and **completion accuracy**. None optimize for **developer skill growth**. This means:

- Developers stay dependent on the tool
- Organizations can't reduce tool spend over time
- Junior developers don't build intuition

NIMBL's learning focus is both a differentiator and a long-term moat. A developer who learns from NIMBL becomes a *better developer*, not just a faster prompter.

---

## 4. Research: Token Compression Techniques

### 4.1 AST Compression Research

Parsing source code into ASTs and compressing the tree structure yields 64–70% token reduction vs raw source:

| Technique | Reduction | Quality Impact | Implementation Complexity |
|-----------|-----------|---------------|--------------------------|
| AST minification | 64–70% | Minimal (structure preserved) | Medium (tree-sitter) |
| Semantic chunking | 40–60% | Low (needs overlap) | Low (regex + heuristics) |
| Recursive summarization | 80–90% | High (lossy) | High (LLM calls) |
| Context-aware pruning | 50–75% | Low (only removes irrelevant) | Medium (depends on query) |

**Proposed approach:** AST minification via tree-sitter (WASM), with semantic chunking as fallback for languages without tree-sitter grammars. The figures above are research hypotheses, not measured NIMBL results.

### 4.2 Prompt Caching Research

| Cache Type | Hit Rate | Token Savings | Implementation |
|------------|----------|---------------|----------------|
| System prompt | ~100% | 500–2K tokens/task | Built into `generateText` |
| Project context | 60–80% | 1K–5K tokens/task | LRU cache with TTL |
| Recent conversation | 40–60% | 2K–10K tokens/task | Sliding window |
| User preferences | 80–90% | 100–500 tokens/task | Persistent storage |

### 4.3 Deployment Architecture (Future)

For teams: local semantic cache on developer machines + shared Redis-backed cache for team context.

---

## 5. Architecture

### 5.1 Codebase Structure

```
NIMBL/
├── src/
│   ├── config.ts             # Config resolution (.env, CLI args, defaults)
│   ├── tui-opencode.tsx      # Sole supported OpenTUI entry
│   ├── tui-opencode-ui/      # Transcript, prompt, dialogs, tools, sidebar
│   ├── core/
│   │   ├── agent.ts          # Agent system (tool use, build/plan/explain/learn modes)
│   │   ├── api.ts            # AI SDK wrapper + cost estimation
│   │   ├── commands.ts       # Project-local command loader (.nimbl/commands/*.md)
│   │   ├── context.ts        # Lexical context selection (file excerpting + cache)
│   │   ├── learning.ts       # Learning state tracker (concepts, confidence, Socratic)
│   │   ├── permissions.ts    # Wildcard-based permission policy engine
│   │   ├── prompt-context.ts # @file and !`command` expansion in prompts
│   │   ├── providers.ts      # Provider and model catalog
│   │   ├── routing.ts        # Automatic provider routing (local/fast/budget)
│   │   ├── session-actions.ts # Session rename, fork, undo/redo snapshots, compact
│   │   ├── sessions.ts       # Session persistence (.nimbl/sessions.json)
│   │   ├── settings.ts       # Settings persistence (.nimbl/settings.json)
│   │   └── types.ts          # Shared type definitions
├── dist/
│   └── nimbl.js              # Bundled OpenTUI TUI output
├── build.ts                  # Bun.build() with Solid transform plugin
├── tests/
│   ├── api.test.ts           # API + cost calculation tests
│   ├── commands.test.ts      # Project command loading + argument expansion
│   ├── config.test.ts        # Config resolution tests
│   ├── context.test.ts       # Context compression + budget + caching
│   ├── learning.test.ts      # Learning state tracking
│   ├── permissions.test.ts   # Wildcard permission matching
│   ├── prompt-context.test.ts # @file and !`command` expansion
│   ├── providers.test.ts     # Model context window resolution
│   ├── session-actions.test.ts # Session rename, fork, snapshots, compact
│   └── settings.test.ts      # Provider routing preferences
├── docs/
│   ├── RESEARCH_REPORT.md    # This file
│   └── LOGO_DESIGN.md        # Branding guidelines
├── package.json, tsconfig.json, vitest.config.ts, AGENTS.md, bunfig.toml
```

### 5.2 Interface Evolution

The project evolved through three UI approaches. Only OpenTUI remains supported:

| Interface | File(s) | Framework | Status | Run Command |
|-----------|---------|-----------|--------|-------------|
| **REPL** | Removed | readline (native) | Historical prototype | — |
| **Ink TUI** | Removed | Ink 5, React 18 | Historical prototype | — |
| **OpenTUI TUI** | `src/tui-opencode.tsx` | OpenTUI 0.4.5, SolidJS 1.9.10 | **Current primary** | `bun run nimbl` |

The `nimbl` script builds the OpenTUI TUI with `build.ts`, then runs the bundled output:

```bash
bun run build && bun dist/nimbl.js
```

### 5.3 Build System

`build.ts` uses `Bun.build()` with `@opentui/solid/bun-plugin`:

```typescript
await build({
  entrypoints: ["src/tui-opencode.tsx"],
  outdir: "dist",
  target: "bun",
  conditions: ["browser"],
  naming: "nimbl.js",
  plugins: [createSolidTransformPlugin()],
  external: [
    "@opentui/core-win32-x64",
    "@opentui/core-darwin-x64",
    // ... platform-native binaries
  ],
})
```

**Why `conditions: ["browser"]`:** SolidJS has separate builds for browser and server. Without `"browser"`, SolidJS's server build is used at runtime, which lacks DOM-like APIs (`insert`, `createComponent`, etc.) that OpenTUI's reconciler expects.

**Why a build step is required:** `Bun.plugin()` with `onLoad` only works during `bun build`, not at `bun run` time. The `@opentui/solid/preload` plugin (registered via `bunfig.toml`) is a no-op at runtime. The bundler approach is the only way to get Solid JSX transforms applied.

### 5.4 Data Flow

```
User input (text prompt)
    |
    v
TUI component (tui-opencode.tsx or chat.tsx)
    |
    v
config.ts  ──►  resolveConfig(argv)  ──►  { provider, model, apiKey }
    |
    v
core/api.ts  ──►  sendChat(text, config)
    |                │
    |                v
    |         createOpenAI({ baseURL, apiKey })
    |                │
    |                v
    |         generateText({ model, prompt })
    |                │
    |                v
    |         { text, usage: { inputTokens, outputTokens, totalTokens } }
    |
    v
TUI renders response in scrollable message list
    |
    v
estimateReferenceCost(inputTokens, outputTokens)  ──►  reference-cost stats in status bar
```

### 5.5 Error Handling

| Scenario | Behavior |
|----------|----------|
| Provider unreachable | `sendChat()` throws → caught in UI → error message displayed in message list |
| API key missing | `resolveConfig()` throws → caught at entry → red error + usage hint |
| Model errors | `generateText()` throws → caught → red error in UI |
| Rate limited (429) | AI SDK handles internally; bubbles up as error if persistent |
| Missing API key env var | `resolveConfig()` throws before any API call |
| Fatal TUI error | Caught by global handler → written to `nimbl-error.log` → graceful exit |

---

## 6. Stack Decision & Evolution

### 6.1 Phase 1: REPL (Initial)

**Stack:** Node.js readline + Vercel AI SDK

The first working version was a simple readline REPL. No TUI framework. No config file. Hardcoded provider defaults. This proved the core loop (prompt → AI → response → token stats) worked.

### 6.2 Phase 2: Ink TUI

**Stack:** Ink 5 + React 18 + `ink-text-input`

Added a proper TUI with:
- Home screen (centered logo + prompt input)
- Chat screen (message list + thinking indicator + input)
- Status bar (provider, model, token count + savings)
- `/quit` and `/clear` commands
- Bubble-styled messages (user green, NIMBL dark)

Ink was chosen because it's battle-tested (39.5K stars), pure JavaScript (no native DLLs), and used by production tools (Claude Code, Gemini CLI).

### 6.3 Phase 3: OpenTUI TUI (Current Primary)

**Stack:** OpenTUI 0.4.5 + SolidJS 1.9.10

Switched to OpenTUI (opencode's TUI framework) for:
- Direct influence from opencode's TUI design
- Richer border/scrollbox primitives
- JSX-based component model
- Better terminal rendering performance

**Challenges encountered:**

1. **`Bun.plugin()` doesn't work at runtime** — Solid JSX transforms require `Bun.build()` with `createSolidTransformPlugin()`. The `@opentui/solid/preload` entry in `bunfig.toml` is a no-op at `bun run`. **Fix:** `build.ts` bundler approach.

2. **`@opentui/solid/index.bun.js` needs patches** — Two runtime bugs were found:
   - `insert` function uses `createMemo` instead of `createRenderEffect` for tracking insertions. **Fix:** Changed to `createRenderEffect((current) => insertExpression(parent, accessor(), current, marker), initial)`.
   - `setProperty` calls event handler props (`onClick`, etc.) as regular functions. **Fix:** Added `!name.startsWith("on")` guard.
   
   Both patches are applied in `node_modules` but lost on `bun install`. They're baked into the bundled `dist/nimbl.js`.

3. **RGBA colors crash via Bun FFI** — OpenTUI uses native colors via Bun's FFI (zig/chimera). RGBA hex strings (`#rrggbbaa`) cause native DLL crashes. **Fix:** All colors are 6-digit hex strings.

4. **`scrollbox` JSX component works but isn't a named export** — It's registered in OpenTUI's component catalogue for JSX resolution but can't be imported directly. JSX usage works fine.

5. **`opentui-spinner` package doesn't exist** — Animated spinner uses a custom `LoadingDots` component with `setInterval` and spinner frame characters.

### 6.4 Phase 4: Full Agent Backend

**Stack:** Vercel AI SDK v7 + tool.use + zod + file system

The backend expanded from a simple sendChat wrapper to a full agent system with:
- **Tool-based execution:** `read`, `glob`, `grep`, `write`, `edit`, `apply_patch`, `bash`, `webfetch`, `skill`, `question`, `todowrite` — 11 tools with typed schemas and permission checks
- **Agent modes:** Build (full access), Plan (read-only investigation), Explain (read-only teaching), Learn (Socratic hints)
- **Permission engine:** Wildcard-based policy (`*: ask`, `bash: deny`, etc.) with in-TUI approval dialogs
- **Session management:** Persistent sessions with undo/redo file snapshots, fork, pin, compact
- **Context selection:** Keyword-based file excerpting with LRU cache for relevant project context
- **Learning state:** Tracks concept confidence across sessions, injects teaching focus into system prompt
- **Provider routing:** Automatic choice of local/fast/cheap provider based on prompt keywords
- **Project commands:** `.nimbl/commands/*.md` loaded at startup as slash-accessible prompts

See `src/core/agent.ts` (421 lines, the largest backend module) for the full agent implementation.

### 6.5 Sole Supported TUI

The divergent Ink and readline implementations were removed. `src/tui-opencode.tsx` is the sole supported frontend and uses the full agent, session, permission, and context systems.

---

## 7. TUI Design

### 7.1 OpenTUI TUI Layout (Current Primary)

Designed to match OpenCode's session layout pattern:

```
┌──────────────────────────────────────────────────────┐
│  NIMBL  Build · FreeLLM API / auto   847t · $0.03    │  ← Status bar (green bg, agent mode, tokens)
├──────────────────────────────────────────────────────┤
│ ┃ You                                                │  ← Message card (left border)
│ ┃  Hello, how do I reverse a string?                 │
│ ┃                                                    │
│ ┃ NIMBL                                              │
│ ┃  Here's a function that reverses...                │
│ ┃                                                    │
│ ┃  Tool [completed]  13:42   actions                 │  ← Tool event cards
│ ┃  Read src/utils.ts                                 │
│ ┃                                                    │
│ ┃ NIMBL                                              │
│ ┃  ⠋ NIMBL is working…                             │  ← Loading spinner
│ ┃                                                    │
│ │                                                    │
│ └────────────────────────────────────────────────────┤
│ ╹ Build  Ask NIMBL to help...   FreeLLM API · auto   │  ← Prompt with agent mode + provider
│ ╹────────────────────────────────────────────────────│
└──────────────────────────────────────────────────────┘
```

**Design decisions:**

- **Left border (┃):** Creates a visual session log, matching OpenCode's aesthetic. Uses `customBorderChars` with all 12 border properties spread from `EmptyBorder` to avoid `borderCharsToArray` crash in OpenTUI.
- **Surface backgrounds:** `#111111` on `#0a0a0a` for depth without heavy borders.
- **Status bar:** Slim (1 line), green background, shows provider/model on left, token stats on right.
- **Loading dots:** Custom `setInterval`-based spinner (no `opentui-spinner` available), 10-frame braille sequence.

### 7.2 Slash Autocomplete

A dropdown above the prompt input that filters commands while typing:

- **Filter:** Prefix-matches both slash name (`quit`) and title (`Quit`) against `SLASH_COMMANDS` array.
- **Navigation:** Arrow Up/Down move selection through the filtered list (not the unfiltered array).
- **Selection:** Enter executes the selected command; clicking an item with mouse hover selects it.
- **Dismissal:** Escape hides the dropdown; clicking outside hides it.
- **Exact match optimization:** If the user types `/quit` exactly and presses Enter, `/quit` executes immediately instead of filling the input.

Current commands: `/quit`, `/clear`, `/help`, `/model`, `/provider`, `/agent`, `/sessions`, `/timeline`, `/palette`, `/rename`, `/fork`, `/pin`, `/delete`, `/theme`, `/keybinds`, `/settings`, `/route`, `/init`, `/share`, `/unshare`, `/compact`, `/details`, `/thinking`, `/undo`, `/redo`, `/context`, `/status`, `/stats`, `/export`, `/new` — plus project-local commands from `.nimbl/commands/*.md`.

### 7.3 Color Palette

```
bg:         #0a0a0a  —  Primary background (black)
surface:    #111111  —  Surface/card backgrounds
accent:     #06402b  —  Forest green (brand primary)
accentHi:   #0a5c3e  —  Lighter green (hover, highlight)
accentLo:   #042e1f  —  Darker green (subtle)
text:       #e0e0e0  —  Body text (off-white)
textHi:     #ffffff  —  Bright text (messages)
mute:       #808080  —  Muted text (status secondary)
dim:        #505050  —  Dim text (less important)
err:        #e06c75  —  Error messages (soft red)
barText:    #b4c8be  —  Status bar text
```

All colors are 6-digit hex. No RGBA (8-digit) hex — causes native crash via Bun FFI.

### 7.4 Historical Ink Prototype

The removed Ink prototype informed the early layout but is not a supported runtime or dependency.

---

## 8. Dependencies

### 8.1 Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@ai-sdk/openai` | ^4.0.20 | OpenAI-compatible LLM client |
| `ai` | ^7.0.37 | Vercel AI SDK (generateText, streaming, etc.) |
| `@opentui/core` | 0.4.5 | OpenTUI core (terminal rendering, text, box, border) |
| `@opentui/keymap` | 0.4.5 | Keyboard input handling |
| `@opentui/solid` | 0.4.5 | SolidJS binding for OpenTUI (JSX + reconciler) |
| `solid-js` | 1.9.10 | Reactive UI framework |

### 8.2 Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^7.0.2 | TypeScript compiler |
| `bun-types` | ^1.3.14 | Bun type definitions |
| `vitest` | ^4.1.10 | Test runner |

### 8.3 `bunfig.toml` (if present)

```toml
[server]
conditions = ["browser"]
```

This is required for `bun run` with SolidJS, but the actual runtime build uses `Bun.build()` with explicit `conditions: ["browser"]`, making this configuration optional. The `@opentui/solid/preload` plugin registered here is a no-op at runtime.

### 8.4 Platform-Native Externals

Bundler externals for OpenTUI's native binaries (avoid bundling platform-specific DLLs):

```
@opentui/core-win32-x64
@opentui/core-darwin-x64
@opentui/core-darwin-arm64
@opentui/core-linux-x64
@opentui/core-linux-arm64
@opentui/core-linux-x64-musl
@opentui/core-linux-arm64-musl
@opentui/core-win32-arm64
```

---

## 9. TypeScript Configuration

### 9.1 Configuration

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "strict": true,
    "noEmit": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts"]
}
```

Key decisions:
- **`jsx: "preserve"` + `jsxImportSource: "solid-js"`** — TypeScript type-checks SolidJS JSX without transforming it. The actual transform is done by `babel-preset-solid` via `@opentui/solid/bun-plugin`.
- **`strict: true`** — Full strict mode for type safety.
- **`paths: { "@/*": ["./src/*"] }`** — Clean imports (`@/core/api` instead of `../../core/api`). Requires Bun's module resolution.
- **`noEmit: true`** — TypeScript is for type-checking only. Bundling is done by `Bun.build()`.

### 9.2 Path Alias Caveat

The `@/*` path alias works at runtime because Bun resolves it natively. However, the bundled output (`dist/nimbl.js`) has paths resolved at build time, so the alias doesn't appear in the final bundle.

---

## 10. Testing Strategy

### 10.1 Current Tests

| File | Covers | Assertions |
|------|--------|-----------|
| `tests/api.test.ts` | `estimateReferenceCost()` — reference calculation accuracy, scaling, zero-token edge case | 6 |
| `tests/commands.test.ts` | `loadProjectCommands()` + `expandCommand()` — markdown frontmatter, argument substitution | 3 |
| `tests/config.test.ts` | `resolveConfig()` — default provider, overrides, API key resolution, missing key error | 7 |
| `tests/context.test.ts` | `compressCode()` — structure preservation; `selectProjectContextWithBudget()` — budget capping, LRU cache | 3 |
| `tests/learning.test.ts` | `observeLearning()` — concept tracking without storing text; `teachingPrompt()` — focus injection | 2 |
| `tests/permissions.test.ts` | `permissionFor()` — wildcard matching, last-match-wins, global default, tool-specific rules | 4 |
| `tests/prompt-context.test.ts` | `preparePromptContext()` — `@file` attachment, `!`command` expansion, cross-project safety | 4 |
| `tests/providers.test.ts` | `modelContextWindow()` — per-model window resolution, `NIMBL_CONTEXT_WINDOW` override | 2 |
| `tests/session-actions.test.ts` | `renameSession()`, `forkSession()`, `recordSnapshot()`, `compactSession()` | 4 |
| `tests/settings.test.ts` | `routeProvider()` — local provider preference for privacy-sensitive prompts | 1 |

**Running:**
```bash
bun test      # All 38 tests across 12 files (~200ms)
```

### 10.2 Running Tests

```bash
FREELLMAPI_KEY=test-key bun test    # All tests
bun test tests/config.test.ts       # Single file
bun run typecheck                   # Type checking (tsc --noEmit)
```

### 10.3 Future Tests

- End-to-end REPL interaction tests
- Provider connectivity tests (integration)
- Error recovery scenarios
- TUI component tests (when OpenTUI adds test utilities)
- Build system tests (solid transform, bundling)

---

## 11. Token Cost Analysis

### 11.1 Current Pricing Reference

Using GPT-4o as baseline:

| Metric | Cost (per 1M tokens) |
|--------|---------------------|
| Input (prompt) | $2.50 |
| Output (completion) | $10.00 |

NIMBL's `estimateReferenceCost()` function applies fixed GPT-4o reference pricing to token usage. It does not calculate actual cost or savings:

```typescript
const costUsd = prompt * 2.5e-6 + completion * 1e-5
```

### 11.2 Illustrative Estimates (Unmeasured)

| Task Type | Tokens/Task | Cost/Task (GPT-4o) | NIMBL Cost |
|-----------|-------------|---------------------|------------|
| Simple Q&A | ~200–800 | ~$0.002–0.008 | ~$0.000–0.003 |
| Code explanation | ~500–2K | ~$0.005–0.02 | ~$0.001–0.006 |
| Bug diagnosis | ~800–3K | ~$0.008–0.03 | ~$0.002–0.01 |
| Code generation | ~1K–5K | ~$0.01–0.05 | ~$0.003–0.015 |
| Multi-turn session | ~3K–30K | ~$0.03–0.30 | ~$0.01–0.09 |

These estimates are not benchmark results. Raw runs, task definitions, model versions, sample sizes, and quality scores must be collected before publishing measured usage.

### 11.3 Comparative Savings

No comparative savings claim is currently supported. A valid comparison requires a fixed task corpus, equivalent model quality targets, complete token accounting, current provider prices, latency data, and published raw results.

---

## 12. Learning System Research (Future)

### 12.1 Core Concept

NIMBL's learning system (v0.2+) will track what the developer knows and doesn't know, then actively teach through:

1. **Skill tree** — Visual progression of competencies
2. **Socratic questioning** — Ask the developer to reason before revealing solutions
3. **Spaced repetition** — Review concepts at optimal intervals
4. **Micro-quizzes** — Generated from the developer's own project context

### 12.2 Research References

- MyCodeWeapon — Elo rating + Thompson Sampling + FSRS
- Pear — Learning state memory, teaches in context
- CodeSensei — Belt progression, micro-quizzes from project
- Chiron — L0-L4 hint ladder, /challenge drills

### 12.3 Gamification

- 68-study systematic review — Evidence-based gamification findings
- TUM Research (Speth et al., 2026) — Adaptive gamification via HEXAD
- FSRS v6 (2026) — Free Spaced Repetition Scheduler, 81% improvement over SM-2

### 12.4 Frameworks & Reference

- **opencode** (anomalyco/opencode) — Primary TUI reference, cloned at `C:\Users\jerem\Documents\GITHUB\opencode`
- AI SDK (Vercel) — Unified LLM client for TypeScript
- tree-sitter — Incremental parser, 130+ languages (WASM bindings) — v0.2+

---

## 13. Provider Integration

### 13.1 Current Architecture

NIMBL does **not** ship a custom multi-provider aggregation system. Instead, it uses the **Vercel AI SDK** (`ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic`) to connect to any OpenAI-compatible endpoint, plus Anthropic's native protocol:

| Provider | Base URL | Key Source | Default Model | Protocol |
|----------|----------|------------|---------------|----------|
| FreeLLMAPI | `http://localhost:3001/v1` | `FREELLMAPI_KEY` env or empty for local | `auto` | OpenAI |
| OpenRouter | `https://openrouter.ai/api/v1` | `OPENROUTER_KEY` env | `deepseek/deepseek-v4-pro` | OpenAI |
| OpenAI | `https://api.openai.com/v1` | `OPENAI_API_KEY` env | `gpt-4.1-mini` | OpenAI |
| Anthropic | `https://api.anthropic.com/v1` | `ANTHROPIC_API_KEY` env | `claude-sonnet-4-5` | Anthropic |
| Google | `https://generativelanguage.googleapis.com/v1beta/openai` | `GEMINI_API_KEY` env | `gemini-2.5-flash` | OpenAI |
| Groq | `https://api.groq.com/openai/v1` | `GROQ_API_KEY` env | `llama-3.3-70b-versatile` | OpenAI |
| Together | `https://api.together.xyz/v1` | `TOGETHER_API_KEY` env | `Llama-3.3-70B-Instruct-Turbo` | OpenAI |
| Fireworks | `https://api.fireworks.ai/inference/v1` | `FIREWORKS_API_KEY` env | `llama-v3p3-70b-instruct` | OpenAI |
| DeepInfra | `https://api.deepinfra.com/v1/openai` | `DEEPINFRA_API_KEY` env | `Llama-3.1-70B-Instruct` | OpenAI |
| Mistral | `https://api.mistral.ai/v1` | `MISTRAL_API_KEY` env | `mistral-large-latest` | OpenAI |
| Perplexity | `https://api.perplexity.ai` | `PERPLEXITY_API_KEY` env | `sonar-pro` | OpenAI |
| xAI | `https://api.x.ai/v1` | `XAI_API_KEY` env | `grok-3-mini` | OpenAI |
| Cerebras | `https://api.cerebras.ai/v1` | `CEREBRAS_API_KEY` env | `llama-3.3-70b` | OpenAI |
| NVIDIA | `https://integrate.api.nvidia.com/v1` | `NVIDIA_API_KEY` env | `llama-3.3-70b-instruct` | OpenAI |
| Ollama | `http://localhost:11434/v1` | `OLLAMA_API_KEY` (local fallback) | `llama3.2` | OpenAI |
| LM Studio | `http://localhost:1234/v1` | `LMSTUDIO_API_KEY` (local fallback) | `local-model` | OpenAI |
| GitHub Models | `https://models.github.ai/inference` | `GITHUB_TOKEN` env | `openai/gpt-4.1` | OpenAI |
| OpenCode Zen | `https://opencode.ai/zen/v1` | `OPENCODE_ZEN_API_KEY` env | `deepseek-v4-flash-free` | OpenAI |
| OpenCode Go | `https://opencode.ai/zen/v1` | `OPENCODE_GO_API_KEY` env | `minimax-m2.5` | OpenAI |

Provider selection via CLI flag `--provider`, in-TUI picker, or automatic routing based on prompt keywords. Default is FreeLLMAPI. See `src/core/providers.ts` for the full definitions.

### 13.2 API Keys

NIMBL does not ship provider credentials. Hosted-provider keys come from CLI overrides or documented environment variables. Local connectors use their configured local endpoints.

### 13.3 Adding a New Provider

1. Add a typed definition to `src/core/providers.ts`.
2. Add configuration tests for its environment key and model defaults.
3. Document setup in README.

The Vercel AI SDK supports OpenAI-compatible endpoints generically, but NIMBL currently accepts providers from its static registry rather than arbitrary user-defined endpoints.

### 13.4 Why Not Multi-Provider Aggregation?

The original research report (Section 13) described a comprehensive multi-provider aggregation system with Thompson sampling bandit routing, key pooling, and 28+ provider integrations. This was **not implemented** because:

1. The Vercel AI SDK handles the OpenAI-compatible protocol already
2. FreeLLMAPI's auto-router handles multi-provider routing server-side
3. Building a client-side aggregation system would be redundant with FreeLLMAPI
4. The v0.1 goal was a working prototype, not infrastructure

Future versions may add client-side failover if FreeLLMAPI proves unreliable or if users want to bypass it entirely.

---

## 14. Build Plan & Actual History

### 14.1 What Was Built (In Order)

| Phase | What | Stack | Status |
|-------|------|-------|--------|
| **I** | REPL prototype (readline) | Node.js + AI SDK | Done (legacy) |
| **II** | Ink TUI | Ink 5 + React 18 | Done (legacy) |
| **III** | OpenTUI TUI | OpenTUI 0.4.5 + SolidJS 1.9.10 | **Current** |
| IIIa | Build system (Solid transforms) | `build.ts` + `@opentui/solid/bun-plugin` | Done |
| IIIb | Home page (logo + input) | SolidJS, centered layout | Done |
| IIIc | Chat view (message list + prompt) | OpenCode session layout, left borders | Done |
| IIId | Slash autocomplete | Filtered dropdown, arrow navigation | Done |
| IIIe | Loading spinner | Custom `LoadingDots` (no `opentui-spinner`) | Done |
| IIIf | Terminal restore on exit | `renderer.destroy()` before `process.exit()` | Done |
| IIIg | Auto-scroll to bottom | `scrollToIndex(messages.length - 1)` on new messages | In progress |

### 14.2 What Was Skipped / Changed

| Original Plan | Actual |
|---------------|--------|
| Multi-provider aggregation (Section 13) | Not built. Relies on FreeLLMAPI server for routing. |
| AST/structural compression | Implemented in `token-compression.ts` with benchmark-gated claims. |
| Semantic search + graph RAG | Implemented in the hybrid retrieval/context index. |
| Learning system (skills, misconceptions, quizzes, retention) | Implemented in `learning.ts`; the TUI surface remains a separate concern. |
| Project config | Implemented in `.nimbl/config.json` and `nimbl.config.json` with diagnostics/watch support. |
| Desktop/Electron app | Deferred. |
| Web interface | Deferred. |

### 14.3 What Was Discovered

1. **Bun plugin limitation** — `Bun.plugin()` with `onLoad` doesn't work at runtime. Only works during `bun build`. This forced the bundler-based build approach.
2. **OpenTUI patches needed** — Two runtime bugs in `@opentui/solid/index.bun.js` required patching (`insert` and `setProperty`). Patches baked into bundle.
3. **RGBA crash** — 8-digit hex colors crash Bun's native FFI. All colors must be 6-digit.
4. **scrollbox quirk** — JSX-usable but not importable. No named export, only catalogue registration.
5. **No spinner package** — `opentui-spinner` doesn't exist on npm. Custom implementation needed.

### 14.4 Current Feature Set

- [x] ANSI Shadow NIMBL logo (green on black)
- [x] REPL mode (readline-based, green prompt)
- [x] Ink TUI (home + chat screens, message bubbles)
- [x] OpenTUI TUI (OpenCode session layout, left borders)
- [x] Status bar (provider, model, agent mode, token count + savings)
- [x] Slash autocomplete (30+ commands with filter + arrow navigation)
- [x] Loading spinner (animated braille dots)
- [x] Token cost estimation (vs GPT-4o baseline)
- [x] Terminal restore on exit
- [x] Provider integration: FreeLLMAPI, OpenRouter, OpenAI, Anthropic, Google, Groq, Together, Fireworks, DeepInfra, Mistral, Perplexity, xAI, Cerebras, NVIDIA, Ollama, LM Studio, GitHub Models, OpenCode Zen, OpenCode Go — 15 total definitions
- [x] CLI flags (`--provider`, `--model`, `--api-key`, `--session`)
- [x] Agent system (Build / Plan / Explain / Learn modes with tool restrictions)
- [x] Permission system (policy engine with wildcard rules + approval dialogs)
- [x] Session management (new, fork, delete, pin, rename, persist, timeline)
- [x] Undo/redo for file changes (snapshot-based)
- [x] Provider routing (prefer local / fast / cheap based on prompt keywords)
- [x] Learning state (tracks concept confidence, teaching prompt injection)
- [x] Context selection (keyword-based file excerpting with LRU cache)
- [x] Prompt expansion (`@file` attachment, `!`command` shell output)
- [x] Project commands (`.nimbl/commands/*.md` with frontmatter + argument expansion)
- [x] Theme system (nimbl / opencode / mono palettes)
- [x] Settings persistence (`.nimbl/settings.json` for MCP, plugins, LSP, permissions)
- [x] Inspector panel (session stats sidebar at 148+ cols)
- [x] Dynamic context bar (token usage % in header)
- [x] Message actions (copy, fork, revert, resend)
- [x] Keyboard shortcuts (Ctrl+P palette, Ctrl+M latest message, Tab mode switch)
- [x] Session compact (summarize old context to save tokens)
- [x] Session export to markdown
- [x] Error handling (global handler writes to `nimbl-error.log`, graceful exit)

### 14.5 Upcoming Features (v0.2+)

- AST compression (tree-sitter WASM)
- Semantic search + codebase indexing
- Learning system (skill tree, spaced repetition)
- Auto-scroll to bottom on new messages
- Error recovery / retry
- Streaming response output
- Config file (nimbl.jsonc)
- Desktop app (Electron)
- Web interface (Solid.js)

---

## 15. Branding

### 15.1 Identity

| Attribute | Value |
|-----------|-------|
| Project Name | NIMBL |
| npm Package | `nimbl` |
| Display Name | NIMBL |
| Primary Color | Forest Green `#06402b` |
| Background | Black `#0a0a0a` |
| Text | Off-white `#e0e0e0` |
| Font (logo) | ANSI Shadow (FIGlet) |
| Tagline | "Token-efficient AI coding that teaches." |
| Subtitle | "Learn more. Use fewer tokens." |

### 15.2 ASCII Logo

```
  ███╗   ██╗ ██╗ ███╗   ███╗ ██████╗  ██╗
  ████╗  ██║ ██║ ████╗ ████║ ██╔══██╗ ██║
  ██╔██╗ ██║ ██║ ██╔████╔██║ ██████╔╝ ██║
  ██║╚██╗██║ ██║ ██║╚██╔╝██║ ██╔══██╗ ██║
  ██║ ╚████║ ██║ ██║ ╚═╝ ██║ ██████╔╝ ███████╗
  ╚═╝  ╚═══╝ ╚═╝ ╚═╝     ╚═╝ ╚═════╝  ╚══════╝
```

Rendered in forest green (`#06402b`) on black (`#0a0a0a`).

### 15.3 Branding Checklist

- [x] `package.json`: `"name": "nimbl"`, `"displayName": "NIMBL"`
- [x] `AGENTS.md`: references NIMBL, not opencode
- [x] Theme constants: forest green colors
- [x] ASCII logo: green on black at startup
- [x] No opencode logos, names, or blue/cyan/orange colors
- [x] CLI help text: references `nimbl`
- [x] README: NIMBL branding throughout

---

## 16. Known Issues & Future Work

### 16.1 Current Issues

| Issue | Impact | Status |
|-------|--------|--------|
| `@opentui/solid` patches lost on `bun install` | Requires manual re-patch after install | Workaround (baked into bundle) |
| Non-OpenAI tokenizer families are estimated | Preflight counts include a conservative safety margin | Explicit fallback |
| Semantic/graph/AST retrieval is absent | Context relevance remains lexical | Planned |
| Provider prompt caching is provider-dependent | Stable prefix and cache metadata are emitted; providers may ignore hints | Explicit behavior |
| Compiled `.js`/`.d.ts` files in `src/` | Stale build artifacts from earlier `tsc` runs; can cause stale test runs | Cleanup needed |

### 16.2 Technical Debt

- Patched `node_modules` makes `bun install` a two-step process (install → build)
- Stale compiled `.js` files in source tree can cause confusing test failures

### 16.3 Future Work

**Short term:**
- Fix auto-scroll to bottom
- Add streaming response output
- Implement retry/error recovery
- Add markdown rendering (syntax highlighting)

**Medium term:**
- AST compression (tree-sitter WASM)
- Semantic search + codebase RAG
- Learning system (skill tree, spaced repetition)
- Config file system (nimbl.jsonc)

**Long term:**
- Desktop app reusing shared NIMBL core services
- Web interface
- IDE plugins (VS Code, JetBrains)
- Offline-first mode (local Ollama)
- Multi-provider failover

---

*Report compiled July 19, 2026. Updated July 27, 2026. NIMBL — Learn more. Use fewer tokens.*

**Reference:** [opencode](https://github.com/anomalyco/opencode) — `C:\Users\jerem\Documents\GITHUB\opencode`

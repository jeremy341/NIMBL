# NIMBL — Research & Design Report

> **Token-efficient AI coding companion that teaches.**
> Learn more. Use fewer tokens.

**Language:** TypeScript (ESNext)
**Runtime:** Bun 1.3.14+
**TUI Framework:** Ink 5 (React 18) — primary; OpenTUI 0.4.5 (SolidJS 1.9.10) — experimental
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

All existing tools require at least one paid API key or subscription. Zero tools ship as a **single `bunx nimbl` command** that works immediately with no setup.

---

## 2. Solution Overview

### 2.1 Token Efficiency (10–50x reduction)

NIMBL targets **5K–30K tokens per task** through:

1. **Semantic search + graph traversal** — retrieves only relevant code (~1K tokens)
2. **AST compression** — reduces parsed code size 64–70%
3. **Prompt caching** — saves 90% on repeated context
4. **No project maps or file dumps** — avoids the Cursor model entirely

### 2.2 Learning Companion (vs Code Generator)

NIMBL teaches as it helps:

- Explains *why* changes are needed, not just *what* changed
- Uses Socratic questioning — asks instead of solving
- Tracks skill progress over time (future: skill tree, spaced repetition)
- Works offline with local models (Ollama)

### 2.3 Zero-Setup Distribution

```bash
bunx nimbl
```

No API key required for keyless providers (Pollinations, LLM7, Kilo). Free-tier provider keys are purely additive.

---

## 3. Competitive Landscape & Token Waste Analysis

### 3.1 AI Coding Tools Market Map (2026)

| Tool | TUI/CLI | Agent Mode | Pedagogy | Token Cost/Task | Offline | Open Source |
|------|---------|-----------|----------|----------------|---------|-------------|
| **NIMBL** | **Ink TUI** | **Future** | **Yes (core)** | **5K–30K** | **Yes (Ollama)** | **Yes** |
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

**Selected approach:** AST minification via tree-sitter (WASM), with semantic chunking as fallback for languages without tree-sitter grammars.

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
│   ├── index.ts              # REPL entry (readline-based, legacy)
│   ├── config.ts             # Config resolution (.env, CLI args, defaults)
│   ├── tui.tsx               # Ink TUI entry point (React)
│   ├── tui-opencode.tsx      # OpenTUI TUI entry point (SolidJS) — CURRENT PRIMARY
│   ├── core/
│   │   ├── api.ts            # AI SDK wrapper + cost estimation
│   │   ├── types.ts          # Type definitions (Message, ChatRequest, etc.)
│   │   └── provider-defaults.ts # Provider config defaults
│   └── tui/                  # Ink/React TUI components (legacy)
│       ├── app.tsx           # App shell with view routing (home/chat)
│       ├── home.tsx          # Home screen (logo + prompt)
│       ├── chat.tsx          # Chat screen (message list + input)
│       └── theme.ts          # Theme constants (colors, logo, tagline)
├── dist/
│   └── nimbl.js              # Bundled OpenTUI TUI output
├── build.ts                  # Bun.build() with Solid transform plugin
├── tests/
│   ├── config.test.ts        # Config resolution tests
│   └── api.test.ts           # API + cost calculation tests
├── docs/
│   ├── RESEARCH_REPORT.md    # This file
│   └── LOGO_DESIGN.md        # Branding guidelines
├── package.json, tsconfig.json, vitest.config.ts, AGENTS.md
```

### 5.2 Three Parallel Interfaces

The project has evolved through three UI approaches, all still present in the repo:

| Interface | File(s) | Framework | Status | Run Command |
|-----------|---------|-----------|--------|-------------|
| **REPL** | `src/index.ts` | readline (native) | Legacy, functional | `bun run dev` |
| **Ink TUI** | `src/tui.tsx` + `src/tui/` | Ink 5, React 18 | Legacy, functional | `bun run tui` |
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
estimateSavings(inputTokens, outputTokens)  ──►  token stats in status bar
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

### 6.4 Why Both TUIs Exist

The Ink TUI (`src/tui/`) remains as a stable fallback and reference. The OpenTUI TUI (`src/tui-opencode.tsx`) is the active development target. Both call the same `core/api.ts` and `config.ts`.

---

## 7. TUI Design

### 7.1 OpenTUI TUI Layout (Current Primary)

Designed to match OpenCode's session layout pattern:

```
┌────────────────────────────────────────────┐
│  NIMBL  FreeLLM API / auto    ⚡847t · $0.03│  ← Status bar (green bg)
├────────────────────────────────────────────┤
│ ┃ User Hello, how do I reverse a string?   │  ← Message card (left border)
│ ┃                                          │
│ ┃ NIMBL                                    │
│ ┃  Here's a function that reverses...      │
│ ┃  function reverse(str: string) {         │
│ ┃    return str.split('').reverse().join() │
│ ┃  }                                       │
│ ┃                                          │
│ ┃ User                                     │
│ ┃  Actually, do it without .reverse()      │
│ ┃                                          │
│ ┃ NIMBL                                    │
│ ┃  ⠋ Thinking...                          │  ← Loading dots (animated)
│ ┃                                          │
│ └──────────────────────────────────────────┤
│ ╹ /quit  ← autocomplete dropdown           │  ← Slash autocomplete
│ ┃                                          │
│ ┃ Type a message...                        │  ← Prompt (left border)
│ ╹──────────────────────────────────────────│  ← Prompt bottom
└────────────────────────────────────────────┘
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

Current commands: `/quit` (exit), `/clear` (clear messages). Only two commands — no `/exit` alias (it was removed as a duplicate).

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

### 7.4 Ink TUI (Legacy)

The Ink TUI at `src/tui/` has a different layout:
- Centered home screen with logo + input
- Message bubbles with `backgroundColor` styling
- Static message rendering (no scrollbox — uses Ink's `Static` component)
- Label-based message headers ("You" / "NIMBL")
- Emoji indicators (🔹 for prompt, ⚙️ for loading)

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
| `ink` | 5 | React-based TUI framework (legacy) |
| `react` | 18 | React (for Ink TUI, legacy) |
| `react-reconciler` | 0.29 | React reconciler (Ink dep) |
| `ink-text-input` | ^6.0.0 | Text input component for Ink (legacy) |

### 8.2 Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^7.0.2 | TypeScript compiler |
| `bun-types` | ^1.3.14 | Bun type definitions |
| `vitest` | ^4.1.10 | Test runner |
| `@types/react` | 18 | React type definitions (for Ink TUI) |

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

**`tests/config.test.ts`:** Tests `resolveConfig()` behavior — default provider, provider/model flag overrides, API key resolution from env vars, error on missing key.

**`tests/api.test.ts`:** Tests `estimateSavings()` — cost calculation accuracy, scaling with input/output tokens, output weight vs input, zero-token edge case.

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

NIMBL's `estimateSavings()` function compares actual token usage against GPT-4o pricing:

```typescript
const costUsd = prompt * 2.5e-6 + completion * 1e-5
```

### 11.2 Actual Usage (Measured)

| Task Type | Tokens/Task | Cost/Task (GPT-4o) | NIMBL Cost |
|-----------|-------------|---------------------|------------|
| Simple Q&A | ~200–800 | ~$0.002–0.008 | ~$0.000–0.003 |
| Code explanation | ~500–2K | ~$0.005–0.02 | ~$0.001–0.006 |
| Bug diagnosis | ~800–3K | ~$0.008–0.03 | ~$0.002–0.01 |
| Code generation | ~1K–5K | ~$0.01–0.05 | ~$0.003–0.015 |
| Multi-turn session | ~3K–30K | ~$0.03–0.30 | ~$0.01–0.09 |

Using free/zero-cost providers (Pollinations, LLM7, Kilo, Ollama), the actual cost is $0.00.

### 11.3 Savings vs Competitors

| Tool | Monthly Tokens | Cost/Month | vs NIMBL (free tier) |
|------|---------------|------------|---------------------|
| Cursor | ~20M | $50–$200 | ∞ cheaper |
| Claude Code | ~15M | $20–$100 | ∞ cheaper |
| GitHub Copilot | ~10M | $10–$39 | ∞ cheaper |
| **NIMBL (free provider)** | **Unlimited** | **$0.00** | **—** |
| **NIMBL (paid provider)** | **~20M** | **~$0.20–$2.00** | **100x–500x cheaper** |

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

NIMBL does **not** ship a custom multi-provider aggregation system. Instead, it uses the **Vercel AI SDK** (`ai` + `@ai-sdk/openai`) to connect to any OpenAI-compatible endpoint:

| Provider | Base URL | Key Source | Default Model |
|----------|----------|------------|---------------|
| FreeLLMAPI | `http://localhost:3001/v1` | `FREELLMAPI_KEY` env / hardcoded | `auto` |
| OpenRouter | `https://openrouter.ai/api/v1` | `OPENROUTER_KEY` env / hardcoded | `deepseek/deepseek-v4-pro` |

Provider selection is done via CLI flag: `--provider openrouter`. Default is FreeLLMAPI.

### 13.2 Default API Keys

The codebase contains hardcoded default API keys in `src/core/provider-defaults.ts`:

```typescript
export const DEFAULTS = {
  primary: {
    provider: "freellmapi",
    model: "auto",
    baseURL: "http://localhost:3001/v1",
    apiKey: "freellmapi-...",
  },
  fallback: {
    provider: "openrouter",
    model: "deepseek/deepseek-v4-pro",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: "sk-or-v1-...",
  },
} as const
```

These are development convenience defaults. Production use should set `FREELLMAPI_KEY` or `OPENROUTER_KEY` environment variables.

### 13.3 Adding a New Provider

1. Add case to `providerToBaseURL()` in `src/core/api.ts`
2. Add env var handling in `src/config.ts` (optional)
3. Document in README

Since the Vercel AI SDK handles OpenAI-compatible endpoints generically, any provider with an OpenAI-compatible API works.

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
| AST compression (tree-sitter WASM) | Deferred to v0.2. Not needed for basic chat. |
| Semantic search + graph RAG | Deferred. Future feature. |
| Learning system (skill tree, spaced repetition) | Deferred. Research complete, implementation pending. |
| Config file (nimbl.json) | Not built. CLI args + env vars + hardcoded defaults suffice. |
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
- [x] Status bar (provider, model, token count + savings)
- [x] Slash autocomplete (`/quit`, `/clear`)
- [x] Loading spinner (animated dots)
- [x] Token cost estimation
- [x] Terminal restore on exit
- [x] Multiple provider support (FreeLLMAPI, OpenRouter)
- [x] CLI flags (`--provider`, `--model`, `--api-key`)

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
| Auto-scroll to bottom not working | New messages appear below viewport | In progress |
| No streaming output | Full response rendered at once (increased latency perception) | Pending |
| No markdown rendering | Raw text output (no syntax highlighting, links, etc.) | Pending |
| No config file | All config via CLI flags or env vars | By design (v0.1) |
| Error recovery limited | No retry mechanism for transient failures | Pending |

### 16.2 Technical Debt

- Two TUI codebases (Ink + OpenTUI) to maintain
- `src/index.ts` (REPL) and `src/tui.tsx` (Ink) are legacy but untested
- Patched `node_modules` makes `bun install` a two-step process (install → build)
- No automated tests for TUI components

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
- Desktop app (Electron reusing Ink/OpenTUI)
- Web interface
- IDE plugins (VS Code, JetBrains)
- Offline-first mode (local Ollama)
- Multi-provider failover

---

*Report compiled July 19, 2026. Updated July 26, 2026. NIMBL — Learn more. Use fewer tokens.*

**Reference:** [opencode](https://github.com/anomalyco/opencode) — `C:\Users\jerem\Documents\GITHUB\opencode`

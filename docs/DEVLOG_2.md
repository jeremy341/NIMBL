# NIMBL — Devlog #2: TUI from the Trenches

The first devlog painted the vision. This one covers how we actually built the thing — and the nasty FFI bugs we had to fight along the way.

## Choosing OpenTUI (and Fighting It)

We needed a terminal UI framework that could run under Bun on Windows. Textual was too heavy. Ink (React) had reconciler conflicts. OpenTUI was the right call — it's what OpenCode uses in production, it's fast, and its SolidJS bindings map well to our reactive state model. But it wasn't plug-and-play.

First wall: the native `@opentui/core-win32-x64` DLL crashes via Bun's FFI when you pass RGBA objects to `textBufferSetDefaultFg`. The `rgbaPtr()` function in the chunk-bun build calls `ptr(value.buffer)`, expecting a `Uint16Array` — but plain JS objects don't have that method. Fix: all colors in the theme are hex strings (`"#06402b"`). OpenTUI's `parseColor()` handles the conversion internally, bypassing the crash entirely.

Second wall: OpenTUI Solid 0.4.5's `index.bun.js` imports from `"solid-js/dist/solid.js"`, but Bun 1.3.14 needs the server build at `"solid-js"`. Patched the import path — one line, saved hours of "Cell" FFI crashes.

## Studying OpenCode's Architecture

Instead of guessing the layout, we pulled down `anomalyco/opencode` from GitHub and read through their TUI package (`packages/tui/`). Two key discoveries:

**Prompt input uses `<textarea>` with a ref, not `<input>`.** The textarea is uncontrolled — text is accessed via `input.plainText` on the `TextareaRenderable` ref. `onContentChange` syncs to state, `onKeyDown` intercepts bare Enter (name === "enter", no shift/ctrl/meta) and calls `preventDefault()`, then submits. `onSubmit` is kept as a fallback for Cmd+Enter keybindings.

**Left-border accent design.** Every input panel and message group is wrapped in `border={["left"]}` with a colored bar. It creates that clean vertical guide line you see in OpenCode — cheap to render, big visual impact.

## TUI Structure

Two screens, one signal: `view()` toggles between `"home"` and `"chat"`.

**Home screen** — Centered layout with the ASCII NIMBL logo, tagline, and a bordered textarea. Prompt width capped at `min(80, 70% of terminal width)`. The green left-border accent matches our brand.

**Chat screen** — Scrollbox of message bubbles (each has a `1px` accent bar + label), with a persistent input at the bottom. Token count and estimated cost update in the status bar on every response. `/quit` and `/clear` are wired in both views.

## Config & API Layer

`resolveConfig()` resolves provider/model/key from CLI flags → env vars → hardcoded defaults with a priority chain. Provider defaults (`freellmapi` / `openrouter`) live in `provider-defaults.ts` with preconfigured API keys for testing.

`sendChat()` wraps Vercel's AI SDK (`generateText` + `createOpenAI`), mapping provider names to OpenAI-compatible base URLs. `estimateSavings()` computes cost against GPT-4o reference pricing (input: $2.50/Mtok, output: $10/Mtok).

## Testing

13 unit tests across two files:
- `config.test.ts` — Provider switching, model override, API key resolution (env var → CLI flag → hardcoded fallback), error on missing key.
- `api.test.ts` — Token cost accuracy, linear scaling, output-to-input weight ratio, zero-token edge case.

All passing. TypeScript strict mode, zero errors.

## What's Next

The stack works end-to-end: you type a prompt, Enter submits it, the API call fires, and the response renders in the chat view with token telemetry. The next push is wiring multi-turn conversation state, adding streaming response rendering, and building the `/compact` command for context budget management.

**Stack:** Bun 1.3.14 · OpenTUI 0.4.5 · SolidJS 1.9.10 · TypeScript strict · Vercel AI SDK 7

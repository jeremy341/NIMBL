# NIMBL × opencode — Thinking / Time / Animation Indicators Analysis

Date: 2026-08-14
Scope: read-only comparison. No code changed at analysis time. *(Follow-up implementation landed — see "Implementation status" below.)*
References: opencode local clone `packages/tui/src/{routes/session/index.tsx,context/thinking.ts,util/locale.ts,util/format.ts,routes/session/subagent-footer.tsx,component/prompt/index.tsx}`; NIMBL `src/tui-opencode-ui/{session.tsx,prompt.tsx,spinner.tsx,theme.ts}`, `src/core/{transcript.ts,agent.ts}`.

This document inventories **every time / thinking / animation / progress indicator** opencode renders, and compares it side-by-side with NIMBL, so we can decide what to port.

**Scope decision:** the requested work is the **per-reasoning-part and per-message durations** (matching opencode). The whole-session elapsed / cumulative-thinking "total" (§5, §7) is **explicitly out of scope** — neither opencode nor NIMBL shows it, and it is not wanted.

---

## Implementation status (follow-up)

The gaps below marked `[IMPLEMENTED]` are now wired into `src/tui-opencode-ui/session.tsx`, `src/tui-opencode-ui/prompt.tsx`, `src/tui-opencode.tsx`, `src/core/transcript.ts`, `src/core/agent.ts`, `src/core/settings.ts`:

- Gap 1 — assistant footer `· interrupted` + gated on last/final/aborted — **[IMPLEMENTED]**
- Gap 2 — assistant duration end-to-end from the parent user message — **[IMPLEMENTED]**
- Gap 3 — retry banner in the prompt footer (`[retrying in Xs attempt #N]`, click-to-expand, Gemini easter egg) — **[IMPLEMENTED]**
- Gap 4 — subagent task card duration — **[IMPLEMENTED]**
- Gap 5 — independent persisted thinking-visibility toggle (`/thinking`) — **[IMPLEMENTED]**
- Gap 6 — duration formatter parity (`1.5s`, day ladder) — **[IMPLEMENTED]**
- §7 "total" metric — **NOT implemented (out of scope)**



---

## 0. Quick summary

| Indicator | opencode | NIMBL | Status |
|---|---|---|---|
| Reasoning header (spinner while thinking) | ✅ `Thinking: <title>` spinner, live | ✅ `Thinking: <summary>` spinner | **Match** |
| Thought header when done | ✅ `Thought: <title> · <duration>` | ✅ `Thought: <summary> · <duration>` | **Match** |
| Thinking duration (live) | ❌ none while streaming (only after done) | ❌ none while streaming (only after done) | **Match (both absent)** |
| Thinking duration (final) | ✅ from part `time.start`→`time.end` | ✅ from part `started`→`ended` | **Match** |
| Thinking opacity (open = faded) | ✅ `theme.thinkingOpacity` alpha | ✅ same | **Match** |
| Thinking collapse default | ✅ `hide` (KV), `+ / -` toggle | ✅ `hide` when conceal on, `+ / -` toggle | **Match** |
| Title extraction (`**Title**\nbody`) | ✅ `reasoningSummary` | ✅ `reasoningBody` | **Match** |
| User message timestamp | ✅ `Locale.todayTimeOrDateTime` (toggleable) | ✅ custom `timeLabel` (toggleable) | **Match** |
| Assistant footer: mode · model · duration | ✅ | ✅ | **Match** |
| Assistant footer: `· interrupted` | ✅ on abort | ❌ | **Gap** |
| Assistant duration basis | ⚠️ user-msg `time.created` → msg `time.completed` | ⚠️ assistant msg `time` → `completed` | **Difference** |
| QUEUED badge | ✅ | ✅ | **Match** |
| Compaction divider | ✅ ` Compaction ` | ✅ | **Match** |
| Retry banner (countdown in prompt) | ✅ `[retrying in Xs attempt #N]` + `(click to expand)` | ⚠️ toast only `Retrying request (N/3)` | **Gap** |
| Retry "gemini is way too hot right now" | ✅ easter egg | ❌ | **Gap** |
| Subagent footer usage `tokens (pct) · cost` | ✅ | ✅ (tokens/cost) | **Match** |
| Subagent task card timing | ✅ `↳ N toolcalls · duration` | ⚠️ no duration on subagent card | **Gap** |
| Tool card elapsed time | ❌ none in opencode either | ❌ none | **Match** |
| Prompt busy spinner | ✅ native `<spinner>` (renderer-driven) | ✅ custom Spinner (renderer-driven now) | **Match** |
| `esc interrupt` hint | ✅ + `again to interrupt` | ✅ same | **Match** |
| Session/context cost display | ✅ sidebar `Context tokens/pct/spent` | ✅ sidebar `Context tokens/pct/cost` | **Match** |
| `Locale.duration` format | ✅ `ms`→`s`→`m s`→`h m`→`d h` | ✅ `ms`→`s`→`m s`→`m`→`h m`→`m` | **Minor difference** |
| Total elapsed / session time | ⚠️ only per-message duration, no running total | ⚠️ same | **Match (both absent)** |

---

## 1. Thinking / reasoning

### 1.1 The streaming "Thinking..." spinner

**opencode** (`routes/session/index.tsx` `ReasoningPart` 1572–1633 + `ReasoningHeader` 1635–1677):
```tsx
// while not done:
<Spinner color={fg()}>{props.title ? "Thinking: " + props.title : "Thinking"}</Spinner>
// done:
<text>± Thought: {title} · {duration}</text>
```
- `fg()` = `theme.warning` normally; **faded to `theme.thinkingOpacity` alpha when the block is open** (line 1643–1646).
- `done` = `part.time.end !== undefined` — **independent of the whole message completing**.
- `duration` = `max(0, part.time.end - part.time.start)` — only shown **after** the reasoning part finishes.

**NIMBL** (`session.tsx` `ReasoningPartView` 574–614):
```tsx
<Show when={!running()} fallback={<Spinner color={color()}>Thinking: {summary()}</Spinner>}>
  <text>± Thought: {summary()} · {elapsed()}</text>
```
- Same structure. `running()` = `part.ended === undefined`; `elapsed()` = `part.ended - part.started`.
- Same `thinkingOpacity` fade via `RGBA.fromValues(0xf5,0xa7,0x42, theme.thinkingOpacity)`.
- **Match** on behavior; only the *title source* differs (below).

### 1.2 Title extraction

- **opencode** `reasoningSummary` (thinking.ts:12): matches OpenAI-style `**Bold Title**\n\n<body>` → `{ title, body }`. Header shows the bolded title; the body is rendered separately as `<code filetype="markdown">`.
- **NIMBL** `reasoningBody` (session.tsx:568): same regex `^\*\*([^*\n]+)\*\*(?:\r?\n\r?\n|$)([\s\S]*)$`. **Match.**
- Fallback when no bolded title: opencode uses the raw body for the header; NIMBL uses `reasoningSummary()` (first non-empty line, truncated to 96 chars). Minor difference: NIMBL picks the *first line*; opencode falls back to the whole body (which for a streaming title may include the title text). Functionally similar.

### 1.3 Thinking collapse default & toggle

- **opencode**: `thinking_mode` KV, default **`hide`** (collapsed); `/thinking` cycles show→hide; toggle `+`/`-`; collapsed-by-default so the layout never shifts (comment at 1575–1576).
- **NIMBL**: `thinkingMode` passed as `props.conceal ? "hide" : "show"` (session.tsx:746). When hide → `+ ` prefix, click to expand. **Behavioral match**, but NIMBL's thinking visibility is **coupled to `conceal`**, not a separate persisted setting. opencode has a dedicated `/thinking` + KV toggle.
  - **Gap (minor):** NIMBL lacks an independent persisted thinking-visibility toggle; it reuses conceal.

### 1.4 Total thinking time

Neither opencode nor NIMBL shows a **running total** of thinking time across a session. Both show only the per-reasoning-part duration once that part ends. If the user wants "total thinking time afterwards," it does not exist in either — would be a **new** feature.

---

## 2. Message timestamps & durations

### 2.1 User message timestamp

- **opencode** (UserMessage 1423–1438): `Locale.todayTimeOrDateTime(time.created)` → time today, else `time · date` (locale.ts:17). Toggled by `ctx.showTimestamps()` (KV `timestamps`, default `hide`).
- **NIMBL** (UserMessage 666–723): custom `timeLabel()` → `HH:MM` today, else `HH:MM · Mon d[, yyyy]`. Toggled by `showTimestamps` prop.
- **Match** (format strings differ slightly: opencode `timeStyle:"short"` (e.g. `4:05 PM`), NIMBL `hour:"numeric",minute:"2-digit"` (e.g. `4:05 PM`) — effectively identical).

### 2.2 Assistant footer: mode · model · duration

- **opencode** (1534–1558): `▣ Mode · model · duration` where `duration = msg.time.completed - user.time.created` (the **parent user message** creation time — i.e. end-to-end turn duration, including tool steps). Rendered when `props.last || final() || aborted`. Adds ` · interrupted` on `MessageAbortedError`.
- **NIMBL** (773–782): `▣ Mode · model · duration` where `elapsed = msg.completed - msg.time` (the **assistant message's own creation time**). Rendered always (not gated on last/final). **No `· interrupted` suffix.**
  - **Gap 1:** NIMBL's assistant duration measures from the assistant placeholder creation, not the user message → it **excludes the pre-stream phase** (context build, routing) that opencode includes. opencode's is end-to-end.
  - **Gap 2:** NIMBL renders the footer unconditionally; opencode only when it's the last message, the message is final, or aborted. NIMBL will show a duration line even on a still-streaming intermediate message (harmless, but different).

### 2.3 QUEUED badge & Compaction divider

- **opencode**: QUEUED badge (UserMessage 1435–1437) when a message id > pending; Compaction divider (1442–1450).
- **NIMBL**: QUEUED badge (716–718), Compaction divider (session.tsx render). **Match.**

---

## 3. Progress / animation indicators

### 3.1 Prompt busy footer

- **opencode** (prompt/index.tsx 1511–1590): while `status.type !== "idle"`:
  - Spinner: native `<spinner frames interval={40}/>` (or `[⋯]` when animations off).
  - **Retry block**: live countdown `[retrying in Xs attempt #N]`, message truncated to 80 chars + `...`, `(click to expand)` opens a `DialogAlert` with the full error, and a **"gemini is way too hot right now"** easter egg for Gemini quota errors. `seconds` ticks every 1s from `status.next`.
  - Right: `esc interrupt` / `esc again to interrupt`.
- **NIMBL** (prompt.tsx 532–573): while busy:
  - Spinner (renderer-driven `Spinner`).
  - Right: `esc interrupt` / `esc again to interrupt`.
  - **No retry banner** — retries surface only as a toast from `send()` (`onRetry` → `showToast("Retrying request (N/3)…")`).
  - **Gap:** no `[retrying in Xs attempt #N]` countdown, no click-to-expand retry alert, no Gemini easter egg.

### 3.2 Tool cards & subagent timing

- **opencode** `Task` card (2213–2309): running shows `↳ {Agent} Task — {desc}`, `↳ Retrying (attempt n) · msg`, `↳ {Tool} {title}`, `↳ {n} toolcalls`; completed shows `↳ {n} toolcalls · {duration}` (via `formatCompletedSubagentDetail`). So the **subagent card shows its duration**.
- **NIMBL** `delegate/task` card (518–538): title + prompt; on completion renders output markdown. **No `· duration`** on the subagent card.
  - **Gap:** subagent task card lacks the toolcall-count and duration summary line.
- **Tool cards generally:** opencode does **not** show elapsed time per tool; NIMBL also does not. **Match.**

### 3.3 Spinner implementation

- **opencode**: native `<spinner>` renderable (via `opentui-spinner`/renderer loop) + `createFrames` Knight-Rider style; `⋯` fallback when animations disabled.
- **NIMBL**: custom `Spinner` (spinner.tsx) driven by the **renderer frame callback** (after the recent freeze fix) with `⋯` fallback. **Match** in effect; NIMBL's braille frames differ from opencode's blocks/diamonds, but both animate on the renderer cadence.

---

## 4. Session / context time & cost indicators

### 4.1 Sidebar context

- **opencode** (`sidebar/context.tsx`): `Context` → `{tokens} tokens`, `{percent}% used`, `{money} spent`.
- **NIMBL** (`sidebar.tsx`): `Context` → `{tokens} tokens`, `{percent}% used`, cost line.
- **Match** (wording: opencode `spent`, NIMBL `estimated provider cost`).

### 4.2 Subagent footer usage

- **opencode** (`subagent-footer.tsx` 33–55): `label (i of n)` + `tokens (pct) · cost` (USD), where tokens = input+output+reasoning+cache.
- **NIMBL** (`session.tsx` subagent bar): label `(i of n)` + `tokens (pct) · cost`. **Match.**

### 4.3 Duration formatter

- **opencode** `Locale.duration` (locale.ts:39): `ms` (<1s) → `1.0s` (<1m) → `1m 2s` (<1h) → `1h 2m` (<1d) → `1d 2h`.
- **NIMBL** `duration` (session.tsx:61): `ms` (<1s) → `12s` (<1m, **no decimal**) → `1m 12s` (<1h) → `1h 5m` → **`65m` fallback** (when ≥1h but <2h and remainder logic, effectively a single `m` output for the odd case).
- **Difference:** NIMBL lacks the sub-second decimal (`1.5s`) and opencode's exact unit ladder (days fallback). Minor cosmetic.

---

## 5. "Total time" — does anyone show it?

| Where | opencode | NIMBL |
|---|---|---|
| Per assistant message | ✅ `· duration` (end-to-end from user msg) | ✅ `· duration` (from assistant msg) |
| Per reasoning part | ✅ `· duration` (after part ends) | ✅ `· duration` (after part ends) |
| Per subagent task card | ✅ `· duration` | ❌ |
| **Whole-session elapsed** | ❌ none | ❌ none |
| **Cumulative thinking time** | ❌ none | ❌ none |

**opencode does not display a session-total time or a cumulative thinking total.** If NIMBL should show "total thinking time afterwards," that is a **new feature** in both — we would add e.g. a `/stats` line or a footer metric summing `part.ended - part.started` across reasoning parts.

---

## 6. Complete gap list (actionable)

| # | Indicator | opencode | NIMBL now | Effort |
|---|---|---|---|---|
| 1 | Assistant footer `· interrupted` on abort | ✅ | ❌ | Small — add `error?.name === "MessageAbortedError"` → suffix; gate footer on last/final/aborted |
| 2 | Assistant duration basis (end-to-end from user msg) | ✅ | ❌ (assistant msg only) | Small — pass the parent user message `time` into `AssistantMessage` |
| 3 | Retry banner in prompt footer (`[retrying in Xs attempt #N]`, click-to-expand, Gemini easter egg) | ✅ | ❌ (toast only) | Medium — thread retry state into the prompt footer |
| 4 | Subagent task card `· duration` + toolcall count | ✅ | ❌ | Small — emit/use task timing in the delegate card |
| 5 | Independent persisted thinking-visibility toggle (`/thinking`) | ✅ | ❌ (tied to conceal) | Small–Medium |
| 6 | Duration formatter parity (`1.5s`, day ladder) | ✅ | ⚠️ | Trivial |
| 7 | **New:** cumulative thinking time / session elapsed in `/stats` | ❌ both | ❌ both | New feature if desired |

---

## 7. Verification notes

- All opencode line numbers refer to the local clone at `C:\Users\jerem\Documents\GITHUB\opencode` (packages/tui/src).
- NIMBL line numbers refer to the current working tree.
- No code was changed to produce this document.

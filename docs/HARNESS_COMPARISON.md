# NIMBL vs Open-Source Agent Harnesses — Architecture Comparison

**Purpose:** compare NIMBL's backend architecture against the most reputable open-source
agent harnesses, capturing each one's strong points and weak points so we can borrow the best
ideas. Research performed 2026-08-15 from primary sources (GitHub repos, docs, source trees).

**NIMBL summary line:** NIMBL is the *only* harness in this list built around **token
efficiency as the product** (lexical+graph+hybrid retrieval, parser-backed structural context,
prompt caching, request budgeting, benchmark harness) **and teaching as the differentiator**
(learn/explain modes, Socratic questioning, concept tracking). Its biggest weakness — a hard
8-step tool cap that causes long-horizon failures — is exactly where every other harness here
has a mature solution we can borrow.

---

## Table of contents

1. [At-a-glance comparison matrix](#1-at-a-glance-comparison-matrix)
2. [NIMBL — baseline (what we bring)](#2-nimbl--baseline-what-we-bring)
3. [CLI coding agents](#3-cli-coding-agents)
   - opencode
   - Aider
   - Claude Code
   - OpenAI Codex CLI
   - Gemini CLI
4. [Model-company / research harnesses](#4-model-company--research-harnesses)
   - MiMo-Code (Xiaomi)
   - Kimi Code CLI (Moonshot)
   - Hermes Agent (Nous Research)
   - Pi (earendil-works) + oh-my-pi
5. [Framework / IDE harnesses](#5-framework--ide-harnesses)
   - OpenHands
   - SWE-agent / mini-swe-agent
   - Cline
   - Goose
   - Continue
6. [Head-to-head: NIMBL vs each](#6-head-to-head-nimbl-vs-each)
7. [The #1 lesson: how every harness avoids the 8-step failure](#7-the-1-lesson-how-every-harness-avoids-the-8-step-failure)
8. [Borrow list (ranked)](#8-borrow-list-ranked)
9. [NIMBL's defensible moats](#9-nimbls-defensible-moats)

---

## 1. At-a-glance comparison matrix

| Harness | Lang/Runtime | License | ~Stars | Agent loop | Context mgmt | Retrieval/RAG | Subagents | Token-efficiency | Step budget |
|---|---|---|---|---|---|---|---|---|---|
| **NIMBL** | TS / Bun | MIT | — | ReAct-style | structural+lexical+graph+hybrid, budgeted | ✅ strongest here | delegate tool (discouraged) | ★★★★★ core thesis | **8 steps (the bug)** |
| **opencode** | TS / Bun | MIT | 198k | streamText + per-agent steps | SQLite sessions, auto-compaction + prune | ❌ none | task/explore, own budgets | ★★★★ prompt-cache, truncate, prune | per-agent `steps` + graceful MAX_STEPS prompt |
| **Aider** | Python | Apache-2.0 | 48k | non-agent edit loop + reflection (3) | file list + repo map (PageRank) | repo-map tags | architect→editor | ★★★★ repo map, diff formats, cache keepalive | none (interactive) |
| **Claude Code** | Node→native | Proprietary | 142k | model-driven, unbounded | CLAUDE.md, lazy file load, auto-compact | ❌ (LSP plugin) | task tool, teams | ★★★★★ layered prefix cache | none (interruptible) |
| **Codex CLI** | Rust | Apache-2.0 | 106k | Responses API loop | ContextualUserFragment, 10K caps | ❌ | codex_delegate (1k summaries) | ★★★★ diff edits, no-history-rewrite | collaboration modes |
| **Gemini CLI** | TS | Apache-2.0 | 107k | function-call loop | 1M window, GEMINI.md, memory files | ❌ | subagents + remote | ★★★ implicit cache only | none |
| **MiMo-Code** | TS / Bun | MIT | 12.7k | build/plan/compose | SQLite FTS5 memory, checkpoints, budgeted inject | ❌ | parallel shared-context, worktrees | ★★★★ budgeted memory, BM25 skills | /goal + judge, no hard cap |
| **Kimi Code** | TS / Node | MIT | 6.7k | agent-core-v2 loop | state.json + wire.jsonl, reserved-ctx compaction | ❌ | Agent/AgentSwarm (128), cheap pool | ★★★★ Edit tool, attempts≠steps | unlimited steps, 10 attempts/step |
| **Hermes Agent** | Python | MIT | 231k | AIAgent 500 iters | dual compressor (50%/85%), iterative summaries | FTS5 session search | delegate (50 iters) | ★★★★★ tool-prune + caching + summaries | 500 parent / 50 subagent |
| **Pi** | TS / Bun | MIT | 91k | minimal loop | CompactionEntry + branch summaries | ❌ | ❌ (extensions) | ★★★★ structured compaction | none (minimal core) |
| **oh-my-pi** | TS + Rust | MIT | 25k | 31 tools, 10 roles | retain/recall/reflect memory | ❌ | task→worktrees, advisor | ★★★★★ hashline edits, ast_grep | schema-validated task fan-out |
| **OpenHands** | Python | MIT | 84k | event-sourced loop + Condenser | RollingCondenser head/tail/summarize | ❌ | ❌ | ★★★ condenser, security_risk self-label | none (condenser + stuck detector) |
| **SWE-agent** | Python | MIT | 20k | bounded steps + requery(3) | HistoryProcessors elision | ❌ | ❌ | ★★★★ ACI discipline (100-line viewer, filename grep) | `max_requeries=3` |
| **Cline** | TS/Node | Apache-2.0 | 66k | run/continue + auto-compact | Memory Bank md, checkpoints, ripgrep | ❌ | read-only research subagents | ★★★ | none (compaction-driven) |
| **Goose** | Rust | Apache-2.0 | 53k | interactive loop + context revision | summarize-with-small-model, .goosehints | ❌ (explicitly "includes everything") | delegate/load, recipes | ★★★ | subagent 25 turns/5min |
| **Continue** | TS | Apache-2.0 | 36k | tool handshake + system-message tools | repo map, rules | DIY guide only | ❌ | ★★★ system-message tools, model roles | none (unmaintained) |

**Standout observation:** **zero of the 15 harnesses ship built-in semantic retrieval/RAG.**
NIMBL is the only one with lexical+graph+hybrid retrieval, embeddings, vector index, and MMR.
That is our biggest technical moat. Every other harness relies on the model's own
read/grep discipline (which is exactly what causes NIMBL's audit-loop failures).

---

## 2. NIMBL — baseline (what we bring)

From `src/core/` (56 modules) and AGENTS.md:

- **Retrieval (unique):** `context.ts` lexical ranking + `dependency-graph.ts` symbol graph
  expansion + `embeddings.ts`/`vector-index.ts`/`hybrid-retrieval.ts` semantic + MMR fusion,
  budgeted under char/token limits. `structural-context.ts` parser-backed declaration chunks.
- **Token accounting:** `request-budget.ts` per-category budgets, `tokenizers.ts` model-aware
  counting, `token-compression.ts` structural/lexical compression, `prompt-cache.ts` stable
  prefix caching with provider cache-control.
- **Agents:** `agent-config.ts` build/plan/explain/learn modes; `agent.ts` streaming loop with
  read-to-edit budget (advisory), doom-loop detector, retries; `agent-benchmark.ts` + `opencode-benchmark.ts` harness.
- **Sessions/learning:** `sessions.ts` versioned CAS storage + compaction; `learning.ts`
  concept tracking + quizzes; `skills.ts` project/global skills.
- **Benchmarking:** `benchmarks/run.ts`, frozen corpus, committed results.

**Known weaknesses (from `docs/FAILURE_ANALYSIS_LH_MF_SH.md`):**
1. Hard 8-step tool cap (`MAX_TOOL_STEPS=12`, benchmark forces 8) → lh/mf/sh failures.
2. Step-cap cut-off (`finishReason:"tool-calls"`) not retried.
3. Read-to-edit guard advisory; doom-loop only catches identical fingerprints.
4. Delegation discouraged + child sessions inherit the same 8-step cap.

---

## 3. CLI coding agents

### opencode (anomalyco/opencode)
**What it is:** TS/Bun monorepo, MIT, ~198k stars, largest modern harness. Thin layer over the
Vercel AI SDK (`streamText`), Effect-based DI, SQLite sessions, server-client architecture.

- **Strong points**
  - Config-driven agents + per-agent permission rulesets (one JSONC file, auditable).
  - Production-grade auto-compaction: overflow detection → dedicated `compaction` agent
    (small model) summarizes → **replays the original user message** so tasks survive.
  - Tool-output **pruning** (`PRUNE_MINIMUM/PRUNE_PROTECT`): erases old completed tool outputs
    instead of summarizing — cheap, cache-friendly.
  - `MAX_STEPS_PROMPT` graceful step exhaustion ("respond with text only"), doom-loop guard.
  - Massive provider surface + models.dev catalog with per-model variants/reasoning effort.
  - Explicit `applyCaching()` prompt-cache breakpoints (system + last 2 messages) and
    `promptCacheKey: sessionID` for OpenAI-compatible providers.
  - Subagents (`task`/`explore`) with own budgets; `plan`/`build` agents; LSP tooling.
- **Weak points**
  - Very heavy (Effect layers, monorepo, Drizzle/DB) — hard to audit or reproduce.
  - Large provider-hack surface (`transform.ts`: Kimi detection, Mistral tool IDs, DeepSeek
    empty-reasoning injection) — constant maintenance.
  - **No built-in project retrieval** — relies on model-driven read/grep (step-wasteful).
  - Default permission posture `"*": "allow"`; compaction hides fidelity loss behind summaries.

### Aider (Aider-AI/aider)
**What it is:** Python, Apache-2.0, ~48k stars, ~6.8M installs, ~15B tokens/wk. Terminal pair
programmer, not an autonomous agent.

- **Strong points**
  - **Repo map** (the standout): tree-sitter def/ref tags → networkx graph → PageRank with
    query personalization (chat files ×50, mentioned idents ×10) → budget-fitted
    (binary search over `map_tokens`). Cheap, deterministic, widely copied.
  - Edit formats (`diff`, `editblock`, `udiff`) → deltas not rewrites; git auto-commit + `/undo`.
  - Reflection loop (`max_reflections=3`): lint errors, test errors, file mentions feed back —
    a *small retry budget recovers most failures without a global step cap*.
  - Architect → editor two-model plan/act split (editor gets empty history + plan only).
  - Prompt-cache keepalive pings keep the cached prefix warm between turns.
- **Weak points**
  - Not autonomous: no tool loop, no persistent context selection, user confirmation on every
    action; long-horizon work stalls.
  - Whole files in chat (no chunking/budget enforcement; warning is advisory).
  - No persistent permission rules.

### Claude Code (Anthropic)
**What it is:** Node→native binaries, proprietary (~142k stars on the docs/plugins repo).
Market leader; every surface runs the same engine.

- **Strong points**
  - Deep, documented **prompt-caching engineering** ("prompt caching is everything"): layered
    prefix order system → project context → conversation, per-part cacheControl, cache keyed by
    model+effort, 1h/5m TTL, explicit invalidation guidance.
  - Best-in-class context isolation via **subagents** (fresh context, return summary only),
    teams, dynamic workflows, `/goal` completion conditions.
  - Lazy file loading; `<system-reminder>` appends instead of rewriting history; `/rewind`
    truncates to an already-cached prefix.
  - Checkpoints + session fork/resume; transcript JSONL debuggability.
  - Auto/Sandboxed modes; deferred MCP tool definitions (names until first use); skills
    on-demand.
- **Weak points**
  - Closed source — details from docs/changelogs, change without notice.
  - Auto-compaction silently loses early detailed instructions; long sessions get expensive
    ("/clear between tasks").
  - Multi-agent features multiply token spend (~7× for plan-mode teams, per docs).

### OpenAI Codex CLI (openai/codex)
**What it is:** Rust core (~100 crates), Apache-2.0, ~106k stars. Most inspectable engineering.

- **Strong points**
  - **Context discipline as hard rules** (their AGENTS.md): no history rewrite (cache-friendly),
    no unbounded items, **no item >10K tokens**, ~1k items flagged for review. A reference spec.
  - Token-budgeted compaction with **cheap-model fallback** (`compact_model_fallback.rs`) and
    cloud compaction.
  - `apply_patch` diff-based editing (minimal token primitive); parallel tool calls.
  - Best-documented sandbox matrix (bwrap/Landlock, Seatbelt, Windows, network gating).
  - Subagent summaries capped at 1,000 tokens; agent lifecycle markers in parent context.
- **Weak points**
  - `codex-core` admitted bloated (their own AGENTS.md: "resist adding code to codex-core").
  - Deeply tied to OpenAI Responses API.
  - No pedagogical affordances; subagent returns are terse lifecycle markers, not explanations.

### Gemini CLI (Google)
**What it is:** TypeScript, Apache-2.0, ~107k stars. 1M-token window school; being replaced by
Antigravity CLI for free tiers (June 2026).

- **Strong points**
  - 1M-token window = less aggressive context management; free tier (60 req/min, 1k/day).
  - Best-in-class **checkpointing**: shadow-git snapshot of project + conversation + pending
    tool call before every mutating tool; `/restore` reverts all three.
  - Broadest sandbox backend selection (Seatbelt, Docker/Podman, Windows, gVisor, LXC);
    sandbox-expansion modals (JIT grants).
  - Hierarchical `GEMINI.md` + agent-writable memory markdown files.
- **Weak points**
  - Depends on huge context instead of managing it — token-per-turn costs balloon; no prefix
    cache discipline or structured compaction.
  - No caching on the OAuth/Code Assist path; sunset risk for free tiers.

---

## 4. Model-company / research harnesses

### MiMo-Code (XiaomiMiMo/MiMo-Code)
**What it is:** TypeScript/Bun monorepo, MIT, ~12.7k stars. **A fork of OpenCode** (same lineage
as NIMBL) adding memory/agents. Tagline: "Where Models and Agents Co-Evolve."

- **Strong points**
  - **Persistent memory in SQLite FTS5**: `MEMORY.md`, auto-maintained `checkpoint.md`,
    `notes.md`, per-task `progress.md`; memory injected automatically on session resume.
  - **Budgeted injection** of memory/checkpoint/notes under a token budget with importance
    ranking; per-model compaction point (`compaction.max_context` "272K"/"1M"/"50%") — compacts
    before price/latency cliffs.
  - `/goal` + **independent judge model** to prevent premature "optimistic stops".
  - Compose workflows: deterministic JS scripts, auto-parallelize independent tasks into
    isolated git worktrees with TDD per task; subagents share session context.
  - 20+ built-in skills; BM25 skill selection (only relevant skill text loads).
- **Weak points**
  - Heavy (OpenCode + large memory/agent/workflow layer).
  - Compose mode tuned for frontier models; voice requires MiMo login; memory files can bloat.

### Kimi Code CLI (MoonshotAI/kimi-code)
**What it is:** TypeScript pnpm monorepo, MIT, ~6.7k stars (successor to kimi-cli, Python,
Apache-2.0, 11.2k, winding down). TUI built on pi-tui.

- **Strong points**
  - **`max_attempts_per_step` (10) vs `max_steps_per_turn` (unlimited)** — a clean separation
    of *step* (tool turn) from *attempt* (transient-only retry) that NIMBL's 8-step cap conflates.
  - **`max_input_size` separate from window** (e.g. gpt-5: 400k window / 272k input) — compaction
    triggers off the *usable input* limit, not the advertised window.
  - AgentSwarm (up to 128 subagents, concurrency ramp, aggregated report); subagent cheap-model
    pool (`[secondary_model]` with `force`/inherit).
  - Reserved-context auto-compression (default reserve 50k); `cache_expiry_hint` warns when a
    long-idle session's provider cache has expired; `thinking.keep` preserves prior reasoning.
  - String-replacement `Edit` tool; permission rules with arg patterns (`Bash(rm -rf*)`).
- **Weak points**
  - Two overlapping repos create migration friction; no env-var credential fallback.
  - Less token-aggressive on the edit hot path than oh-my-pi; docs still settling (0.32 renames).

### Hermes Agent (NousResearch/hermes-agent)
**What it is:** Python 3.11 + uv, MIT, **~231k stars**, ~25k tests / ~1,250 files. "The agent
that grows with you." Gateway to Telegram/Discord/Slack/CLI; 7 terminal backends; self-improving.

- **Strong points**
  - **Most rigorously tuned compression/caching subsystem**: dual thresholds (in-loop at 50%,
    gateway hygiene at 85%); 4-phase algorithm — (1) **free tool-result pruning** (old outputs
    >200 chars stubbed, no LLM call), (2) boundary detection w/ tail protection, (3) structured
    summary (Goal/Constraints/Progress/Key Decisions/Files/Next Steps), (4) reassembly.
    **Iterative re-compression** (previous summary updated, not regenerated).
  - Prompt caching: Anthropic `system_and_3` (max 4 cache_control breakpoints), ~75% input-cost
    reduction; cache-aware design rules (never mutate stable system prompt).
  - Subagent budgets **independent** of parent (500 parent / 50 subagent) — dissolves step caps.
  - FTS5 session search + Honcho user modeling; `delegate_task`; RPC-collapsed Python pipelines
    ("zero-context-cost turns"); `trajectory_compressor.py` for training data.
- **Weak points**
  - Large Python codebase optimized for a personal-assistant/gateway use case more than IDE
    coding; too-small summary model silently drops the middle ("most common cause of degraded
    compaction quality"); verbose messaging UX.

### Pi (earendil-works/pi) + oh-my-pi (can1357/oh-my-pi)
**What it is:** Pi — TS/Bun monorepo, MIT, ~91k stars, "minimal terminal coding harness."
oh-my-pi — fork with ~80k-line Rust core, MIT, ~25k stars.

- **Strong points (Pi)**
  - Minimal core + clean extension/package/skill/template system; no built-in MCP/subagents
    (deliberate — you add them).
  - **`CompactionEntry` as a first-class session record**: `summary` + `firstKeptEntryId` +
    cumulative `<read-files>/<modified-files>` + `usage`; never cuts at tool results; branch
    summarization preserves cross-branch context; cache-write suppression for one-off summaries.
  - JSONL session tree (`/tree`, `/fork`, `/resume`); project-trust model.
- **Strong points (oh-my-pi)**
  - **Hashline hash-anchored edits** — the model points at content-hash anchors instead of
    retyping lines; stale anchors rejected *before* corruption. Measured **−61% output tokens**
    (Grok 4 Fast), 6.7%→68.3% first-attempt edits (Grok Fast 1), 2.1× MiniMax pass rate.
  - `task` subagents into **isolated git worktrees returning schema-validated objects** ("no
    prose to parse, no merge conflicts"); Agent Hub (Alt+A) supervises transcripts.
  - Advisor role (second model watching every turn); 10 model roles (default/smol/slow/plan/
    commit/vision/designer/task/advisor/tiny); `retain/recall/reflect/learn` memory tools;
    time-traveling stream rules (injected only when model goes off-script); `ast_edit` codemods;
    `eval` kernels calling back into tools (zero-context pipelines).
- **Weak points**
  - Pi: no permission system by default (safety via containers); long-horizon tasks need
    extension work; lossy compaction depends on summarizer quality.
  - oh-my-pi: enormous scope (hard to maintain); permission model leans on trust/containers;
    Rust core heavy to build; "benchmaxxed" tuning can overfit model families.

---

## 5. Framework / IDE harnesses

### OpenHands (All-Hands-AI/OpenHands)
**What it is:** Python agent SDK + TS/React "Agent Canvas", MIT, ~84k stars. SWE-bench 77.6% badge.

- **Strong points**
  - Clean event-sourced architecture: append-only event log, pluggable **Condenser** (keep head
    verbatim, LLM-summarize the middle, keep the tail, splice) — caching-friendly head retention.
  - Inline `security_risk` self-labeling on tool schemas (model labels LOW/MED/HIGH risk →
    `ConfirmationPolicy`); zero extra LLM calls.
  - **Stuck detector** (sliding-window pattern matching) instead of arbitrary caps.
  - Swappable workspaces (local/Docker/remote) same API; LLM retries with exponential backoff.
- **Weak points**
  - No retrieval/RAG; condensation changes message history each step (erodes prompt-cache hits).
  - No subagents/parallelism in core loop; SDK split across repos adds weight.

### SWE-agent (SWE-agent/SWE-agent)
**What it is:** Python, MIT, ~20k stars. Academic (NeurIPS 2024). **Superseded by mini-swe-agent**
(100 lines, 65% SWE-bench Verified) — maintenance mode.

- **Strong points**
  - **ACI (Agent-Computer Interface) discipline**, research-proven: bounded file viewer (~100
    lines with scroll/search), **filename-only grep** (match context confused models), file
    editor gated by a **linter** (invalid edits rejected), empty-output sentinel, `git diff`
    tagging.
  - `max_requeries=3` explicit retry semantics; RetryAgentConfig meta-agent picks best attempt.
  - HistoryProcessors: elide old observations (`last_n_observations`), keep tagged outputs
    (`always_keep_output_for_tags`), `polling` window so elision doesn't churn the cache;
    manual Anthropic cache breakpoints.
  - YAML-driven templates; cheap per run.
- **Weak points**
  - Maintenance-only; single-agent sequential; no planning/subagents/multi-agent; no semantic
    retrieval; caching manual and easy to break.

### Cline (cline/cline)
**What it is:** TypeScript monorepo (Bun), Apache-2.0, ~66k stars. VS Code + JetBrains + CLI + Kanban.

- **Strong points**
  - Most complete **permission/approval UX**: per-tool `toolPolicies`, tiered + conditional
    approval (auto-approve `ls`/`grep` prefixes), rejection handled gracefully (no loop).
  - Read-only parallel **research subagents** (own context/token budget, return top file paths);
    multi-agent teams (coordinator + task board + mailbox + mission log).
  - Checkpoints (shadow git repo after each tool use: restore files/task/both).
  - **Memory Bank** methodology (projectbrief/productContext/activeContext/systemPatterns/
    techContext/progress.md); cache-pricing metadata on ModelInfo.
- **Weak points**
  - No retrieval/RAG (ripgrep only); auto-compact loses precision and silently degrades to
    truncation on some models; checkpoint shadow repo storage-heavy; large per-turn prompts.

### Goose (aaif-goose/goose, formerly block/goose)
**What it is:** Rust core + Electron UI, Apache-2.0, ~53k stars. Linux Foundation (AAIF). MCP-first.

- **Strong points**
  - MCP is the extension backbone (70+ extensions); **ACP interop** (delegate to Claude
    Code/Codex subscriptions as providers).
  - **Context Revision** core mechanism: summarize with smaller/faster LLMs, delete-old
    heuristics, find-and-replace over full rewrites, ripgrep exclusions, verbose-output
    summarization.
  - Error-resilient loop: **errors returned to the model as tool responses** so it self-recovers.
  - Subagents: internal `delegate`/`load` (default 25 turns / 5-min timeout), recipes (reusable
    subagent bundles), sandboxed (no nested spawns).
  - Simple permission modes (autonomous/manual/smart/chat-only).
- **Weak points**
  - **No retrieval** — explicitly "includes everything until deleted" (token-inefficient on large
    repos); context revision quality depends on summarizer; Rust lowers contributor pool.

### Continue (continuedev/continue)
**What it is:** TypeScript monorepo, Apache-2.0, ~36k stars. **No longer actively maintained**
(README read-only, final 2.0.0).

- **Strong points**
  - **System-message tools** — tools converted to XML in the system message, so *any*
    instruction-following model (incl. weak/local) can use tools without native tool-calling.
  - **Model roles** (different models for agent plan/chat/edit/autocomplete/apply/embed/rerank) —
  a clean budget/quality routing template.
  - Repo map (`view_repo_map`, LSP symbol map) + subdirectory views; documented custom-RAG
    recipe (LanceDB + voyage-code-3 + AST chunking + reranker).
- **Weak points**
  - Unmaintained; first-class `@Codebase`/`@Docs` RAG removed (DIY now); no compaction/memory
    subsystem; IDE-bound; no subagents.

---

## 6. Head-to-head: NIMBL vs each

| Harness | NIMBL wins on | They win on |
|---|---|---|
| **opencode** | retrieval (they have none), token thesis, teaching modes | compaction-with-replay, tool-output pruning, per-agent steps + MAX_STEPS, subagents |
| **Aider** | retrieval, autonomy, teaching, token accounting | repo map (personalized PageRank), edit formats, cache keepalive, reflection loop |
| **Claude Code** | open source, retrieval, provider-agnostic, cheap | prompt-cache discipline, subagent isolation, product maturity |
| **Codex CLI** | retrieval, teaching, simplicity | no-history-rewrite + 10K caps, apply_patch diffs, cheap-model compaction fallback, sandbox matrix |
| **Gemini CLI** | retrieval, token efficiency, teaching | checkpoint/restore UX, 1M window simplicity, sandbox breadth |
| **MiMo-Code** | retrieval (they have none), teaching, benchmark | persistent memory+checkpoints, budgeted injection, /goal+judge, worktree parallelism |
| **Kimi Code** | retrieval, teaching, token accounting | attempts≠steps, max_input_size vs window, AgentSwarm, cheap subagent pool |
| **Hermes Agent** | retrieval, teaching focus, lean TS | dual-threshold compression, free tool-result pruning, iterative summaries, independent subagent budgets |
| **Pi / oh-my-pi** | retrieval, teaching, benchmark | hashline edits (−61% tokens), CompactionEntry, schema-validated worktree tasks, time-traveling rules |
| **OpenHands** | retrieval, teaching, TS | condenser head/tail, security_risk self-labeling, stuck detector |
| **SWE-agent** | retrieval, teaching, UX | ACI discipline (100-line viewer, filename grep, linter-gated edits), requery semantics |
| **Cline** | retrieval, teaching, lightweight | permission UX, research subagents, Memory Bank, checkpoints |
| **Goose** | retrieval, teaching, lean | error-as-observation resilience, recipes, ACP interop |
| **Continue** | retrieval, teaching, maintained | system-message tools, model roles |

---

## 7. The #1 lesson: how every harness avoids the 8-step failure

NIMBL's biggest bug — hard 8-step cap → lh/mf/sh failures — is solved by *every* mature
harness, via **one or more** of these mechanisms:

1. **No hard step cap at all** (Claude Code, Gemini, Kimi, Hermes, Pi, OpenHands, Cline, Goose)
   — replaced by **context compaction + interruption**, not a count. When context fills, they
   summarize-and-continue; the model never "dies at step 8."
2. **Per-agent / per-subagent step budgets** (opencode per-agent `steps`, Hermes 500/50,
   Kimi unlimited+attempts, oh-my-pi worktree tasks) — the *parent* is capped but delegating
   gives each subtask its own budget, so a tree of capped loops completes long-horizon work.
3. **Graceful exhaustion instead of failure** — opencode's `MAX_STEPS_PROMPT` ("summarize done,
   list remaining, recommend next") turns the cap into a handoff; Aider's `max_reflections=3`
   and SWE-agent's `max_requeries=3` are *tiny* retry budgets that recover most failures.
4. **Retries decoupled from steps** — Kimi's `max_attempts_per_step=10` for transient failures
   that don't consume the step budget.
5. **Goal/judge stopping** — MiMo's `/goal` + independent judge, Claude's `/goal`: stop on a
   *completion condition*, not an arbitrary count.

**The synthesis for NIMBL:** keep an 8-step *pedagogical* main-loop budget (it's good for
teaching), but add (a) step-cap retry with reflection, (b) subagent delegation where each
child gets its own budget + a schema-validated summary return, and (c) graceful
`MAX_STEPS_PROMPT`-style handoff instead of silent `finishReason:"tool-calls"`.

---

## 8. Borrow list (ranked)

### A. Fix the 8-step bug (Phase 1) — from opencode, Kimi, Hermes, oh-my-pi, MiMo
1. **Step-cap retry + graceful handoff** — on `finishReason:"tool-calls"` at the cap, append a
   `MAX_STEPS_PROMPT`-style text ("summarize done / remaining / next") and retry once with
   reflection (opencode + Reflexion). *Files: `agent.ts`.*
2. **Decouple attempts from steps** — transient 429/5xx/timeout retries must not consume the
   8-step budget (Kimi `max_attempts_per_step`). *Files: `agent.ts`, `api.ts`.*
3. **Subagent budget inheritance + schema-validated returns** — `delegate` spawns children with
   their own step budget; child returns JSON `{done, blocked, decisions, files}` (oh-my-pi
   schema-validated yield; Hermes 500/50; Cline read-only research subagents). Fix the delegate
   tool description to *encourage* use for separable bugs. *Files: `agent.ts` delegate tool,
   `agent-benchmark.ts` child cap, `tasks.ts`.*
4. **Read-only exploration subagent** — FastContext/Cline pattern: a cheap subagent maps the
   repo and returns top file paths + line ranges (kills the 82-reads/0-edits audit loop).
   *Files: `agent-config.ts` new mode, `context.ts`.*

### B. Defend the −40% token claim (Phase 2) — from oh-my-pi, Hermes, SWE-agent, Codex
5. **Hashline/hash-anchored edits** — model points at content-hash anchors, stale anchors
   rejected before corrupting; measured −61% output tokens. NIMBL's failed string-match edits
   are the worst cap-burner today. *Files: `edit-apply.ts`.*
6. **Free tool-result pruning pass** — before compaction, stub old tool outputs >200 chars with
   a marker, no LLM call (Hermes Phase 1). *Files: `sessions.ts`/`token-compression.ts`.*
7. **ACI discipline on tool outputs** — 100-line bounded file viewer, filename-only grep, empty-
   output sentinel (SWE-agent). Fewer, denser tool returns → fewer steps needed. *Files:
   `agent.ts` read/grep tools.*
8. **CompactionEntry as first-class session record** — `summary` + `firstKeptEntryId` +
   cumulative read/modified file lists + usage (Pi), with **iterative** summary updates (Hermes)
   and never cutting at tool results. *Files: `sessions.ts`.*
9. **`max_input_size` vs window** — trigger compaction off the usable input tier (Kimi/MiMo).
   *Files: `providers.ts`, `request-budget.ts`.*
10. **No-history-rewrite + 10K fragment caps** (Codex AGENTS.md) — keep the prompt-cache prefix
    stable; flag items >10K tokens. *Files: `context.ts`, `prompt-cache.ts`.*

### C. Efficiency (Phase 3)
11. **Cache keepalive pings** (Aider) — background pings keep the cached prefix warm between
    turns in long sessions. *Files: `prompt-cache.ts`.*
12. **Per-role model routing** (Continue/Kimi/oh-my-pi) — cheap model for compaction, summaries,
    and subagents; main model for reasoning. *Files: `routing.ts`.*
13. **System-message tools** (Continue) — enable the tool loop on weak/local models without
    native tool-calling; widens "learn anywhere." *Files: `agent.ts`.*
14. **BM25 skill selection** (MiMo) — reuse NIMBL's lexical retrieval to load only relevant skill
    text. *Files: `skills.ts`.*

### D. Intelligence (Phase 4)
15. **Checkpoint/restore** — shadow-git snapshot of files + conversation + pending tool call
    before each mutating tool (Gemini/Cline). *Files: `git-checkpoints.ts`,
    `filesystem-snapshot.ts`.*
16. **Inline security-risk self-labeling** (OpenHands) — tool schemas require the model to label
    risk LOW/MED/HIGH; zero extra LLM calls. *Files: `permissions.ts`, `agent.ts`.*
17. **Error-as-observation resilience** (Goose) — feed tool errors back to the model as
    observations so it self-recovers instead of failing. *Files: `agent.ts`.*
18. **Iterative structured summaries for teaching** — Socratic/learn mode teaches *from* the
    returned subagent summaries and compaction entries (Hermes iterative summaries + oh-my-pi
    schema yields). *Files: `learning.ts`.*

---

## 9. NIMBL's defensible moats

1. **Semantic retrieval — nobody else has it.** Zero of the 15 harnesses ship built-in
   lexical+graph+hybrid retrieval, embeddings, or MMR. Every competitor relies on model-driven
   read/grep. This is NIMBL's single biggest technical advantage and its token-efficiency engine.
2. **Token accounting as the product** — per-category request budgets, model-aware tokenizers,
   prompt caching, compression, and a reproducible benchmark harness with committed results.
   No competitor has a committed benchmark corpus + raw results proving efficiency.
3. **Teaching/learning modes** — no competitor is a *learning companion*; all are code
   generators. The Socratic/learn/explain modes + concept tracking + leakage-aware teaching are
   genuinely unique positioning.
4. **Provider-agnostic + lean** — thin TS/Bun core, no heavy DB/monorepo; runs anywhere Bun runs.

**The strategic insight from this comparison:** NIMBL should *stop trying to be another
opencode/Claude Code clone* on the agent loop and instead lean into its two moats (retrieval +
teaching), while borrowing the cheap, proven step-budget/compaction fixes (A.1–A.4) that
eliminate its one fatal weakness. Fix the 8-step bug, keep the token thesis, and the
long-horizon solve-rate gap closes without sacrificing the −40% claim.

---

## Sources

Primary: GitHub repos/READMEs/docs/source trees fetched 2026-08-15 — anomalyco/opencode,
Aider-AI/aider, anthropics/claude-code, openai/codex, google-gemini/gemini-cli,
XiaomiMiMo/MiMo-Code, MoonshotAI/kimi-code, NousResearch/hermes-agent, earendil-works/pi,
can1357/oh-my-pi, All-Hands-AI/OpenHands, SWE-agent/SWE-agent, cline/cline, aaif-goose/goose,
continuedev/continue. Star counts approximate at fetch time.

# NIMBL — Improvement Brainstorm & Harness Comparison (combined)

> **One-stop reference** merging `docs/BRAINSTORM.md` (research-paper improvements across every
> harness sector) and `docs/HARNESS_COMPARISON.md` (architecture comparison of 15 open-source
> agent harnesses). Research performed 2026-08-15 from primary sources (arXiv + GitHub).
>
> **How to use this doc:** Part I is the paper-driven brainstorm; Part II is the harness
> comparison; Part III unifies them into one borrow list where every idea names both its paper
> (if any) and the harness(es) that prove it works.
>
> Companion docs:
> - `docs/FAILURE_ANALYSIS_LH_MF_SH.md` — why lh/mf/sh tasks fail
> - `docs/TIER_B_RESEARCH_PAPERS.md` — paper catalog with verified arXiv links
> - `docs/BENCHMARK_PLAN.md` — benchmark methodology & claims rules
> - `docs/TIER_B_FINAL_RESULTS.md` — committed final run results

---

## Table of contents

**Part I — Brainstorm (research papers)**
1. [Agent loop & adaptive compute](#i1-agent-loop--adaptive-compute)
2. [Token compression & context selection](#i2-token-compression--context-selection)
3. [Prompt caching & cache-prefix continuity](#i3-prompt-caching--cache-prefix-continuity)
4. [Memory & "don't re-read"](#i4-memory--dont-re-read)
5. [Tool layer](#i5-tool-layer)
6. [Retrieval quality](#i6-retrieval-quality)
7. [Speed & latency](#i7-speed--latency)
8. [Teaching/learning](#i8-teachinglearning)
9. [Original NIMBL-specific ideas](#i9-original-nimbl-specific-ideas)

**Part II — Harness comparison**
10. [Comparison matrix](#ii10-comparison-matrix)
11. [CLI coding agents](#ii11-cli-coding-agents)
12. [Model-company / research harnesses](#ii12-model-company--research-harnesses)
13. [Framework / IDE harnesses](#ii13-framework--ide-harnesses)
14. [Head-to-head: NIMBL vs each](#ii14-head-to-head-nimbl-vs-each)
15. [NIMBL's defensible moats](#ii15-nimbls-defensible-moats)

**Part III — Unified action plan**
16. [Borrow list (papers × harnesses)](#iii16-borrow-list-papers--harnesses)
17. [Implementation phases](#iii17-implementation-phases)
18. [Open questions & risks](#iii18-open-questions--risks)

---

# PART I — BRAINSTORM (research papers)

## I.1 Agent loop & adaptive compute

**Status:** 🟢 active priority — this is the #1 bug fix area.

### Problem recap
Hard 8–12 step cap; no retry on step-cap; audit loop; no delegation on separable bugs.
(NIMBL is capped at `maxToolSteps: 8` / `MAX_TOOL_STEPS=12`; opencode needed 72–102 steps on
the same `lh-fix-all` task.)

### Papers

| Idea | Paper | arXiv | Fixes bug? | Keeps cheap? |
|---|---|---|---|---|
| Adaptive per-step compute by inter-rollout action agreement (commit early on high agreement) | **TrACE** | [2604.08369](https://arxiv.org/abs/2604.08369) | partially | ✅ −33–65% calls |
| Planner/Executor split; emit plan checklist before acting | **Plan-and-Act** | [2503.09572](https://arxiv.org/abs/2503.09572) | ✅ | ✅ plan is cheap |
| On failure, write verbal reflection → retry with it in context | **Reflexion** | [2303.11366](https://arxiv.org/abs/2303.11366) | ✅ | ⚠️ extra pass |
| Localize → repair → validate phase order, no free roaming | **Agentless** | [2407.01489](https://arxiv.org/abs/2407.01489) | ✅ | ✅✅ very cheap |
| Graph-based task decomposition → dependency-aware parallel tool execution | **GAP** | [2510.25320](https://arxiv.org/abs/2510.25320) | ✅ | ✅ fewer steps |
| Predict future tool calls from recurring patterns; execute speculatively while LLM generates | **PASTE** | [2603.18897](https://arxiv.org/abs/2603.18897) | partial | ✅ −43.5% task time |
| Milestone checkpoints / milestone-anchored credit | **BEACON** | [2605.06078](https://arxiv.org/abs/2605.06078) | ✅ | ✅ |
| Benchmark: frontier agents need explicit reasoning + parallel tool use long-horizon | **DeepPlanning** | [2601.18137](https://arxiv.org/abs/2601.18137) | — validation | — |

### Candidate implementations
- [ ] **Turn-allocation by task class** — lexical/symbol classifier → `{retrieval:8, single-fix:12, multi-file:40, long-horizon:100}` steps + retrieval budget. Zero extra LLM calls.
- [ ] **Retry on step-cap** — treat `finishReason: "tool-calls"` at the cap as retryable, appending a one-line reflection ("you ran out of steps mid-fix; finish now").
- [ ] **Enforce read-to-edit budget** — after N read-only calls with no edit, `read`/`glob`/`grep` return a directive instead of content (ToolGate-style hard gate).
- [ ] **Verify-gated edits** — every `edit` must be followed by a `bash` verify within 2 steps or the loop is flagged.
- [ ] **Milestone checkpointing** — after every edit, run the verify command; two consecutive failed verifies → stop & reflect (Reflexion), don't burn the budget.
- [ ] **Delegation by bug count** — for N-independent-bug tasks, spawn N subagents with per-bug budgets + merge step; scale child `maxToolSteps: 8` cap.

---

## I.2 Token compression & context selection

**Status:** 🟡 defense of the −40% claim; cheap wins available.

### Papers

| Idea | Paper | arXiv | Keeps cheap? |
|---|---|---|---|
| Extractive compression > token-pruning > summarization; ~10× compression w/ minimal degradation | **Characterizing Prompt Compression** | [2407.08892](https://arxiv.org/abs/2407.08892) | ✅ |
| Query-aware, sentence-level excerpt pruning (post-retrieval) | **LLMLingua-2 / TACO-RL / CPC / ICPC / DAC / PIS** | [2403.12968](https://arxiv.org/abs/2403.12968) [2409.13035](https://arxiv.org/abs/2409.13035) [2409.01227](https://arxiv.org/abs/2409.01227) [2501.01625](https://arxiv.org/abs/2501.01625) [2507.11942](https://arxiv.org/abs/2507.11942) [2504.16574](https://arxiv.org/abs/2504.16574) | ✅ no extra LLM |
| Generative / attention-only compression (heavier optional path) | **SCOPE / AOC** | [2508.15813](https://arxiv.org/abs/2508.15813) [2501.06730](https://arxiv.org/abs/2501.06730) | ⚠️ heavier |
| Query-aware compression is provably better (rate-distortion) | **Fundamental Limits** | [2407.15504](https://arxiv.org/abs/2407.15504) | ✅ |
| ⚠️ Aggressive compression can *increase* cost (output tokens dominate); moderate (r=0.5) saves 27.9% | **Production compression trial** | [2603.23525](https://arxiv.org/abs/2603.23525) | ⚠️ warning |

### Candidate implementations
- [ ] Sentence-importance filter (lexical + embedding score, query-conditioned) over already-retrieved excerpts.
- [ ] Keep compression moderate; extractive-by-default in `structural-context.ts` / `token-compression.ts`.
- [ ] Benchmark ablation for compression mode (already supported in `benchmarks/run.ts`).

---

## I.3 Prompt caching & cache-prefix continuity

**Status:** 🟡 high value / low effort.

### Papers

| Idea | Paper | arXiv | Keeps cheap? |
|---|---|---|---|
| Cache only stable prefix; exclude dynamic tool results; dynamic content at end; −41–80% cost | **Don't Break the Cache** | [2601.06007](https://arxiv.org/abs/2601.06007) | ✅ |
| Query-agnostic compression + cache_control + tier-preserving ratio bound; cheapest 16/16 configs | **CAPC** | [2607.15516](https://arxiv.org/abs/2607.15516) | ✅ −49% over cache-only |
| Ingestion-aware compaction that does NOT invalidate the cache prefix | **TokenPilot** | [2606.17016](https://arxiv.org/abs/2606.17016) | ✅ −61–87% |
| Verified semantic caching with per-entry thresholds; up to 12.5× hit rate | **vCache** | [2502.03771](https://arxiv.org/abs/2502.03771) | ✅ |
| KV-cache eviction prioritizing long conversations (P90 TTFT −27%) | **Tail-Optimized LRU** | [2510.15152](https://arxiv.org/abs/2510.15152) | ✅ latency |

### Candidate implementations
- [ ] Make compaction cache-contiguous (fold into the stable system prefix) — `sessions.ts` + `prompt-cache.ts`.
- [ ] Place dynamic retrieval text at the very end of the prompt.
- [ ] Exclude per-step tool results from the cached prefix (keep system + plan cached).

---

## I.4 Memory & "don't re-read"

**Status:** 🟢 kills the audit loop; top-tier token win.

### Papers

| Idea | Paper | arXiv | Keeps cheap? |
|---|---|---|---|
| Stateful agent = O(1)/turn vs O(n²); −52–90% tokens | **Remember, Don't Re-read** | [2606.14945](https://arxiv.org/abs/2606.14945) | ✅ |
| 3-level code index + intention-aware output gate + compact evidence packets; −51.5% tokens on SWE-bench | **ContextSniper** | [2607.01916](https://arxiv.org/abs/2607.01916) | ✅ |
| Hierarchical memory with index-routed retrieval | **H-MEM / Bi-Mem / Pancake** | [2507.22925](https://arxiv.org/abs/2507.22925) [2601.06490](https://arxiv.org/abs/2601.06490) [2602.21477](https://arxiv.org/abs/2602.21477) | ✅ |
| RL-learned constant-memory / constrained retention / intent-aware graph memory | **MEM1 / OSL-MR / PRISM** | [2506.15841](https://arxiv.org/abs/2506.15841) [2606.10616](https://arxiv.org/abs/2606.10616) [2605.12260](https://arxiv.org/abs/2605.12260) | ✅ |
| Context information-density maximization + self-evolving SOPs; hierarchical on-demand memory | **GenericAgent** | [2604.17091](https://arxiv.org/abs/2604.17091) | ✅ |

### Candidate implementations
- [ ] **Read-cache** — per-session file-hash cache; unchanged files return a "(unchanged)" stub.
- [ ] **Tool-output gating** — only the slice relevant to the current plan (ContextSniper-style).
- [ ] Hierarchical session memory (facts → scenes → persona) as a stronger summary layer.

---

## I.5 Tool layer

**Status:** 🟡 fixed per-step overhead reduction.

### Papers

| Idea | Paper | arXiv | Keeps cheap? |
|---|---|---|---|
| Compile JSON tool schemas → compact structured text; ≥51% schema-token cut | **TSCG** | [2605.04107](https://arxiv.org/abs/2605.04107) | ✅ |
| Expose only intent-scoped tool sessions; −99.2% tool context | **Tool Forge** | [2605.28000](https://arxiv.org/abs/2605.28000) | ✅ |
| Pre-call execute/skip controller; −31–36% cost | **ToolGate** | [2606.03054](https://arxiv.org/abs/2606.03054) | ✅ |
| Codify delegation contract as pseudocode; −55–87% input / −41–70% output | **CodeAgents** | [2507.03254](https://arxiv.org/abs/2507.03254) | ✅ |
| Dedicated exploration subagent returning paths+line-ranges; −60% tokens, +5.5% resolution | **FastContext** | [2606.14066](https://arxiv.org/abs/2606.14066) | ✅ |
| Parallel tool calls + robust abort → token + time savings | **MCP characterization** | [2511.07426](https://arxiv.org/abs/2511.07426) | ✅ |

### Candidate implementations
- [ ] Compact tool schemas (TSCG-style) in `request-budget.ts`.
- [ ] Per-intent tool subsets (extend `MODE_TOOLS`).
- [ ] Exploration subagent (FastContext) returning paths + line ranges, not full snippets.

---

## I.6 Retrieval quality

**Status:** 🟡 tuning wins, free.

### Papers

| Idea | Paper | arXiv | Keeps cheap? |
|---|---|---|---|
| Adaptive graph traversal per question type | **PolyG** | [2504.02112](https://arxiv.org/abs/2504.02112) | ✅ |
| LLM control wins only when evidence is scattered (6–10 chunks); heuristic otherwise; final ranking → vector rerank | **RLM-on-KG** | [2604.17056](https://arxiv.org/abs/2604.17056) | ✅ |
| Small-model extraction + cross-chunk graph augmentation | **RAGU / CrossAug** | [2607.11683](https://arxiv.org/abs/2607.11683) [2605.28004](https://arxiv.org/abs/2605.28004) | ✅ |
| Query rewriting trained on reranker feedback (annotation-free) | **RaFe** | [2405.14431](https://arxiv.org/abs/2405.14431) | ✅ |
| Lost-in-the-middle family — keep context short, relevant items at edges | **Lost in the Middle** et al. | [2307.03172](https://arxiv.org/abs/2307.03172) [2406.16008](https://arxiv.org/abs/2406.16008) [2412.10079](https://arxiv.org/abs/2412.10079) [2510.10276](https://arxiv.org/abs/2510.10276) | ✅ |

### Candidate implementations
- [ ] Graph-scatter-aware retrieval budget (widen expansion when matches are scattered; stay lexical when concentrated).
- [ ] Vector rerank as the final ranking stage regardless of discovery method.
- [ ] Reranker-feedback query rewriting (offline trainable, no big LLM).

---

## I.7 Speed & latency

**Status:** 🟡 mostly informs routing/architecture.

### Papers

| Idea | Paper | arXiv | Keeps cheap? |
|---|---|---|---|
| Draft-verify decoding (1.7–2.1×) | **Kangaroo / BiLD / MoA-SD** | [2404.18911](https://arxiv.org/abs/2404.18911) [2302.07863](https://arxiv.org/abs/2302.07863) [2410.03804](https://arxiv.org/abs/2410.03804) | ⚠️ provider-side |
| Local small-model triage routing + prompt compression before cloud LLM; 45–79% savings | **Local-Splitter** | [2604.12301](https://arxiv.org/abs/2604.12301) | ✅ |
| Adaptive compute + memory → up to −56% compute with past experience | **SpeedupLLM** | [2505.20643](https://arxiv.org/abs/2505.20643) | ✅ |
| Edge SLM ↔ cloud LLM collaboration taxonomy (task assignment / speculative / routing) | **Edge-Cloud survey** | [2507.16731](https://arxiv.org/abs/2507.16731) | ✅ informs design |

### Candidate implementations
- [ ] Local triage layer for cheap routing (offline embedder already exists — reuse for classification).
- [ ] Prefetch/parallelize independent tool calls (PASTE-style speculative execution where patterns are predictable).

---

## I.8 Teaching/learning

**Status:** 🟢 differentiator; prompt-level improvements available today.

### Papers

| Idea | Paper | arXiv | Keeps cheap? |
|---|---|---|---|
| Keyword-leakage metric + RL to stop tutors revealing answers (SE 30→63%, leakage 30→13%) | **HeuristicEdu** | [2607.22996](https://arxiv.org/abs/2607.22996) | ✅ adopt metric only |
| Pedagogically-aligned RL for Socratic tutors | **PEARL** | [2605.29582](https://arxiv.org/abs/2605.29582) | ⚠️ training |
| Socratic question gen via DPO; small model beats prompting | **Socratic DPO** | [2403.00199](https://arxiv.org/abs/2403.00199) | ⚠️ training |
| Socratic chatbot promotes critical thinking vs direct-answer | **Critical-thinking chatbot** | [2409.05511](https://arxiv.org/abs/2409.05511) | ✅ validates |
| Socratic vs Narrative: Socratic drives engagement; experts prefer Narrative | **TeaPT** | [2509.12107](https://arxiv.org/abs/2509.12107) | ✅ adaptive mode |
| Persist verified fixes as reusable knowledge; +9.4pp SWE-bench | **MemCoder** | [2603.13258](https://arxiv.org/abs/2603.13258) | ✅ |
| Socratic Playground for Learning (multi-turn tutoring) | **SPL** | [2406.13919](https://arxiv.org/abs/2406.13919) | ✅ validates |

### Candidate implementations
- [ ] Add a "did the tutor reveal the answer" leakage scorer to `learn` mode / `question` tool.
- [ ] Adaptive Socratic vs Narrative based on user experience/attitude (TeaPT).
- [ ] Persist verified fixes as project-local knowledge (MemCoder) via `learning.ts` + `skills.ts`.

---

## I.9 Original NIMBL-specific ideas

> Ideas synthesized from the research, not from any single paper. Mark each with `[x]` when
> implemented, and record measured impact.

- [ ] **#1 Task-class turn allocator** — lexical/symbol classifier → task family
  `{retrieval, single-fix, multi-file, long-horizon}` → allocates `maxToolSteps` + retrieval
  budget. Free (no LLM), fixes the 8-step cap only where needed.
- [ ] **#2 Plan-first escalation** — when classifier says `long-horizon`, auto-run the existing
  `plan` agent mode → hand its todo list to `build`. Reuses existing code.
- [ ] **#3 Verify-gated edits** — every `edit` requires a `bash` verify within 2 steps or the
  loop is flagged. Encodes the solved-run pattern (solved `sh-hidden-green`: 18 edits + 14
  bash; failed: 3 edits + 5 bash).
- [ ] **#4 Delegation by bug count** — N independent bugs → N subagents with per-bug budgets +
  merge step; scale the child `maxToolSteps: 8` cap.
- [ ] **#5 Retrieval-budget widening on graph scatter** — widen graph expansion when top
  retrieval matches are scattered (RLM-on-KG); stay lexical when concentrated. Free.
- [ ] **#6 Leakage-aware learn mode** — "did the tutor reveal the answer" scorer on existing
  `question`/`learn` tools.
- [ ] **#7 Read-cache** — per-session file-hash cache; unchanged files return a stub.
- [ ] **#8 Step-cap retry with reflection** — `finishReason: "tool-calls"` at cap → retry with a
  one-line reflection; converts dead attempts into second chances.
- [ ] **#9 Cache-prefix-contiguous compaction** — fold compaction into the stable system prefix.
- [ ] **#10 Compact tool schemas** — TSCG-style structured text instead of full JSON per step.

---

# PART II — HARNESS COMPARISON

## II.10 Comparison matrix

**Standout observation:** **zero of the 15 harnesses ship built-in semantic retrieval/RAG.**
NIMBL is the only one with lexical+graph+hybrid retrieval, embeddings, vector index, and MMR.
That is NIMBL's biggest technical moat. Every other harness relies on the model's own
read/grep discipline (which is exactly what causes NIMBL's audit-loop failures).

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

---

## II.11 CLI coding agents

### opencode (anomalyco/opencode)
TS/Bun monorepo, MIT, ~198k stars. Thin layer over Vercel AI SDK; Effect DI; SQLite sessions;
server-client architecture.

- **Strong:** config-driven agents + per-agent permission rulesets; production auto-compaction
  (dedicated small-model `compaction` agent, **replays original user message**); tool-output
  pruning (`PRUNE_MINIMUM/PRUNE_PROTECT`); `MAX_STEPS_PROMPT` graceful exhaustion; doom-loop
  guard; massive provider surface + models.dev catalog; explicit `applyCaching()` breakpoints +
  `promptCacheKey`; `task`/`explore` subagents with own budgets; LSP tooling.
- **Weak:** very heavy (Effect, monorepo, Drizzle/DB); provider-hack surface maintenance;
  **no built-in retrieval** (model-driven read/grep, step-wasteful); default `"*": "allow"`.

### Aider (Aider-AI/aider)
Python, Apache-2.0, ~48k stars, ~6.8M installs. Terminal pair programmer, not autonomous.

- **Strong:** **repo map** — tree-sitter tags → PageRank with query personalization, budget-fit
  by binary search; edit formats (`diff`/`editblock`) → deltas; git auto-commit + `/undo`;
  reflection loop (`max_reflections=3` recovers most failures with a tiny retry budget);
  architect→editor two-model plan/act; prompt-cache keepalive pings.
- **Weak:** not autonomous (no tool loop, no persistent context, confirm-every-action);
  whole files in chat (no chunking); no persistent permission rules.

### Claude Code (Anthropic)
Node→native binaries, proprietary (~142k stars on docs repo). Market leader.

- **Strong:** deepest **prompt-caching engineering** (layered prefix order, per-part cacheControl,
  cache keyed by model+effort, 1h/5m TTL); best-in-class subagent context isolation (fresh
  context, summary return) + teams + `/goal`; lazy file loading + `<system-reminder>` append
  (no history rewrite); `/rewind` truncates to cached prefix; checkpoints + fork/resume; deferred
  MCP tool definitions; skills on-demand.
- **Weak:** closed source; auto-compaction silently loses early instructions; multi-agent
  features multiply token spend (~7× plan-mode teams).

### OpenAI Codex CLI (openai/codex)
Rust core (~100 crates), Apache-2.0, ~106k stars. Most inspectable engineering.

- **Strong:** **context discipline as hard rules** (no history rewrite, no unbounded items,
  **no item >10K tokens**); token-budgeted compaction with **cheap-model fallback** + cloud
  compaction; `apply_patch` diff edits; parallel tool calls; best-documented sandbox matrix;
  subagent summaries capped at 1,000 tokens.
- **Weak:** `codex-core` admitted bloated; tied to OpenAI Responses API; no pedagogy.

### Gemini CLI (Google)
TypeScript, Apache-2.0, ~107k stars. 1M-window school; being replaced by Antigravity CLI.

- **Strong:** 1M-token window; free tier; best-in-class **checkpointing** (shadow-git snapshot
  of project + conversation + pending tool call, `/restore`); broadest sandbox backend selection;
  sandbox-expansion modals; hierarchical `GEMINI.md` + writable memory files.
- **Weak:** depends on huge context instead of managing it (token-per-turn balloon); no prefix
  cache discipline/structured compaction; no caching on OAuth path; sunset risk.

---

## II.12 Model-company / research harnesses

### MiMo-Code (XiaomiMiMo/MiMo-Code)
TS/Bun monorepo, MIT, ~12.7k stars. **A fork of OpenCode** adding memory/agents.

- **Strong:** **persistent memory in SQLite FTS5** (`MEMORY.md`, `checkpoint.md`, `notes.md`,
  per-task `progress.md`, injected on resume); **budgeted injection** with importance ranking;
  per-model compaction point (`compaction.max_context` "272K"/"1M") — compacts before price
  cliffs; `/goal` + **independent judge** prevents premature stops; compose workflows
  (deterministic JS, auto-parallelize into isolated git worktrees, TDD per task); 20+ skills
  with **BM25 selection**.
- **Weak:** heavy (OpenCode + memory/agent/workflow layer); compose tuned for frontier models;
  memory files can bloat.

### Kimi Code CLI (MoonshotAI/kimi-code)
TS/Node, MIT, ~6.7k stars (successor to kimi-cli Python, winding down). TUI on pi-tui.

- **Strong:** **`max_attempts_per_step` (10) vs `max_steps_per_turn` (unlimited)** — clean
  step-vs-attempt separation NIMBL conflates; **`max_input_size` separate from window**
  (compaction off usable input tier); AgentSwarm (128 subagents, concurrency ramp, aggregated
  report); subagent cheap-model pool (`[secondary_model]` force/inherit); reserved-context
  auto-compression; `cache_expiry_hint`; `thinking.keep`; string-replacement `Edit`;
  permission rules with arg patterns.
- **Weak:** two overlapping repos; no env-var credential fallback; docs settling.

### Hermes Agent (NousResearch/hermes-agent)
Python 3.11 + uv, MIT, **~231k stars**, ~25k tests. "The agent that grows with you."

- **Strong:** most rigorously tuned compression/caching: **dual thresholds** (50% in-loop /
  85% gateway); 4-phase — **(1) free tool-result pruning** (old outputs >200 chars stubbed, no
  LLM call), (2) boundary detection + tail protection, (3) structured summary (Goal/Constraints/
  Progress/Decisions/Files/Next), (4) reassembly; **iterative re-compression** (update previous
  summary); Anthropic `system_and_3` cache breakpoints (~75% cost cut); **subagent budgets
  independent of parent** (500/50); FTS5 session search; RPC-collapsed pipelines.
- **Weak:** large Python gateway-oriented codebase; too-small summary model silently drops the
  middle; verbose messaging UX.

### Pi (earendil-works/pi) + oh-my-pi (can1357/oh-my-pi)
Pi — TS/Bun, MIT, ~91k stars, "minimal terminal coding harness." oh-my-pi — fork, ~80k-line
Rust core, MIT, ~25k stars.

- **Strong (Pi):** minimal core + clean extension/skill/package system; **`CompactionEntry` as
  a first-class session record** (`summary` + `firstKeptEntryId` + cumulative file lists +
  usage); never cuts at tool results; branch summarization; cache-write suppression for one-off
  summaries; JSONL session tree.
- **Strong (oh-my-pi):** **hashline hash-anchored edits** (model points at content-hash
  anchors; stale anchors rejected before corruption; measured **−61% output tokens**); `task`
  subagents into isolated git worktrees returning **schema-validated objects**; Agent Hub
  supervision; advisor role (second model watching); 10 model roles; retain/recall/reflect/learn
  memory; time-traveling stream rules; `ast_edit` codemods; `eval` kernels with tool re-entry.
- **Weak:** Pi — no permission system by default, long-horizon needs extension work, lossy
  compaction; oh-my-pi — enormous scope, trust/containers permission model, heavy Rust core.

---

## II.13 Framework / IDE harnesses

### OpenHands (All-Hands-AI/OpenHands)
Python agent SDK + TS/React "Agent Canvas", MIT, ~84k stars. SWE-bench 77.6% badge.

- **Strong:** clean event-sourced loop; pluggable **Condenser** (keep head verbatim, summarize
  middle, keep tail — caching-friendly); inline `security_risk` self-labeling on tool schemas
  (zero extra LLM calls); **stuck detector** (sliding-window) instead of arbitrary caps;
  swappable workspaces; LLM retries with exponential backoff.
- **Weak:** no retrieval; condensation changes history each step (erodes cache hits); no
  subagents/parallelism in core.

### SWE-agent (SWE-agent/SWE-agent)
Python, MIT, ~20k stars. Academic (NeurIPS 2024). **Superseded by mini-swe-agent** (maintenance).

- **Strong:** **ACI (Agent-Computer Interface) discipline** — bounded 100-line file viewer,
  **filename-only grep** (match context confused models), linter-gated edits, empty-output
  sentinel; `max_requeries=3`; HistoryProcessors (elide old observations, keep tagged outputs,
  `polling` window for cache); manual cache breakpoints.
- **Weak:** maintenance-only; single-agent sequential; no planning/subagents; no retrieval;
  caching manual and easy to break.

### Cline (cline/cline)
TypeScript monorepo, Apache-2.0, ~66k stars. VS Code + JetBrains + CLI + Kanban.

- **Strong:** most complete permission/approval UX (per-tool `toolPolicies`, conditional
  approval, graceful rejection); read-only parallel **research subagents**; multi-agent teams
  (coordinator + task board + mailbox); **checkpoints** (shadow git); **Memory Bank** methodology;
  cache-pricing metadata.
- **Weak:** no retrieval (ripgrep only); auto-compact loses precision; checkpoint storage-heavy;
  large per-turn prompts.

### Goose (aaif-goose/goose, formerly block/goose)
Rust core + Electron UI, Apache-2.0, ~53k stars. Linux Foundation (AAIF). MCP-first.

- **Strong:** MCP is the extension backbone (70+); **ACP interop** (delegate to Claude
  Code/Codex subscriptions); **Context Revision** (summarize with smaller models, delete-old
  heuristics, find-and-replace, ripgrep exclusions); **errors returned to the model as tool
  responses** (self-recovers); internal subagents (25 turns/5min) + recipes; simple permission
  modes.
- **Weak:** **no retrieval** ("includes everything until deleted"); context-revision quality
  depends on summarizer; Rust lowers contributor pool.

### Continue (continuedev/continue)
TypeScript monorepo, Apache-2.0, ~36k stars. **No longer actively maintained.**

- **Strong:** **system-message tools** (XML tools in system message → any model incl. weak/local
  can use tools); **model roles** (different models for plan/chat/edit/autocomplete/apply/
  embed/rerank); repo map + LSP context selection; documented custom-RAG recipe.
- **Weak:** unmaintained; `@Codebase`/`@Docs` RAG removed (DIY); no compaction/memory
  subsystem; IDE-bound; no subagents.

---

## II.14 Head-to-head: NIMBL vs each

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

## II.15 NIMBL's defensible moats

1. **Semantic retrieval — nobody else has it.** Zero of the 15 harnesses ship built-in
   lexical+graph+hybrid retrieval, embeddings, or MMR. Every competitor relies on model-driven
   read/grep — the exact cause of NIMBL's audit-loop failures.
2. **Token accounting as the product** — per-category request budgets, model-aware tokenizers,
   prompt caching, compression, and a reproducible benchmark harness with committed results.
3. **Teaching/learning modes** — no competitor is a *learning companion*; all are code
   generators. Socratic/learn/explain modes + concept tracking + leakage-aware teaching are
   unique positioning.
4. **Provider-agnostic + lean** — thin TS/Bun core, no heavy DB/monorepo; runs anywhere Bun runs.

**Strategic insight:** NIMBL should *stop trying to be another opencode/Claude Code clone* on
the agent loop and instead lean into its two moats (retrieval + teaching), while borrowing the
cheap, proven step-budget/compaction fixes that eliminate its one fatal weakness.

---

# PART III — UNIFIED ACTION PLAN

## III.16 Borrow list (papers × harnesses)

> Every item names its paper(s) (P) and the harness(es) (H) that prove it works.

### A. Fix the 8-step bug (Phase 1)
| # | Borrow | Paper | Harness |
|---|---|---|---|
| A1 | **Step-cap retry + graceful handoff** — on `finishReason:"tool-calls"` at cap, append a "summarize done / remaining / next" prompt and retry once with reflection | Reflexion [2303.11366], TrACE [2604.08369] | opencode `MAX_STEPS_PROMPT`, Hermes 500/50 |
| A2 | **Decouple attempts from steps** — transient 429/5xx/timeout retries must not consume the 8-step budget | — | Kimi `max_attempts_per_step`, opencode retry policy |
| A3 | **Subagent budget inheritance + schema-validated returns** — `delegate` spawns children with own budget; child returns JSON `{done, blocked, decisions, files}` | CodeAgents [2507.03254] | Hermes 500/50, oh-my-pi worktree yields, Cline research subagents |
| A4 | **Read-only exploration subagent** — cheap subagent maps repo, returns top file paths + line ranges (kills 82-reads/0-edits loop) | FastContext [2606.14066] | Cline, FastContext |
| A5 | **Graceful step exhaustion instead of silent failure** — text-only handoff at cap | — | opencode `MAX_STEPS_PROMPT` |

### B. Defend the −40% token claim (Phase 2)
| # | Borrow | Paper | Harness |
|---|---|---|---|
| B1 | **Hashline/hash-anchored edits** — model points at content-hash anchors; stale anchors rejected before corrupting; −61% output tokens | — | oh-my-pi |
| B2 | **Free tool-result pruning pass** — stub old tool outputs >200 chars with a marker, no LLM call | — | Hermes (phase 1), opencode PRUNE |
| B3 | **ACI discipline on tool outputs** — 100-line bounded viewer, filename-only grep, empty-output sentinel | — | SWE-agent |
| B4 | **CompactionEntry as first-class session record** — `summary` + `firstKeptEntryId` + cumulative file lists + usage; never cut at tool results; iterative updates | TokenPilot [2606.17016] | Pi, Hermes |
| B5 | **`max_input_size` vs window** — compaction off the usable input tier | — | Kimi, MiMo |
| B6 | **No-history-rewrite + 10K fragment caps** — keep prompt-cache prefix stable; flag >10K items | CAPC [2607.15516], Don't Break the Cache [2601.06007] | Codex |

### C. Efficiency (Phase 3)
| # | Borrow | Paper | Harness |
|---|---|---|---|
| C1 | **Cache keepalive pings** — keep cached prefix warm between turns | — | Aider |
| C2 | **Per-role model routing** — cheap model for compaction/summaries/subagents | Local-Splitter [2604.12301], SpeedupLLM [2505.20643] | Continue, Kimi, oh-my-pi |
| C3 | **System-message tools** — tool loop on weak/local models without native tool-calling | — | Continue |
| C4 | **BM25 skill selection** — load only relevant skill text | — | MiMo |
| C5 | **Query-aware sentence excerpt pruning** | LLMLingua-2 [2403.12968], CPC [2409.01227], DAC [2507.11942] | — |

### D. Intelligence (Phase 4)
| # | Borrow | Paper | Harness |
|---|---|---|---|
| D1 | **Checkpoint/restore** — shadow-git snapshot of files + conversation + pending tool call before mutating tools | — | Gemini, Cline |
| D2 | **Inline security-risk self-labeling** — tool schemas require LOW/MED/HIGH label; zero extra LLM calls | — | OpenHands |
| D3 | **Error-as-observation resilience** — feed tool errors back to the model as observations | Reflexion [2303.11366] | Goose |
| D4 | **Iterative structured summaries for teaching** — Socratic/learn mode teaches *from* subagent summaries + compaction entries | — | Hermes, oh-my-pi, Pi |
| D5 | **Persistent project memory** — SQLite FTS5 memory injected on resume | MemCoder [2603.13258] | MiMo |

---

## III.17 Implementation phases

> Ordered by ROI: fix bugs first, then defend tokens, then cheap wins, then intelligence.

### Phase 1 — fix the 8-step bug (highest ROI, smallest code)
- Task-class turn allocator (#1)
- Step-cap retry with reflection (#8 / A1)
- Decouple attempts from steps (A2)
- Hard read-to-edit gate (enforce, don't advise)
- Verify-gated edits (#3)

**Expected:** `lh-fix-all` 0/12 → ~8–12/12; `sh-hidden-green` +~3; `mf-quote-margin` +~2.
**Files:** `agent.ts`, `agent-config.ts`, `agent-benchmark.ts`.

### Phase 2 — token defense (keeps −40%)
- Read-cache (#7)
- Tool-output gating (ContextSniper-style / B3)
- Hash-anchored edits (B1)
- Free tool-result pruning (B2)
- Cache-prefix-contiguous compaction (#9 / B4)
- Compact tool schemas (#10)

### Phase 3 — efficiency (cheap wins)
- Extractive-default compression
- Sentence-level excerpt pruning (C5)
- TrACE adaptive per-step compute
- Cache keepalive pings (C1)
- Per-role model routing (C2)
- Delegation for separable bugs (#4 / A3)

### Phase 4 — intelligence
- Plan-first escalation (#2)
- FastContext-style exploration subagent (A4)
- Query rewriting via reranker feedback
- Leakage-aware learn mode (#6)
- Persistent project memory (D5)

---

## III.18 Open questions & risks

- **Step-budget tuning:** what is the right default for `long-horizon`? opencode needed 72–102
  steps; a 100-step budget may blow latency/cost. Needs a budget sweep.
- **Reflexion cost:** an extra attempt doubles worst-case cost per task. Only trigger on
  step-cap cut-off (mid-work), never on clean stops.
- **Compression ceiling:** aggressive compression can *raise* cost (output expansion). Keep
  compression moderate (r≈0.5) and measure output-token deltas.
- **Parallel tool execution** risks context bloat if every speculative call's output enters
  context — gate outputs before they land in history.
- **Delegation overhead:** child sessions pay full retrieval + tool setup. Only delegate when
  bug count ≥ 3 or work is genuinely separable.
- **Cache-prefix vs compaction:** compacting mid-session invalidates the cache prefix; the two
  goals conflict unless compaction is folded into the stable prefix (TokenPilot).
- **Hash-anchored edits** require a content-hash map of files; cost of building/maintaining it
  must stay below the token savings.
- **Per-role routing** adds config complexity; must keep the "single CLI, just works" promise.

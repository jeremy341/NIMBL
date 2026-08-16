# NIMBL — Brainstorm (living document)

> Working note: cross-sector improvements for the NIMBL harness. Each section is a
> brainstorm area; papers are mapped to NIMBL modules and flagged with what they fix and
> whether they keep NIMBL cheap. **This file is meant to be expanded** — add ideas, strike
> dead ones, promote working ones to the plan.
>
> Companion docs:
> - `docs/benchmarks/FAILURE_ANALYSIS_LH_MF_SH.md` — why lh/mf/sh tasks fail
> - `docs/benchmarks/TIER_B_RESEARCH_PAPERS.md` — paper catalog with verified arXiv links
> - `docs/benchmarks/BENCHMARK_PLAN.md` — benchmark methodology & claims rules
> - `docs/benchmarks/TIER_B_FINAL_RESULTS.md` — committed final run results

---

## Table of contents

1. [Agent loop & adaptive compute](#1-agent-loop--adaptive-compute)
2. [Token compression & context selection](#2-token-compression--context-selection)
3. [Prompt caching & cache-prefix continuity](#3-prompt-caching--cache-prefix-continuity)
4. [Memory & "don't re-read"](#4-memory--dont-re-read)
5. [Tool layer (schemas, routing, gating)](#5-tool-layer)
6. [Retrieval quality (graph & query)](#6-retrieval-quality)
7. [Speed & latency](#7-speed--latency)
8. [Teaching/learning (the differentiator)](#8-teachinglearning)
9. [Original NIMBL-specific ideas](#9-original-nimbl-specific-ideas)
10. [Implementation plan](#10-implementation-plan)
11. [Open questions & risks](#11-open-questions--risks)

---

## Context: the core problem we are solving

From `docs/benchmarks/FAILURE_ANALYSIS_LH_MF_SH.md`, NIMBL fails long-horizon (`lh-fix-all` 0/12),
shell-loop (`sh-hidden-green` 5/12), and multi-file (`mf-quote-margin` 7/12) tasks because:

- NIMBL is hard-capped at **8–12 tool steps** (`agent.ts:142 MAX_TOOL_STEPS=12`,
  benchmark forces `maxToolSteps: 8`); opencode used 72–102 steps on the same tasks.
- Failing runs average **52–83 reads / 0–3 edits** (audit loop).
- The step-cap cut-off (`finishReason: "tool-calls"`) is **never retried** (`attempts: 1`).
- The read-to-edit guard (`agent.ts:725`) is advisory only; the doom-loop detector only
  fires on identical `(tool, args)` fingerprints, so distinct reads evade it.
- Delegation exists but its description *discourages* it, and child sessions inherit the
  same 8-step cap.

Every brainstorm section below should be judged against two tests:
1. **Does it fix a real failure?** (solve rate on lh/mf/sh)
2. **Does it keep NIMBL cheap & token-efficient?** (the −40% claim)

---

## 1. Agent loop & adaptive compute

**Status:**  active priority — this is the #1 bug fix area.

### Problem recap
Hard 8–12 step cap; no retry on step-cap; audit loop; no delegation on separable bugs.

### Papers

| Idea | Paper | arXiv | Fixes bug? | Keeps cheap? |
|---|---|---|---|---|
| Adaptive per-step compute by inter-rollout action agreement (commit early on high agreement) | **TrACE** | [2604.08369](https://arxiv.org/abs/2604.08369) | partially |  −33–65% calls |
| Planner/Executor split; emit plan checklist before acting | **Plan-and-Act** | [2503.09572](https://arxiv.org/abs/2503.09572) |  |  plan is cheap |
| On failure, write verbal reflection → retry with it in context | **Reflexion** | [2303.11366](https://arxiv.org/abs/2303.11366) |  |  extra pass |
| Localize → repair → validate phase order, no free roaming | **Agentless** | [2407.01489](https://arxiv.org/abs/2407.01489) |  |  very cheap |
| Graph-based task decomposition → dependency-aware parallel tool execution | **GAP** | [2510.25320](https://arxiv.org/abs/2510.25320) |  |  fewer steps |
| Predict future tool calls from recurring patterns; execute speculatively while LLM generates | **PASTE** | [2603.18897](https://arxiv.org/abs/2603.18897) | partial |  −43.5% task time |
| Milestone checkpoints / milestone-anchored credit | **BEACON** | [2605.06078](https://arxiv.org/abs/2605.06078) |  |  |
| Benchmark: frontier agents need explicit reasoning + parallel tool use long-horizon | **DeepPlanning** | [2601.18137](https://arxiv.org/abs/2601.18137) | — validation | — |

### Candidate implementations
- [ ] **Turn-allocation by task class** — lexical/symbol classifier → `{retrieval:8, single-fix:12, multi-file:40, long-horizon:100}` steps + retrieval budget. Zero extra LLM calls. *(see §9 idea #1)*
- [ ] **Retry on step-cap** — treat `finishReason: "tool-calls"` at the cap as retryable, appending a one-line reflection ("you ran out of steps mid-fix; finish now").
- [ ] **Enforce read-to-edit budget** — after N read-only calls with no edit, `read`/`glob`/`grep` return a directive instead of content (ToolGate-style hard gate).
- [ ] **Verify-gated edits** — every `edit` must be followed by a `bash` verify within 2 steps or the loop is flagged.
- [ ] **Milestone checkpointing** — after every edit, run the verify command; two consecutive failed verifies → stop & reflect (Reflexion), don't burn the budget.
- [ ] **Delegation by bug count** — for N-independent-bug tasks, spawn N subagents with per-bug budgets + merge step; scale child `maxToolSteps: 8` cap.

---

## 2. Token compression & context selection

**Status:**  defense of the −40% claim; cheap wins available.

### Papers

| Idea | Paper | arXiv | Keeps cheap? |
|---|---|---|---|
| Extractive compression > token-pruning > summarization; ~10× compression w/ minimal degradation | **Characterizing Prompt Compression** | [2407.08892](https://arxiv.org/abs/2407.08892) |  |
| Query-aware, sentence-level excerpt pruning (post-retrieval) | **LLMLingua-2 / TACO-RL / CPC / ICPC / DAC / PIS** | [2403.12968](https://arxiv.org/abs/2403.12968) [2409.13035](https://arxiv.org/abs/2409.13035) [2409.01227](https://arxiv.org/abs/2409.01227) [2501.01625](https://arxiv.org/abs/2501.01625) [2507.11942](https://arxiv.org/abs/2507.11942) [2504.16574](https://arxiv.org/abs/2504.16574) |  no extra LLM |
| Generative / attention-only compression (heavier optional path) | **SCOPE / AOC** | [2508.15813](https://arxiv.org/abs/2508.15813) [2501.06730](https://arxiv.org/abs/2501.06730) |  heavier |
| Query-aware compression is provably better (rate-distortion) | **Fundamental Limits** | [2407.15504](https://arxiv.org/abs/2407.15504) |  |
|  Aggressive compression can *increase* cost (output tokens dominate); moderate (r=0.5) saves 27.9% | **Production compression trial** | [2603.23525](https://arxiv.org/abs/2603.23525) |  warning |

### Candidate implementations
- [ ] Sentence-importance filter (lexical + embedding score, query-conditioned) over already-retrieved excerpts.
- [ ] Keep compression moderate; extractive-by-default in `structural-context.ts` / `token-compression.ts`.
- [ ] Benchmark ablation for compression mode (already supported in `benchmarks/run.ts`).

---

## 3. Prompt caching & cache-prefix continuity

**Status:**  high value / low effort.

### Papers

| Idea | Paper | arXiv | Keeps cheap? |
|---|---|---|---|
| Cache only stable prefix; exclude dynamic tool results; dynamic content at end; −41–80% cost | **Don't Break the Cache** | [2601.06007](https://arxiv.org/abs/2601.06007) |  |
| Query-agnostic compression + cache_control + tier-preserving ratio bound; cheapest 16/16 configs | **CAPC** | [2607.15516](https://arxiv.org/abs/2607.15516) |  −49% over cache-only |
| Ingestion-aware compaction that does NOT invalidate the cache prefix | **TokenPilot** | [2606.17016](https://arxiv.org/abs/2606.17016) |  −61–87% |
| Verified semantic caching with per-entry thresholds; up to 12.5× hit rate | **vCache** | [2502.03771](https://arxiv.org/abs/2502.03771) |  |
| KV-cache eviction prioritizing long conversations (P90 TTFT −27%) | **Tail-Optimized LRU** | [2510.15152](https://arxiv.org/abs/2510.15152) |  latency |

### Candidate implementations
- [ ] Make compaction cache-contiguous (fold into the stable system prefix) — `sessions.ts` + `prompt-cache.ts`.
- [ ] Place dynamic retrieval text at the very end of the prompt.
- [ ] Exclude per-step tool results from the cached prefix (keep system + plan cached).

---

## 4. Memory & "don't re-read"

**Status:**  kills the audit loop; top-tier token win.

### Papers

| Idea | Paper | arXiv | Keeps cheap? |
|---|---|---|---|
| Stateful agent = O(1)/turn vs O(n²); −52–90% tokens | **Remember, Don't Re-read** | [2606.14945](https://arxiv.org/abs/2606.14945) |  |
| 3-level code index + intention-aware output gate + compact evidence packets; −51.5% tokens on SWE-bench | **ContextSniper** | [2607.01916](https://arxiv.org/abs/2607.01916) |  |
| Hierarchical memory with index-routed retrieval | **H-MEM / Bi-Mem / Pancake** | [2507.22925](https://arxiv.org/abs/2507.22925) [2601.06490](https://arxiv.org/abs/2601.06490) [2602.21477](https://arxiv.org/abs/2602.21477) |  |
| RL-learned constant-memory / constrained retention / intent-aware graph memory | **MEM1 / OSL-MR / PRISM** | [2506.15841](https://arxiv.org/abs/2506.15841) [2606.10616](https://arxiv.org/abs/2606.10616) [2605.12260](https://arxiv.org/abs/2605.12260) |  |
| Context information-density maximization + self-evolving SOPs; hierarchical on-demand memory | **GenericAgent** | [2604.17091](https://arxiv.org/abs/2604.17091) |  |

### Candidate implementations
- [ ] **Read-cache** — per-session file-hash cache; unchanged files return a "(unchanged)" stub.
- [ ] **Tool-output gating** — only the slice relevant to the current plan (ContextSniper-style).
- [ ] Hierarchical session memory (facts → scenes → persona) as a stronger summary layer.

---

## 5. Tool layer

**Status:**  fixed per-step overhead reduction.

### Papers

| Idea | Paper | arXiv | Keeps cheap? |
|---|---|---|---|
| Compile JSON tool schemas → compact structured text; ≥51% schema-token cut | **TSCG** | [2605.04107](https://arxiv.org/abs/2605.04107) |  |
| Expose only intent-scoped tool sessions; −99.2% tool context | **Tool Forge** | [2605.28000](https://arxiv.org/abs/2605.28000) |  |
| Pre-call execute/skip controller; −31–36% cost | **ToolGate** | [2606.03054](https://arxiv.org/abs/2606.03054) |  |
| Codify delegation contract as pseudocode; −55–87% input / −41–70% output | **CodeAgents** | [2507.03254](https://arxiv.org/abs/2507.03254) |  |
| Dedicated exploration subagent returning paths+line-ranges; −60% tokens, +5.5% resolution | **FastContext** | [2606.14066](https://arxiv.org/abs/2606.14066) |  |
| Parallel tool calls + robust abort → token + time savings | **MCP characterization** | [2511.07426](https://arxiv.org/abs/2511.07426) |  |

### Candidate implementations
- [ ] Compact tool schemas (TSCG-style) in `request-budget.ts`.
- [ ] Per-intent tool subsets (extend `MODE_TOOLS`).
- [ ] Exploration subagent (FastContext) returning paths + line ranges, not full snippets.

---

## 6. Retrieval quality

**Status:**  tuning wins, free.

### Papers

| Idea | Paper | arXiv | Keeps cheap? |
|---|---|---|---|
| Adaptive graph traversal per question type | **PolyG** | [2504.02112](https://arxiv.org/abs/2504.02112) |  |
| LLM control wins only when evidence is scattered (6–10 chunks); heuristic otherwise; final ranking → vector rerank | **RLM-on-KG** | [2604.17056](https://arxiv.org/abs/2604.17056) |  |
| Small-model extraction + cross-chunk graph augmentation | **RAGU / CrossAug** | [2607.11683](https://arxiv.org/abs/2607.11683) [2605.28004](https://arxiv.org/abs/2605.28004) |  |
| Query rewriting trained on reranker feedback (annotation-free) | **RaFe** | [2405.14431](https://arxiv.org/abs/2405.14431) |  |
| Lost-in-the-middle family — keep context short, relevant items at edges | **Lost in the Middle** et al. | [2307.03172](https://arxiv.org/abs/2307.03172) [2406.16008](https://arxiv.org/abs/2406.16008) [2412.10079](https://arxiv.org/abs/2412.10079) [2510.10276](https://arxiv.org/abs/2510.10276) |  |

### Candidate implementations
- [ ] Graph-scatter-aware retrieval budget (widen expansion when matches are scattered; stay lexical when concentrated).
- [ ] Vector rerank as the final ranking stage regardless of discovery method.
- [ ] Reranker-feedback query rewriting (offline trainable, no big LLM).

---

## 7. Speed & latency

**Status:**  mostly informs routing/architecture.

### Papers

| Idea | Paper | arXiv | Keeps cheap? |
|---|---|---|---|
| Draft-verify decoding (1.7–2.1×) | **Kangaroo / BiLD / MoA-SD** | [2404.18911](https://arxiv.org/abs/2404.18911) [2302.07863](https://arxiv.org/abs/2302.07863) [2410.03804](https://arxiv.org/abs/2410.03804) |  provider-side |
| Local small-model triage routing + prompt compression before cloud LLM; 45–79% savings | **Local-Splitter** | [2604.12301](https://arxiv.org/abs/2604.12301) |  |
| Adaptive compute + memory → up to −56% compute with past experience | **SpeedupLLM** | [2505.20643](https://arxiv.org/abs/2505.20643) |  |
| Edge SLM  cloud LLM collaboration taxonomy (task assignment / speculative / routing) | **Edge-Cloud survey** | [2507.16731](https://arxiv.org/abs/2507.16731) |  informs design |

### Candidate implementations
- [ ] Local triage layer for cheap routing (offline embedder already exists — reuse for classification).
- [ ] Prefetch/parallelize independent tool calls (PASTE-style speculative execution where patterns are predictable).

---

## 8. Teaching/learning

**Status:**  differentiator; prompt-level improvements available today.

### Papers

| Idea | Paper | arXiv | Keeps cheap? |
|---|---|---|---|
| Keyword-leakage metric + RL to stop tutors revealing answers (SE 30→63%, leakage 30→13%) | **HeuristicEdu** | [2607.22996](https://arxiv.org/abs/2607.22996) |  adopt metric only |
| Pedagogically-aligned RL for Socratic tutors | **PEARL** | [2605.29582](https://arxiv.org/abs/2605.29582) |  training |
| Socratic question gen via DPO; small model beats prompting | **Socratic DPO** | [2403.00199](https://arxiv.org/abs/2403.00199) |  training |
| Socratic chatbot promotes critical thinking vs direct-answer | **Critical-thinking chatbot** | [2409.05511](https://arxiv.org/abs/2409.05511) |  validates |
| Socratic vs Narrative: Socratic drives engagement; experts prefer Narrative | **TeaPT** | [2509.12107](https://arxiv.org/abs/2509.12107) |  adaptive mode |
| Persist verified fixes as reusable knowledge; +9.4pp SWE-bench | **MemCoder** | [2603.13258](https://arxiv.org/abs/2603.13258) |  |
| Socratic Playground for Learning (multi-turn tutoring) | **SPL** | [2406.13919](https://arxiv.org/abs/2406.13919) |  validates |

### Candidate implementations
- [ ] Add a "did the tutor reveal the answer" leakage scorer to `learn` mode / `question` tool.
- [ ] Adaptive Socratic vs Narrative based on user experience/attitude (TeaPT).
- [ ] Persist verified fixes as project-local knowledge (MemCoder) via `learning.ts` + `skills.ts`.

---

## 9. Original NIMBL-specific ideas

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

## 10. Implementation plan

> Ordered by ROI: fix bugs first, then defend tokens, then cheap wins, then intelligence.

### Phase 1 — fix the 8-step bug (highest ROI, smallest code)
- Task-class turn allocator (#1)
- Step-cap retry with reflection (#8)
- Hard read-to-edit gate (enforce, don't advise)
- Verify-gated edits (#3)

**Expected:** `lh-fix-all` 0/12 → ~8–12/12; `sh-hidden-green` +~3; `mf-quote-margin` +~2.
**Files:** `agent.ts`, `agent-config.ts`, `agent-benchmark.ts`.

### Phase 2 — token defense (keeps −40%)
- Read-cache (#7)
- Tool-output gating (ContextSniper-style)
- Cache-prefix-contiguous compaction (#9)
- Compact tool schemas (#10)

### Phase 3 — efficiency (cheap wins)
- Extractive-default compression
- Sentence-level excerpt pruning
- TrACE adaptive per-step compute
- Delegation for separable bugs (#4)

### Phase 4 — intelligence
- Plan-first escalation (#2)
- FastContext-style exploration subagent
- Query rewriting via reranker feedback
- Leakage-aware learn mode (#6)

---

## 11. Open questions & risks

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

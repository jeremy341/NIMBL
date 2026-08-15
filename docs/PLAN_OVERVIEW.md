# NIMBL — Master Plan (future reference)

> **Purpose:** one document that summarizes everything decided so far — where NIMBL stands,
> what we learned from the benchmarks, the improvement roadmap, and how we will prove progress
> on real-world benchmarks. This is the *reference* plan; `docs/PLAN_NOW.md` is the *immediate
> action* checklist.
>
> **Last updated:** 2026-08-15 · **Baseline commit:** `ec114c8` (committed + pushed, fallback point)

---

## 1. Where NIMBL stands today

### Identity
Token-efficient TypeScript/Bun coding companion that **teaches** (Socratic/learn/explain modes)
instead of just generating code. Provider-agnostic (OpenAI-compatible endpoints), ships as a
single CLI command, strict TypeScript.

### Architecture (src/core/, ~56 modules)
- **Retrieval (unique moat):** `context.ts` lexical + `dependency-graph.ts` symbol graph +
  `embeddings.ts`/`vector-index.ts`/`hybrid-retrieval.ts` semantic + MMR fusion, all budgeted.
  `structural-context.ts` parser-backed declaration chunks.
- **Token accounting:** `request-budget.ts` per-category budgets, `tokenizers.ts` model-aware
  counting, `token-compression.ts` compression, `prompt-cache.ts` stable-prefix caching.
- **Agents:** `agent-config.ts` build/plan/explain/learn modes; `agent.ts` streaming ReAct loop
  with read-to-edit guard (advisory), doom-loop detector, retries.
- **Sessions/learning:** `sessions.ts` CAS storage + compaction; `learning.ts` concept tracking.
- **Benchmarking:** `agent-benchmark.ts` + `opencode-benchmark.ts` harnesses, frozen corpus.

### Known weaknesses (from `docs/FAILURE_ANALYSIS_LH_MF_SH.md`)
1. **Hard 8-step tool cap** (`MAX_TOOL_STEPS=12`, benchmark forces 8) → fails long-horizon /
   multi-file / shell-loop tasks. Every mature harness avoids this.
2. Step-cap cut-off (`finishReason:"tool-calls"`) is never retried → `attempts: 1`.
3. Read-to-edit guard is advisory; doom-loop detector only catches identical fingerprints.
4. Delegation discouraged + child sessions inherit the 8-step cap.
5. Bash tool is PowerShell-only on win32 (blocks POSIX-based real benchmarks).

---

## 2. Benchmark evidence

### Tier-B final results (`docs/TIER_B_FINAL_RESULTS.md`, run-6/7, git `6c38ad0`)
- opencode solved 75/75 (100%); NIMBL solved 67–69/75 (89–92%) depending on mode.
- NIMBL used **40–44% fewer tokens per solved task** (26.2–28.0k vs 46.8k) and ~38% lower latency.
- Failures concentrate in `lh-fix-all` (0/3 all modes), `sh-hidden-green` (1–2/3),
  `mf-quote-margin` (1–2/3) — the long-horizon / shell-loop / multi-file categories.
- Retrieval tasks (`ret-*`) are NIMBL's biggest win: 2–4× fewer tokens at identical 3/3 solving.
- Cost figures use the DeepSeek V4-Flash-0731 reference baseline (`estimateReferenceCost`).

### Failure analysis (`docs/FAILURE_ANALYSIS_LH_MF_SH.md`)
- Every failing run ends `finishReason:"tool-calls"` at the step cap — mid-investigation, not
  mid-fix. opencode needed 72–102 steps on the same tasks.
- Failing runs average 52–83 reads / 0–3 edits (audit loop). Solved runs iterate: run tests →
  read → edit → re-run.
- Root causes (ranked): (1) step cap too low, (2) step-cap not retried, (3) read-to-edit guard
  advisory, (4) doom-loop only catches exact repeats, (5) no delegation for separable bugs.

---

## 3. Improvement roadmap (from `docs/IMPROVEMENT_BRAINSTORM_AND_HARNESSES.md`)

### The core problem
Hard 8-step cap + audit-loop behavior + no retry on step-cap. Every brainstorm/harness section
is judged by two tests: **does it fix a real failure?** and **does it keep NIMBL cheap?**

### Phased plan
| Phase | Goal | Key items |
|---|---|---|
| **1. Fix the 8-step bug** | lh/mf/sh solve-rate | Task-class turn allocator, step-cap retry + reflection, decouple attempts from steps, enforce read-to-edit gate, verify-gated edits |
| **2. Token defense** | keep −40% | Read-cache (don't re-read), tool-output gating, hash-anchored edits, free tool-result pruning, cache-prefix-contiguous compaction, compact tool schemas |
| **3. Efficiency** | cheap wins | Extractive-default compression, sentence-level excerpt pruning, TrACE adaptive compute, cache keepalive, per-role model routing, delegation by bug count |
| **4. Intelligence** | teaching + long-horizon | Plan-first escalation, exploration subagent (FastContext), query rewriting, leakage-aware learn mode, persistent project memory |

### Research foundations (`docs/TIER_B_RESEARCH_PAPERS.md`, `docs/BRAINSTORM.md`)
17 papers cataloged across 8 harness sectors (agent loop, token compression, caching, memory,
tool layer, retrieval, speed, teaching) — all live-verified on arXiv. Tier 1 fixes the lh/mf/sh
failures: ReAct, Plan-and-Act, Reflexion, Agentless, Don't Break the Cache.

### Harness comparison (`docs/HARNESS_COMPARISON.md`)
15 open-source harnesses researched: opencode, Claude Code, Gemini CLI, Codex CLI, Hermes Agent,
Pi/oh-my-pi, OpenHands, Cline, Goose, Aider, Continue, SWE-agent, MiMo-Code, Kimi Code.

**Key insight: zero of the 15 ship built-in semantic retrieval** — NIMBL's biggest moat.
Every competitor relies on model-driven read/grep (the cause of our audit loops). Borrow from
them: oh-my-pi hash-anchored edits (−61% output tokens), Hermes free tool-result pruning,
SWE-agent ACI discipline, Kimi attempts≠steps, Pi CompactionEntry, Codex no-history-rewrite +
10K caps.

### NIMBL's defensible moats
1. Semantic retrieval (nobody else has it)
2. Token accounting as the product (committed benchmark corpus + results)
3. Teaching/learning modes (no competitor is a learning companion)
4. Provider-agnostic + lean (thin TS/Bun core)

---

## 4. Real-world benchmark integration (from the research + confirmed decisions)

**Goal:** run NIMBL on real, industry-standard benchmarks (SWE-bench first, Terminal-Bench later)
— not just the frozen tier-b corpus.

### Confirmed decisions
- **POSIX shell:** add `NIMBL_SHELL_BACKEND=wsl|docker` override to `shell.ts` (option A).
- **Target:** SWE-bench first (Lite subset → Verified), Terminal-Bench later.
- **Scope/cost:** 25–50-instance subset first (~1M tokens), graded on student-pack cloud credits
  (Camber Cloud / GitHub Student Pack) to dodge the 63GB local disk limit.
- **Order:** fix the 8-step cap (Phase 1) BEFORE running SWE-bench so the first real number isn't
  a near-zero artifact.

### Architecture
```
NIMBL prediction layer (Bun)          SWE-bench eval layer (Python/Docker)
─────────────────────────────          ───────────────────────────────────
benchmarks/swebench-run.ts  ───────►  swebench eval Lite \
  │   loads instances                     -p predictions.json
  ├─ checkout repo @ base_commit          (or --modal true / cloud VM)
  ├─ runAgent(issue) [live]
  ├─ captures git diff → model_patch
  └─ writes predictions.json
```
SWE-bench predictions format: `[{"instance_id", "model_patch", "model_name_or_path"}]`.

### Environment constraints
- ✅ git 2.49, Python 3.14, Docker 29.6.1, WSL Ubuntu, Bun 1.3.14
- ⚠️ Only 63GB free disk (SWE-bench eval wants ~120GB) → cloud grading preferred
- ⚠️ PowerShell-only bash tool on win32 → shell backend required

---

## 5. Document map

| Doc | Content |
|---|---|
| `docs/PLAN_NOW.md` | **Immediate actions** (next tasks to execute) |
| `docs/PLAN_OVERVIEW.md` | This file — the master reference |
| `docs/FAILURE_ANALYSIS_LH_MF_SH.md` | Why lh/mf/sh tasks fail (data-backed) |
| `docs/TIER_B_FINAL_RESULTS.md` | Committed final run results (run-6/7) |
| `docs/TIER_B_RESEARCH_PAPERS.md` | Paper catalog with verified arXiv links |
| `docs/BRAINSTORM.md` | Paper-driven improvement brainstorm |
| `docs/HARNESS_COMPARISON.md` | 15-harness architecture comparison |
| `docs/IMPROVEMENT_BRAINSTORM_AND_HARNESSES.md` | Combined brainstorm + comparison + unified borrow list |
| `docs/BENCHMARK_PLAN.md` | Benchmark methodology & claims rules |
| `docs/REAL_BENCHMARK_PLAN.md` *(planned)* | How to fetch/run/grade SWE-bench & Terminal-Bench |

---

## 6. Claims & honesty rules (from `docs/BENCHMARK_PLAN.md`)
- A lower-token result is **not** "better" if quality regresses.
- Only claim savings for modes that solve at least as many tasks as baseline.
- Every run records `benchmarkMetadata` (timestamp, seed, git revision, dirty flag, model,
  context window, cache state). Raw JSONL committed. Same seed + revision + env reproduces.
- Retrieval/solve claims require committed raw results + the producing git revision.

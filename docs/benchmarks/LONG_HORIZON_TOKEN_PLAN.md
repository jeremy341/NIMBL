# Long-Horizon & Shell-Loop Token Reduction — Research-Backed Plan

**Date:** 2026-08-16 · **Status:** approved for staged implementation
**Problem:** NIMBL spends **~2x opencode's token budget** on long-horizon / shell-loop tasks (lh-fix-all 291k vs 184k, sh-hidden-green 195k vs 115k, sh-suite-green 217k vs 152k). All arXiv IDs below were verified live during research.

---

## Part 1 — Diagnosis (from raw TIER-D data, `agent-benchmark-20260728-s3-live-1786879459013.jsonl`)

| Lever | NIMBL | opencode | Why it matters |
|---|---|---|---|
| **Steps** | 115.2 / 90.2 / 87.5 | 87.7 / 73.3 / 75.7 | Each step re-sends the whole history; step count is the #1 cost driver |
| **Cache hit** | **39-57%** | ~90%+ | History mutates mid-run (pruning, trimming) -> provider prefix cache invalidated -> every step re-bills full input. **The single biggest lever.** |
| **Reads/run** | 40-60 | low | Audit-loop re-reads of unchanged files |
| **Test runs** | 20-28 `bun test` | fewer | Full-suite re-runs with raw output (avg 2.3k chars each) |
| **Mid-task condensation** | none (grows to window, then hard-trims = cache kill) | opencode prune + compaction agent | Rolling condensation keeps context bounded AND cache-stable |

Bash output is already capped at 12k chars — **not** the main problem. The gap is `steps x cache-invalidated history x repeated full-suite runs`.

---

## Part 2 — Ranked fixes (Cheap / Smart / Fast; grounded in cited work)

**Rating scale per axis:** `+` = improves, `~` = neutral, `-` = costs.

### Tier 0 — free, deterministic, tool-level (biggest immediate win)

| # | Fix | Mechanism | Source | Cheap | Smart | Fast |
|---|---|---|---|---|---|---|
| **T0.1** | **Test-output delta parser** — detect `bun test` in the bash tool, run with `--reporter=json --bail`, parse deterministically, return `PASS n FAIL m` + first-N failures with <=10-line snippets (~200-400 tokens vs 2-20k). Full log on disk for on-demand read. | SWE-agent ACI, Aider `/test`, ContextSniper | **+** | **+** | **+** |
| **T0.2** | **Test-run memoization** — key by (hash of changed-file set + command); unchanged -> cached verdict, no subprocess, no re-read | Go test cache, LivePlan/FailFast | **+** | ~ | **+** |
| **T0.3** | **Diff-scoped test selection** — after an edit run only affected + last-failed tests (`bun test <file>` from dependency graph; `--onlyChanged` semantics) | NameRTS (skips 69.9% of files, -45.6% time), vitest `related` | **+** | **+** | **+** |
| **T0.4** | ~~Read-cache — unchanged-file re-read stub~~ | **TESTED, FAILED (TIER-E).** Content-less stub pushed the model into `bash Get-Content` and did not fix the doom-loop (detector keys on args, not output). Removed. Replacement: fix the doom-loop detector itself. | Remember Don't Re-read (-52-90%) | ~~ | ~~ | ~~ |
| **T0.5** | **Test-command discipline in shell hint** — `--bail --reporter=json`, "run the single failing test, not the suite" | SWE-agent ACI (fail-fast) | **+** | ~ | **+** |

### Tier 1 — cache stability (turns 39-57% hit -> 85-95%)

| # | Fix | Mechanism | Source | Cheap | Smart | Fast |
|---|---|---|---|---|---|---|
| **T1.1** | **Append-only history** — stop mutating old tool outputs in place during prune; keep the message array/prefix byte-stable | opencode `prune` (protects last 2 turns + 40k, preserves structure), Claude Code append-only | **+** | ~ | **+** |
| **T1.2** | **Rolling condensation** — keep first 4 msgs verbatim (cache-friendly prefix), summarize the middle once per ~40 steps, keep recent tail; never cut mid-tool-loop; iterative summaries; cheap model | OpenHands `LLMSummarizingCondenser` | ~ | **+** | **+** |
| **T1.3** | **Dynamic content at the tail** — retrieval/plan appended at end, never in the cached prefix | Don't Break the Cache (-41-80%) | **+** | ~ | ~ |

### Tier 2 — loop structure (cuts step count, the #1 cost driver)

| # | Fix | Mechanism | Source | Cheap | Smart | Fast |
|---|---|---|---|---|---|---|
| **T2.1** | **Localize->repair->validate phase mode** for lh/sh — deterministic localization (NIMBL's graph/lexical strength) -> edit -> **one gated validation**, no free-roaming test loop | Agentless ($0.70/task, best open cost), AutoCodeRover | **+** | **+** | **+** |
| **T2.2** | **Bounded reflection** — max 3 reflections per bug, then stop & reflect (Reflexion) | Aider `max_reflections=3` | **+** | **+** | **+** |
| **T2.3** | **Plan-first checklist** — emit compact plan before acting (kills audit-loop reads) | Plan-and-Act | **+** | **+** | ~ |
| **T2.4** | **No-progress drift monitor** — deterministic rule (repeated identical command with no intervening edit -> block/instruct), then a cheap-model one-liner | LivePlan (+9.9% at $0.08), FailFast (0.6B, -14-20% tokens) | **+** | **+** | ~ |

### Tier 3 — subagents / parallel (bigger build)

| # | Fix | Mechanism | Source | Cheap | Smart | Fast |
|---|---|---|---|---|---|---|
| **T3.1** | **Cheap test-digest subagent** — small model runs tests, returns digest to main agent (~30% main-token cut) | Terminus-4B (-30% main tokens) | ~ | **+** | ~ |
| **T3.2** | **Graph-decompose lh-fix-all** — dependency-aware DAG -> parallel per-bug subagents/worktrees, merge | GAP, SPOQ (14.3x speedup) | ~ | **+** | **+** |

### Critical caveat (from research)

**"Token Reduction Is Not Cost Reduction"** (arXiv 2607.12161): compressing tool output 38% *increased* billed cost 6.8% because cache-write invalidation dominates input-side cost. **T1 (cache stability) matters more than raw token-cutting.** "How Do AI Agents Spend Your Money" (arXiv 2604.22750) confirms input tokens + cache dominate. Validate every fix by provider-reported cache read/write tokens, not just raw totals.

---

## Part 3 — Implementation order & decision on "before next benchmark"

### Committed decision: implement a 4-fix benchmark-safe set FIRST, defer the rest

Rationale: (1) attribution — bundling many changes makes a regression impossible to debug; (2) risk — condensation/phase-loop/subagents rewrite loop semantics or need cheap-model routing; (3) new-tool adoption — a brand-new tool needs its own validation pass.

> **RESULT (TIER-E): the 4-fix set as first built FAILED — tokens +79%, cost +83%.** Full post-run analysis and the corrected state are in `TIER_E_RESULTS.md` §9. The original implementation plan below is kept only as history; **current code = per-step pruning (restored) + file-path-preserving test summarizer + test memoization; read-cache removed.**

**What was originally planned (historical):**

1. ~~**T0.4 read-cache**~~ — **FAILED/removed** (stub pushed the model into `bash Get-Content`; did not fix the doom-loop).
2. **T0.1 test-output delta parsing** — **kept, but rewritten** to preserve failing file paths + Expected/Received (v1 dropped them, causing 2x full-suite re-runs).
3. **T0.2 test memoization** — **kept** (neutral, fired 9x).
4. ~~**T1.1 one-shot prune**~~ — **FAILED/reverted** to per-step pruning (one-shot let lh-fix-all history grow to 6,154 tokens/step).

**Deferred to separate runs:** T1.2 rolling condensation, T2.1 phase-gated loop, T2.2 bounded reflection, T2.3 plan-first, T2.4 drift monitor, T3.1/T3.2 subagents.

**Next benchmark requirement:** a fresh full 300-run run of the corrected set (per-step pruning + fixed summarizer, no read-cache) to supersede TIER-E. Target: TIER-D solves (288+) at TIER-D-or-better tokens, then the T1.2/T0.3 levers to get under opencode.

---

## References (all verified live on arXiv / GitHub, 2026-08-16)

- Don't Break the Cache — arXiv 2601.06007
- TokenPilot — arXiv 2606.17016
- Remember, Don't Re-read — arXiv 2606.14945
- Dive into Claude Code (5-layer compaction) — arXiv 2604.14228
- Agentless — arXiv 2407.01489
- Plan-and-Act — arXiv 2503.09572 · BEACON — arXiv 2605.06078
- GAP — arXiv 2510.25320 · SPOQ — arXiv 2606.03115
- AdaMAST — arXiv 2607.16387 · TrajDebug — arXiv 2608.06346 · LivePlan — arXiv 2608.06701 · CompactionRL — arXiv 2607.05378
- RGFL — arXiv 2601.18044 · FL-context study — arXiv 2604.05481 · RepoRepair — arXiv 2603.01048
- SWE-agent ACI — arXiv 2405.15793 · ChatRepair — arXiv 2304.00385 · RepairAgent — arXiv 2403.17134 · AutoCodeRover — arXiv 2404.05427 · Reflexion — arXiv 2303.11366
- Token Reduction Is Not Cost Reduction — arXiv 2607.12161 · How Do AI Agents Spend Your Money — arXiv 2604.22750
- FailFast-RestartSmart — arXiv 2608.03222 · SWE-Protégé — arXiv 2602.22124 · SWE-World — arXiv 2602.03419 · Terminus-4B — arXiv 2605.03195
- NameRTS — arXiv 2605.25356 · ReduceFix — arXiv 2507.15251 · ContextSniper — arXiv 2607.01916
- opencode compaction source: `packages/opencode/src/session/compaction.ts` (PRUNE_MINIMUM=20_000, PRUNE_PROTECT=40_000, TOOL_OUTPUT_MAX_CHARS=2_000)
- OpenHands condenser source: `openhands-sdk/openhands/sdk/context/condenser/llm_summarizing_condenser.py`

# Phase 5 Master Research Roadmap

**Status:** research conclusion; implementation deliberately deferred

## Mission

NIMBL should be a cheap, efficient learning companion that retains approximately **80-90% of opencode's coding intelligence** while using less context, fewer unnecessary tool calls, and a stronger teaching loop. The long-term benchmark ambition is to solve all 300 benchmark runs, but quality claims must remain tied to reproducible, quality-constrained measurements.

## Current Position

### Verified strengths

- **Safe-fixes 300-run (2026-08-16): solved 298/300 (99.3%) with 0 zeroed runs; billed 21,364/run (-54.4% vs opencode), full-sent 82,389/run (-58.2%); `lh-fix-all` 12/12 at 177,924 billed vs opencode 183,943.** See `PHASE_5_TIER_F_FIXES_300_VS_OPENCODE.md`.
- TIER-D solved **288/300 (96%)** at approximately **40,992 usable tokens/run** and **35 seconds average latency**.
- NIMBL beats opencode on short single-fix and retrieval families in the reviewed comparison.
- Lexical, structural, graph, semantic, hybrid retrieval, MMR, prompt-cache metadata, request budgets, session storage, and benchmark telemetry already exist.
- TIER-F v2 improved the four hard-task preflight to **43/48**, reduced zeroed runs to **2**, and produced a strong `sh-suite-green` result of **11/12 at approximately 96k tokens**.
- NIMBL's teaching, learning, leakage, permissions, and protected-file systems are differentiated features rather than generic code-generation behavior.

### Verified weaknesses

- **Measurement-integrity items fixed in the safe-fixes set:** unique terminal tool-step accounting (`toolSteps`), per-record `benchmarkMetadata`, normalized `billedTokens`/`totalTokens` on both NIMBL and opencode adapters, and all-run vs solved-only reporting. Remaining: oracle-tag-free evaluation path and failure taxonomy labels.
- TIER-E raised solves to 291/300 but raised usable tokens from 41k to 73k and estimated cost from $0.93 to $1.70. One-shot pruning and a contentless read cache were rejected.
- TIER-F v2 still spent approximately **541k tokens** on `lh-fix-all` while solving 9/12; the 2026-08-16 safe-fixes run reduced this to 584,644 full / 177,924 billed at 12/12.
- Long-horizon and shell-loop tasks overuse Bash file dumps and test commands (improved by the safe-fixes set but still heavier than opencode's ~8-9 bash/run).
- Read-loop protection is not unified across `read`, `grep`, `glob`, and pure file-reading Bash commands (soft-counted via `isReadLikeShellCommand`; not yet a hard unified budget).
- The full 300-task target is now demonstrated once (298/300, one sample, dirty worktree) — needs a second sample on a clean revision to become a release claim.

## North-Star Metrics

Every experiment should report all of these, by task family and aggregate:

1. Solve rate and 95% uncertainty interval.
2. Zeroed/infrastructure-failure rate.
3. Cost per attempted run, cost per solved run, and cost per correct task.
4. Uncached input tokens, cache-read tokens, output tokens, and total tokens separately.
5. Unique tool calls, terminal tool outcomes, Bash calls, file reads, edits, test calls, and retries.
6. Median and p95 latency, not only average latency.
7. Retrieval precision/recall/MRR where retrieval is involved.
8. Teaching leakage, independent learner success, and mastery calibration for Learn mode.
9. Reproducibility metadata: git revision, dirty state, provider, model, seed, corpus, prompt version, mode, and cache state.

### Quality gates

- Easy and retrieval families must remain at or near 100% solve rate.
- A cost improvement is invalid if solve quality regresses beyond the declared confidence interval.
- A solve improvement is not production-ready if failure cost or p95 latency becomes unbounded.
- A hard-task feature must beat TIER-D cost or produce a statistically meaningful solve gain at a stated cost.
- No full 300-run headline should use oracle task tags or incomparable tool-step accounting.

## Strategic Thesis

The best path is not “more autonomous agents.” It is:

> **High-density evidence, phase-gated execution, test-grounded recovery, bounded memory, and selective escalation.**

NIMBL should use its retrieval advantage to localize quickly, then behave like a constrained repair system until verification proves the task is complete. Free-form exploration should be an escalation path, not the default for every task.

## Roadmap

### Phase 0: Measurement Integrity

**Objective:** make future claims trustworthy.

- ✅ **Count unique tool calls separately from running/terminal events.** `toolSteps` counts unique terminal tool IDs (running events excluded) in `agent-benchmark.ts`.
- ✅ **Embed benchmark metadata and revision in each JSONL record.** Every run carries `benchmarkMetadata` (timestamp, seed, git revision, dirty flag, provider, model, context window, cache state).
- ✅ **Report all-run and solved-only metrics, including zeroed attempts.** `billedTokens`/`totalTokens` normalized; zeroed runs recorded as 0; per-family and per-mode tables in every comparison report.
- ✅ **Correct billed-vs-full accounting on both harnesses.** NIMBL `totalTokens` = full input incl. cache-read + output/reasoning; opencode adapter recomputes from raw `step_finish` events (`full = input + cacheRead + output + reasoning`, `billed = input + output + reasoning`).
- ⬜ **Remove oracle tags from one evaluation path and measure classifier accuracy.** Task `tags` still feed the budget selector; production path should test tag-free classifier routing.
- ⬜ **Add failure taxonomy labels to raw traces.** Not yet implemented.
- ⬜ **Hold out tasks from prompt/classifier tuning.** Not yet implemented.

**Exit gate:** a repeated benchmark can be independently reconstructed from one artifact and its manifest. 🟡 — largely met; remaining work is the tag-free path and failure labels.

### Phase 1: Long-Horizon Control

**Objective:** eliminate audit loops without suppressing legitimate investigation.

- Track phases: discover, localize, plan, edit, verify, finish.
- Count `read`, `glob`, `grep`, and pure Bash file dumps as exploration.
- Reset exploration only after an actual edit or recognized verification command.
- Return recoverable directives rather than policy-denial failures.
- Detect no-progress windows, repeated failed tests, unchanged file fingerprints, and read-heavy loops.
- Keep the current hard read budget at 8 until a cap sweep proves otherwise.

**Exit gate:** zeroed runs <= 4/48 on hard preflight, no easy-family regression, and lower `lh-fix-all` Bash/test counts.

### Phase 2: Verification Planner

**Objective:** turn tests into a disciplined state transition.

- Parse failure paths and names from test output.
- Select changed-file tests before full suites.
- Batch verification after related edits rather than after every trivial edit.
- Run final full-suite verification only after targeted checks are green.
- Preserve file paths, test names, errors, Expected/Received, and totals in summaries.

**Exit gate:** `lh-fix-all` returns near TIER-D token cost without losing the TIER-F shell-task solve gains.

### Phase 3: Context and Memory

**Objective:** preserve useful state without rebilling an ever-growing transcript.

- Implement append-only rolling condensation with a structured progress ledger.
- Keep the original user goal, current plan, modified files, test state, unresolved errors, and next action.
- Keep recent tool transactions verbatim and compress only older middle segments.
- Add an evidence registry keyed by file hash, path, symbol, line range, and provenance.
- Never return a contentless read stub as a replacement for source content.

**Exit gate:** lower long-horizon input tokens with no increase in repeated work, lost decisions, or cache-invalidating churn.

### Phase 4: Evidence Retrieval

**Objective:** improve intelligence by selecting better context, not more context.

- Route exact-symbol queries to lexical/structural retrieval.
- Use graph expansion for dependency and cross-file questions.
- Use semantic retrieval for conceptual or underspecified requests.
- Add graph-scatter-aware expansion budgets.
- Return evidence packets with signatures, imports, paths, line ranges, and bounded bodies.
- Add query expansion from compiler errors, test names, exports, and path aliases.
- Evaluate retrieval using precision, recall, MRR, and end-to-end patch success.

**Exit gate:** retrieval modes demonstrate a reproducible quality/ token improvement over the current fixed hybrid baseline.

### Phase 5: Economic Routing and Caching

**Objective:** spend strong-model inference only where it changes outcomes.

- Use a cheap local/classifier model for task family, retrieval mode, and compaction decisions.
- Escalate after failed verification, scattered evidence, or low progress.
- Route compaction, reranking, and teaching checks separately from patch generation.
- Measure provider cache reads, writes, uncached tokens, and actual billing.
- Keep stable system/tool schemas before dynamic retrieval and tool history.
- Test cache correctness across provider, model, prompt version, compaction state, and capability settings.

**Exit gate:** lower cost per correct task with no quality regression and no provider-specific cache claims generalized beyond their evidence.

### Phase 6: Teaching Differentiation

**Objective:** make NIMBL's intelligence useful for learning, not only patch completion.

- Generate explanations from verified trace evidence.
- Track mastery from independent attempts, explanations, quizzes, and later fixes, not assisted success alone.
- Use adaptive Socratic versus narrative modes based on learner preference and evidence.
- Persist verified project patterns as provenance-backed skills with staleness checks.
- Measure answer leakage, learner independence, retention, and follow-up quality.

**Exit gate:** teaching quality improves without adding a large extra inference pass to ordinary coding tasks.

### Phase 7: Full Benchmark and External Validation

**Objective:** establish the 300-task result honestly.

- Expand from repeated samples of 25 tasks to 300 unique, stratified tasks.
- Keep a held-out set for final evaluation.
- Run NIMBL and comparison harnesses with matched model, endpoint, rate limits, verifier, seeds, and task order where possible.
- Publish per-family Pareto frontiers instead of one aggregate number.
- Add SWE-bench Lite or another external repository benchmark after the local harness is stable.

**Exit gate:** a full result reaches the quality target with bounded cost and reproducible metadata. “Solved all 300” is only meaningful if the tasks are unique, hidden checks are valid, and failures are counted.

## Prioritized Experiment Backlog

| Rank | Experiment | Primary target | Success condition |
|---:|---|---|---|
| 1 | Correct accounting and metadata | Measurement | Reproducible artifacts with valid unique-call counts. |
| 2 | Bash-aware progress controller | Zeroed + long-horizon cost | Fewer Bash/file-dump loops and no solve regression. |
| 3 | Bash cap sweep | `lh-fix-all` cost | Select lowest cap with stable solve rate. |
| 4 | Verification policy sweep | Test-call explosion | Lower test calls and equal/higher hard-task solves. |
| 5 | Phase-gated repair mode | Long-horizon intelligence | More completed milestones and fewer no-edit runs. |
| 6 | Rolling ledger/condensation | Context rebilling | Lower p95 tokens and preserved decisions. |
| 7 | Evidence packets | Retrieval + context | Fewer rereads with equal/higher patch success. |
| 8 | Adaptive retrieval | Retrieval quality | Better MRR/recall and no unnecessary context growth. |
| 9 | Intent-scoped schemas | Fixed per-step overhead | Lower uncached tokens/step without malformed calls. |
| 10 | Confidence-based routing | Cost/latency | Lower cost per correct task with stable quality. |
| 11 | Verified project skills | Repeated repository tasks | Higher independent solve rate and no stale advice. |
| 12 | Full 300-task externalized benchmark | Final claim | Reproducible quality-constrained result. |

## Rejected or Deferred Designs

- **Contentless read cache:** rejected by TIER-E because it drove Bash `Get-Content` and did not fix the argument-based doom loop.
- **One-shot pruning:** rejected by TIER-E because stable cache prefixes did not offset unbounded history rebilling.
- **Always-on tree search:** deferred because its token/latency cost is unjustified for easy tasks.
- **Unvalidated semantic-quality claims:** deferred until retrieval ablations and metrics support them.
- **Automatic large-scale delegation:** deferred until structured child contracts and merge verification exist.

## Final Recommendation

> **Updated 2026-08-16 after the safe-fixes 300-run:** the full 300-run target is now demonstrated
> once (298/300, 0 zeroed, billed −54.4% vs opencode, `lh-fix-all` 12/12 under opencode's billed
> cost). The `lh-fix-all` tail that blocked the full benchmark is no longer a blocker on a billed
> basis. Next: run a **second 300-run sample on a clean revision** to confirm stability, and isolate
> each safe opt-in (`NIMBL_SCOPED_TOOLS`, `NIMBL_TEST_CACHE_HASH`, `NIMBL_REPO_MAP`) to attribute
> the gain. Then consider a fresh opencode run at the same endpoint for a controlled head-to-head.
> Remaining research priorities are T1.2 rolling condensation and T0.3 diff-scoped test selection
> for the cost tail, plus the tag-free classifier path before any release claim.

If those experiments return `lh-fix-all` toward the TIER-D cost while preserving `sh-suite-green` at roughly 11/12, then run the full benchmark. If not, preserve the current stable TIER-D baseline and continue tuning rather than spending more on a benchmark that cannot yet answer the cheapness question.

## Source Documents

- `PHASE_5_PUBLIC_HARNESS_RESEARCH.md`
- `PHASE_5_TIER_F_PREFLIGHT_RESULTS.md`
- `PHASE_5_RESEARCH_PAPERS.md`
- `PHASE_5_NIMBL_OPTIMIZATION_BRAINSTORM.md`
- `TIER_D_RESULTS.md`
- `TIER_E_RESULTS.md`
- `TIER_E_VS_OPENCODE.md`
- `ANALYSIS_BOTTLENECKS_AND_FIXES.md`
- `BRAINSTORM.md`
- `TIER_B_RESEARCH_PAPERS.md`

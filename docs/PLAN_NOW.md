# NIMBL — What To Do Now (immediate action plan)

> **Purpose:** the actionable checklist of what to build *next*. Ordered by dependency and ROI.
> Everything here follows from `docs/PLAN_OVERVIEW.md`; check off items as they land.
>
> **Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done
>
> **Risk filter applied 2026-08-15:** every item is tagged SAFE (no token/solve risk) or
> GATED (safe only with the stated guardrail) or DEFER (dropped / opt-in until measured).
> The step cap is a *ceiling, not a quota* — solved easy tasks stop at 3 turns regardless of
> budget; only *currently-failing* tasks (lh/mf/sh) get more expensive, which is the point.

---

## Prerequisite state
- [x] Baseline commit `ec114c8` committed + pushed (fallback point)
- [x] Failure analysis written (`docs/benchmarks/FAILURE_ANALYSIS_LH_MF_SH.md`)
- [x] Research papers cataloged (`docs/benchmarks/TIER_B_RESEARCH_PAPERS.md`, `docs/benchmarks/BRAINSTORM.md`)
- [x] Harness comparison written (`docs/benchmarks/IMPROVEMENT_BRAINSTORM_AND_HARNESSES.md`)
- [x] Combined improvement doc written (`docs/benchmarks/IMPROVEMENT_BRAINSTORM_AND_HARNESSES.md`)
- [x] Master plan + this plan committed (`0511fb0`)

---

## Sprint A — Safe bug fixes (do now; all in `src/core/agent.ts` + tests)

> These are the high-confidence fixes that can't regress the −40% claim or easy-task cost.
> **Exit:** tier-b rerun shows `lh-fix-all` 0/12 → 6+/12 and `sh-hidden-green`/`mf-quote-margin`
> improve, without raising per-solved tokens on easy tasks.

- [x] **A.1 Audit loop research → failure analysis** (`docs/benchmarks/FAILURE_ANALYSIS_LH_MF_SH.md`).
- [x] **A.2 Hard read-to-edit gate** — track `readsSinceEdit` in the `runAgent` closure
  (increment on read/glob/grep execute, reset on edit/write/apply_patch). When ≥ `readBudget`
  (default 12), the `read` tool **returns a directive instead of content** ("Investigation budget
  reached: N read-only calls since the last edit. Make the focused edit now or answer directly.").
  Replaces the advisory `prepareStep` injection (proven insufficient: failing runs did 52–83
  reads / 0–3 edits). *(ToolGate; BRAINSTORM #3)* — **SAFE** (can't increase tokens; forces
  act-over-audit).
- [x] **A.3 Step-cap retry with reflection** — in the attempt loop (agent.ts:699), if a run
  returns normally with `finishReason:"tool-calls"` at the cap **and** `attemptActivity`
  (real work happened), append a one-line continuation ("You ran out of steps mid-fix. Finish
  the fix now with minimal steps.") and retry once. Bounded by existing `maxAttempts`/
  `MAX_ATTEMPTS=3`; only fires on currently-failing runs. *(Reflexion; opencode MAX_STEPS)* —
  **GATED**: only on step-cap mid-work, never on clean stops.
- [x] **A.4 Verify-gated edits (nudge)** — after an `edit`, reset the read-counter only on a
  `bash` test run (or an explicit "done, no test needed" answer), not on the next read — in
  `build` mode only. Encodes the solved pattern (solved `sh-hidden-green`: 18 edits + 14 bash;
  failed: 3 edits + 5 bash). *(BRAINSTORM #3)* — **GATED**: nudge, not hard block; build-mode
  only; "done, no test needed" is a valid verify.
- [x] **A.5 Error-as-observation resilience** — feed tool errors back to the model as short
  observations instead of throwing/aborting, so it self-recovers (Goose). Keep the doom-loop
  guard. *(D3)* — **SAFE** (short error text replaces a failed attempt). *(already the existing
  tool pattern; verified — no code change needed)*

---

## Sprint B — Safe token defense (do now)

> **Exit:** tier-b rerun shows per-solved tokens stay ~26–28k while solve rate holds/climbs.

- [x] **B.1 Conditional tool-result pruning (tail-protected)** — when a session nears the
  context budget, stub **old, completed** tool outputs >200 chars with a marker, **never** `edit`
  diffs / error outputs, **keep a recent tail** (protected window). No LLM call (Hermes phase 1).
  *(B2)* — **GATED**: only near budget, only old outputs, tail-protected.
- [x] **B.2 Cache-prefix boundary guard** — assert/ensure compaction **only touches the dynamic
  tail** after the cache breakpoint; the stable system+instructions prefix is never mutated.
  *(B4; TokenPilot)* — **SAFE** (a discipline guard, not prefix-folding). *(moved the session
  summary out of the stable prefix into the dynamic tail in agent.ts)*
- [x] **B.3 Extractive-first default** — `structural` compression is already the mode in
  `MODE_OPTIONS`; make it the documented hard default and add a benchmark ablation for it.
  *(Characterizing Prompt Compression)* — **SAFE** *(already the default; ablated in
  `benchmarks/run.ts`)*.
- [x] **B.4 BM25 skill selection** — filter `skills.ts` skill text by lexical relevance to the
  current prompt (reuse `context.ts` terms) so only relevant skill content loads. *(MiMo; C4)* —
  **SAFE** (pure reduction; skills already load on demand). *(new `selectRelevantSkills`)*
- [x] **B.5 Leakage-aware learn mode** — add a "did the tutor reveal the answer" heuristic scorer
  to the existing `question`/`learn` tools (no extra LLM call). *(HeuristicEdu; BRAINSTORM #6)* —
  **SAFE** (heuristic on existing output; learn-mode only). *(new `leakageScore`/`leakageLabel`)*

---

## Sprint C — Per-class budgets ONLY (the 8-step fix, done safely)

> **Do NOT raise the global default.** The cap is what keeps easy tasks cheap; we keep small
> budgets for easy/retrieval and reserve high budgets only for the long-horizon class.
> This is the direct answer to "isn't 8 turns why NIMBL is cheap?" — yes, so we keep it for the
> tasks where it's appropriate.

- [x] **C.1 Task-classifier** — `src/core/task-classifier.ts`: lexical/symbol classifier maps
  the prompt (+ optional task `tags`) to a family and a budget:
  `{retrieval:8, single-fix:12, test-writing:16, delegation:16, multi-file:40, shell-loop:50, long-horizon:100}`.
  Zero extra LLM calls. Retrieval limit widens 12→16 only for multi-file/long-horizon;
  per-family guidance is injected for the three corrective-behavior families.
  `classifyTask(prompt, tags?)` falls back to `single-fix/12` (status-quo-safe).
  *(BRAINSTORM #1)*
- [x] **C.2 Wire classifier into agent** — `agent.ts` runs `classifyTask(last user text, taskTags)`
  once, then `stepBudget = Math.min(classified.maxToolSteps, options.maxToolSteps ?? MAX_TOOL_STEPS)`
  — an explicit `maxToolSteps` is a hard ceiling on the classified budget, never a raise.
  `MAX_TOOL_STEPS = 100` is now only the absolute runaway safety ceiling. Production default
  (tasks.ts `maxSteps: 100`) no longer clamps classified budgets to 12.
- [x] **C.3 Wire classifier into benchmark** — `agent-benchmark.ts` passes `task.tags` to the
  parent (single source of truth) and the child's budget is
  `min(classify(child prompt), classify(parent prompt, tags))` instead of flat 8. Runs and
  JSONL records carry `family` + `maxToolSteps`; compare-run prints a per-family table
  (solved/tokens/steps/budget) so the token claim restates per category.
- [x] **C.4 Decouple attempts from steps** — `executedToolSteps` counts only `tool-call` parts,
  so transient 429/5xx/timeout retries inside an attempt never consume the budget. Step-cap
  continuations share the task budget (16 → 15, not a fresh 16).
- [x] **C.5 Delegate + TUI child caps** — core `delegate()` children classify their own prompt
  (capped by `options.maxToolSteps`); TUI `runSubagent` children are capped by the parent
  session's classified budget (`classifyTask(parent last user message).maxToolSteps`).

**Honest metric note:** raising solve-rate on lh/mf/sh will raise NIMBL's *per-solved average*
from ~26k toward ~30–35k (adding solved hard tasks). opencode is 46.8k, so the claim stays
negative (~−25%), but it **must be restated per category**, not as one headline.

---

## Sprint F — Phase-5 safe fixes (measured 2026-08-16, 300-run)

> Full results: `docs/benchmarks/PHASE_5_TIER_F_FIXES_300_VS_OPENCODE.md`. This sprint proved the
> Phase-5 measurement + hard-task levers end-to-end. It is a single 300-run sample on a dirty
> worktree — not yet a release claim.

- [x] **F.1 Accounting + metadata correctness** — `billedTokens`/`totalTokens` normalized on both
  harnesses; per-record `benchmarkMetadata`; `toolSteps` counts unique terminal tool calls.
  *(PHASE_5_MASTER_RESEARCH_ROADMAP Phase 0)*
- [x] **F.2 Scoped tools (opt-in)** — `NIMBL_SCOPED_TOOLS=1` narrows the catalog per classified
  family and re-classifies per model step (`prepareStep` → `activeTools`). *(B2)*
- [x] **F.3 Hashed test-cache invalidation (opt-in)** — `NIMBL_TEST_CACHE_HASH=1` keys cached
  test verdicts on a hash of the changed-file set, so unrelated edits don't evict them. *(T0.2)*
- [x] **F.4 Repository map (opt-in)** — `NIMBL_REPO_MAP=1` injects a compact structural
  orientation map (file → symbols@lines) into the system prefix for large repos. *(C5 partial)*
- [x] **F.5 Read-output gating** — `read` returns a 120-line page by default with `startLine`/
  `endLine`/`full:true`; read-like Bash commands are soft-counted toward the investigation budget.
  *(B4 / A2)*
- [x] **F.6 Read-loop + batch-verify guidance** — doom-loop exempts grep/glob; soft repeated-query
  nudge; shell hint and classifier guidance rewritten for batch verification.

**Measured (2026-08-16):** 298/300 solved (99.3%), 0 zeroed; billed 21,364/run vs opencode
46,844 (**−54.4%**); full-sent 82,389 vs 196,918 (**−58.2%**); `lh-fix-all` 12/12 at 177,924
billed vs opencode 183,943 (**−3.3%**).

---

## Sprint D — SWE-bench + real benchmarks (after A–C)

> POSIX shell backend is the prerequisite. SWE-bench evaluation wants ~120GB free (we have 63GB)
> → grade on student-pack cloud credits (Camber Cloud / Modal / GitHub Actions).

- [ ] **D.1 POSIX shell backend** — `NIMBL_SHELL_BACKEND=wsl|docker` override in `shell.ts`;
  update the win32 bash hint; keep process-tree kill + bounded output. *(PLAN_OVERVIEW §4)*
- [ ] **D.2 SWE-bench runner** — `benchmarks/swebench-run.ts`: fetch Lite subset (25–50,
  stratified), checkout `base_commit`, `runAgent(problem_statement)` live, capture `git diff` →
  `predictions.json`, emit `benchmarkMetadata` records.
- [ ] **D.3 Grading (cloud-first)** — `swebench eval Lite -p predictions.json --run-id nimbl-subset`
  on the chosen host; commit raw results + revision.
- [ ] **D.4 `docs/REAL_BENCHMARK_PLAN.md`** — how to fetch/run/grade, cost estimates, claims rule.
- [ ] **D.5 Terminal-Bench later** — `uv tool install 'harbor[modal]'`, NIMBL agent adapter.

---

## Deferred / opt-in / dropped (risk review 2026-08-15)

| Item | Status | Why |
|---|---|---|
| **Hash-anchored edits** (oh-my-pi hashline, −61%) | **DROP for now** | Needs content-hash map + `edit` schema change; a free model emitting missing/stale hashes → rejected edits → retries → more tokens/steps on a tight budget. Worst failure mode for a cheap harness. Revisit after Sprint A measured. |
| **ACI hard caps** (100-line viewer, filename-only grep) | **OPT-IN modes** | NIMBL already has retrieval that selects excerpts; hard caps can conflict and force extra reads. Take the safe 20% (empty-output sentinel, linter-gated edits), leave caps opt-in. |
| **Plan-first escalation** (Plan-and-Act) | **OPT-IN** | Extra full LLM pass (~5–8k tokens) before every long-horizon task. Use cheapest model for planning if enabled. |
| **Exploration subagent** (FastContext) | **HUGE-REPO ONLY** | Child costs full retrieval + tool setup + return summary (tokens *increase*). Only for genuinely large repos; cap child iterations + ≤1k summary. |
| **Persistent project memory** | **GATED** | Only with MiMo-style budgeted injection + importance ranking + hard token cap, else it eats the context budget every session. |
| **Inline security-risk self-labeling** | **DEFER** | Extra output field on every tool call + schema change → small-model schema errors → retries/steps. |
| **Per-role model routing** | **GATED** | Keep main loop on the flagship model; only title/summary/compaction may use a cheap model (Hermes warns cheap summaries degrade compaction). |
| **Iterative summaries for teaching** | **GATED** | Teaching-only, cheap-model-gated; compaction cost rises. |
| **Query-aware sentence pruning** | **CONSERVATIVE** | Keep query-aware + conservative to avoid dropping a needed sentence → re-read. |
| **Cache keepalive pings** | **SMALL** | Only if provider supports TTL pings; tiny ping token cost. |

---

## Standing rules
- **Commit + push after each sprint** (small fallback points; never lose a working state).
- **Benchmark before/after each change** on the tier-b corpus; keep the −40% token claim intact
  (quality must not regress — `docs/benchmarks/BENCHMARK_PLAN.md`).
- **No secrets in commits** — keys via env only.
- **Verify with `bun test` + `bun run typecheck`** after each sprint.

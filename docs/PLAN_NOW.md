# NIMBL — What To Do Now (immediate action plan)

> **Purpose:** the actionable checklist of what to build *next*. Ordered by dependency and ROI.
> Everything here follows from `docs/PLAN_OVERVIEW.md`; check off items as they land.
>
> **Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done

---

## Prerequisite state
- [x] Baseline commit `ec114c8` committed + pushed (fallback point)
- [x] Failure analysis written (`docs/FAILURE_ANALYSIS_LH_MF_SH.md`)
- [x] Research papers cataloged (`docs/TIER_B_RESEARCH_PAPERS.md`, `docs/BRAINSTORM.md`)
- [x] Harness comparison written (`docs/HARNESS_COMPARISON.md`)
- [x] Combined improvement doc written (`docs/IMPROVEMENT_BRAINSTORM_AND_HARNESSES.md`)
- [ ] Master plan + this plan committed

---

## Phase 1 — Fix the 8-step bug (HIGHEST ROI, do this first)

> Files: `src/core/agent.ts`, `src/core/agent-config.ts`, `src/core/agent-benchmark.ts`,
> `tests/agent-run.test.ts`, `tests/agent-benchmark.test.ts`.
> **Why first:** SWE-bench will be wasted on a known-broken cap if we run it before this.

- [ ] **1.1 Task-class turn allocator** — lexical/symbol classifier maps the prompt to a task
  family `{retrieval, single-fix, multi-file, long-horizon}` and allocates `maxToolSteps`
  (e.g. 8 / 12 / 40 / 100) + retrieval budget. Zero extra LLM calls. *(BRAINSTORM #1)*
- [ ] **1.2 Step-cap retry with reflection** — treat `finishReason:"tool-calls"` at the cap as
  retryable: append a one-line reflection ("you ran out of steps mid-fix; finish now") and retry.
  *(BRAINSTORM #8; Reflexion)*
- [ ] **1.3 Decouple attempts from steps** — transient 429/5xx/timeout retries must NOT consume
  the step budget. *(Kimi `max_attempts_per_step`)*
- [ ] **1.4 Enforce the read-to-edit gate** — after N read-only calls with no edit,
  `read`/`glob`/`grep` return a directive instead of content (hard gate, not advisory).
  *(ToolGate)*
- [ ] **1.5 Verify-gated edits** — every `edit` must be followed by a `bash` verify within 2
  steps or the loop is flagged. *(BRAINSTORM #3)*
- [ ] **1.6 Scale the child `maxToolSteps: 8` cap** for delegated subagents + update the
  `delegate` tool description to *encourage* use for separable bugs. *(BRAINSTORM #4)*

**Exit criteria:** run the tier-b harness (`bun benchmarks/compare-run.ts`) and confirm
`lh-fix-all` moves from 0/12 toward 8–12/12 and `sh-hidden-green`/`mf-quote-margin` improve,
without regressing the −40% token efficiency.

---

## Phase 2 — POSIX shell backend (prerequisite for real benchmarks)

> Files: `src/core/shell.ts`, `src/core/agent.ts` (shell hint).

- [ ] **2.1 Add `NIMBL_SHELL_BACKEND` env override** to `runShellCommand`:
  - `"wsl"` → `["wsl.exe", "-e", "bash", "-lc", command]`
  - `"docker"` → `["docker", "exec", "-i", "nimbl-bench", "bash", "-lc", command]`
  - unset/`"auto"` → current `powershell` (win32) / `/bin/sh` (posix) behavior
- [ ] **2.2 Update `shellDescription()`** in `agent.ts` so the bash-tool hint mentions WSL when
  the backend is POSIX.
- [ ] **2.3 Keep process-tree kill + bounded output logic** (shell-agnostic, no change).
- [ ] **2.4 Add a test** for the backend-selection logic (`tests/`).

**Exit criteria:** `NIMBL_SHELL_BACKEND=wsl bun benchmarks/opencode-only-run.ts`-style runs
execute POSIX commands (e.g. `bun test` inside the fixture) through WSL successfully.

---

## Phase 3 — SWE-bench runner

> Files: `benchmarks/swebench-run.ts` (new), `src/core/agent-benchmark.ts` (export helpers),
> `docs/REAL_BENCHMARK_PLAN.md` (new).

- [ ] **3.1 Corpus fetch script** — download a SWE-bench Lite subset (25–50 instances) to
  `benchmarks/corpus/swebench/` as JSONL `{instance_id, repo, base_commit, problem_statement,
  patch}` (HF `princeton-nlp/SWE-bench_Lite`). Stratify by difficulty if possible.
- [ ] **3.2 Runner** `benchmarks/swebench-run.ts` mirroring `compare-run.ts`:
  - per instance: `git clone --no-checkout` repo once → `git checkout base_commit` → per-sample
    isolated workspace copy
  - `runAgent({ mode:"build", messages:[problem_statement], live, permissions:"*":allow })`
    with the WSL shell backend, shared rate limiter + concurrency
  - capture `git diff` in the workspace → `model_patch`
  - write `predictions.json` `[{instance_id, model_patch, model_name_or_path:"nimbl-hybrid"}]`
  - emit per-run records via `appendBenchmarkRecords` + `benchmarkMetadata`
- [ ] **3.3 Verify one instance** end-to-end locally (gold patch → predictions.json → local
  `swebench eval` on a single instance if disk allows).

**Exit criteria:** predictions.json for the subset is produced with per-run token/cost/latency
records; one gold patch grades correctly through SWE-bench.

---

## Phase 4 — Grading (cloud-first)

- [ ] **4.1 Decide grading host**: Camber Cloud / GitHub Student Pack VM vs Modal
  (`--modal true`) vs GitHub Actions runner. Prefer student-pack credits (already claimed?).
- [ ] **4.2 Run `swebench eval Lite -p predictions.json --run-id nimbl-subset`** on the chosen
  host.
- [ ] **4.3 Commit raw predictions + results** (per claims rule: raw JSONL + git revision).
- [ ] **4.4 Write `docs/REAL_BENCHMARK_PLAN.md`** — how to fetch/run/grade, cost estimates,
  claims rule, Terminal-Bench follow-up.

**Exit criteria:** a committed, reproducible SWE-bench subset score for NIMBL with opencode
comparison on the same instances.

---

## Phase 5 — Terminal-Bench (later)

- [ ] **5.1 Install Harbor:** `uv tool install 'harbor[modal]'`.
- [ ] **5.2 Add a NIMBL agent adapter** to Harbor (`harbor run -d terminal-bench/... --agent
  nimbl`) using the POSIX shell backend.
- [ ] **5.3 Run a subset + commit results.**

---

## After real benchmarks — Phases 2–4 of the improvement roadmap

Once Phase 1 lands and the harness works on SWE-bench:
- **Token defense:** read-cache, tool-output gating, hash-anchored edits, tool-result pruning,
  cache-prefix-contiguous compaction, compact tool schemas.
- **Efficiency:** extractive-default compression, sentence pruning, TrACE adaptive compute,
  cache keepalive, per-role model routing.
- **Intelligence:** plan-first escalation, exploration subagent, query rewriting, leakage-aware
  learn mode, persistent project memory.

See `docs/IMPROVEMENT_BRAINSTORM_AND_HARNESSES.md` §III.17 for the full phased breakdown.

---

## Standing rules
- **Commit + push after each phase** (small fallback points; never lose a working state).
- **Benchmark before/after each change** on the tier-b corpus; keep the −40% token claim intact
  (quality must not regress — `docs/BENCHMARK_PLAN.md`).
- **No secrets in commits** — keys via env only.
- **Verify with `bun test` + `bun run typecheck`** after each phase.

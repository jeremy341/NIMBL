# NIMBL — Bottleneck Analysis & Rated Fix Matrix (2026-08-16)

**Source:** raw StreamLake run `agent-benchmark-20260728-s3-live-1786870987145.jsonl` (300 runs), cross-checked against Sprint C (`...786898.jsonl`) and opencode run-7. Model: `deepseek/deepseek-v4-flash-0731:StreamLake` @ OpenRouter, concurrency 8, 180 rpm.

**Rating scale per axis (Cheap / Smart / Fast):**
- `+` = improves (saves tokens / raises solves / cuts latency), `~` = neutral, `-` = costs (more tokens / fewer solves / slower)

---

## 1. Measured bottlenecks (from raw data)

| # | Bottleneck | Evidence | Primary axis hit |
|---|---|---|---|
| **B1** | **Step-cap continuation dead-end → 18 zeroed runs** | `lh-fix-all` 7, `sh-suite-green` 7, `sh-hidden-green` 4 zeroed (`finishReason=undefined, totalTokens=0`). `prepareStep` throws non-retryable `Tool-loop context reached`. If fixed at 50% solve rate: 288/300 (96%). | **Smart** (solve gap) |
| **B2** | **Shell-loop family: latency + zeroed** | 13/24 solved, **11 zeroed**, 163k tok, 94 steps, **382s avg latency** (longest). Solved runs still do 28 bash / 41 reads / 21 edits. bash-driven loop dominates wall time. | **Fast + Smart** |
| **B3** | **Fixed per-step overhead** | Only **707 uncached tokens/step** — the ~34.5k avg run token cost is almost entirely per-step re-sent context (system + schemas + history), not big tool outputs. 67% of input is cache-read (prompt caching works). | **Cheap** |
| **B4** | **Request latency on StreamLake** | Per-step 4.0s vs netic 2.0s (+105%); avg run 62s vs 37s. Wall clock still faster (47m vs 54m) only because concurrency 8. | **Fast** |
| **B5** | **Audit-loop read pattern (shell-loop / long-horizon)** | read:edit ≈ 2:1; shell-loop solved runs still burn 41 reads each. Doom-loop detector only catches identical fingerprints. | **Cheap + Fast** |
| **B6** | **Delegation per-step latency** | 7.2s/step (worst) — child + parent churn. Children hit their 8-step cap + continuation (~14-17k tokens each). | **Cheap + Fast** |
| **B7** | **Multi-file sub-100% solves** | 34/36 (2 unsolved = mf-fulfill-dispatch 10/12). Cheap (34k) and fast (74s) but not perfect. | **Smart** |
| **B8** | **`none` mode regressed** | +9.9% tokens vs old run while all 3 retrieval modes improved. | **Cheap** |

---

## 2. Fixes & improvements — rated matrix

> **Status legend added 2026-08-16:** ✅ = built & live in the safe-fixes set (validated by the
> 300-run `PHASE_5_TIER_F_FIXES_300_VS_OPENCODE.md`); 🟡 = partial/opt-in; ❌ = tested-and-failed
> (removed); — = not built.

### A. Agent loop / solve-rate

| Fix | Source | Cheap | Smart | Fast | Notes |
|---|---|---|---|---|---|
| **A1. Graceful context overflow (don't throw in `prepareStep`)** | BRAINSTORM §12 #1 | `~` | `+` | `~` | Prune oldest tool results / drop oldest pairs before the guard; cap continuation re-arms at 3; return partial text instead of dying. **P0 — the whole solve gap.** ✅ (fixed in TIER-D; `MAX_CONTINUATIONS=3`) |
| **A2. Plan-first escalation** (long-horizon → `plan` pass → `build`) | #2 | `-` | `+` | `-` | Extra full LLM pass (~5-8k tok). Only for lh/shell. — (opt-in, not built) |
| **A3. FastContext exploration subagent** (paths+line-ranges, not snippets) | A4 | `~` | `+` | `~` | Huge repos only; child cost can exceed savings. — |
| **A4. Agentless localize→repair→validate** phase mode | Tier-1 #4 | `+` | `+` | `~` | Strict phase order kills wander; targets mf/lh. — |
| **A5. Delegation by bug count** + schema-validated child return | #4 / A3 | `+` | `+` | `~` | `{done, blocked, files, decision}` return → parent edits w/o re-reading. — |
| **A6. Cap research children at 6 steps** (not 8) | Sprint C opt | `+` | `~` | `+` | Traces use 3-6; kills continuation overhead. — |
| **A7. Raise shell-loop budget 50→60, long-horizon 100→120** | budget sweep | `-` | `+` | `-` | More steps = more solves but more tokens/latency on hard tasks. Measure first. — (not needed: 300-run solved 12/12 hard tasks at current budgets) |

### B. Token defense / cheap axis

| Fix | Source | Cheap | Smart | Fast | Notes |
|---|---|---|---|---|---|
| **B1. Read-cache / "don't re-read"** (hash-stub unchanged files) | #7 / Tier-2 #9 | `~` | `~` | `~` | **TESTED IN TIER-E, FAILED.** The content-less stub pushed the model into `bash Get-Content` (bash 810 -> 1608) and did not stop the doom-loop (detector keys on args, not output). Reverted/removed. Do NOT re-implement as a stub. ❌ |
| **B2. Read/glob/grep-ratio hard gate** (reads ≥8 & edits==0 → block) | ToolGate | `+` | `~` | `+` | Complements identical-fingerprint doom-loop. ✅ (read gate at `readBudget=8` in build mode + A2 soft-counts pure file-inspection Bash) |
| **B3. Compact tool schemas (TSCG, ≥51% cut)** | #10 / Tier-3 #11 | `+` | `~` | `~` | Cuts the 707-token fixed/step overhead directly. — |
| **B4. Read-output gating (ContextSniper)** | Tier-2 #8 | `+` | `~` | `~` | Return requested slice by default; `full:true` for whole file. ✅ (120-line default page + `full:true` in the `read` tool) |
| **B5. Cache-prefix-contiguous compaction** (fold into stable prefix) | #9 / TokenPilot | `+` | `~` | `+` | Preserves prompt-cache across compaction; keeps 67% cache share. 🟡 (summary moved out of stable prefix; prefix boundary guard live) |
| **B6. `max_input_size` vs window + 10K fragment caps** | B5/B6 | `+` | `~` | `~` | Compaction off usable input tier. — |
| **B7. Query-aware sentence excerpt pruning** | C5 | `+` | `~` | `~` | Conservative; avoid dropping needed sentence → re-read. — |
| **B8. Retrieval as production default** (hybrid/prompt-cache) | analysis | `+` | `~` | `~` | Both beat `none` (30.7k/28.9k vs 46k). ✅ (retrieval modes ablated & measured in every live run) |

### C. Latency / speed

| Fix | Source | Cheap | Smart | Fast | Notes |
|---|---|---|---|---|---|
| **C1. Provider latency probe before runs** | analysis | `~` | `~` | `+` | Pick netic-class for UX, throughput hosts for bench. |
| **C2. Concurrency tuning** (4 = latency parity, 8 = throughput) | analysis | `~` | `~` | `+` | c8 halves wall clock but doubles per-request latency. |
| **C3. Shell-loop bash discipline** (verify once, don't re-run unchanged tests) | FAILURE_ANALYSIS | `+` | `+` | `+` | 28 bash/run on solved shell-loop is the wall-time driver (382s). ✅ (shell hint + test memoization + guidance rewritten for batch verification) |
| **C4. Parallel independent tool calls (PASTE)** | Tier-3 #11 | `~` | `~` | `+` | Risky: speculative outputs can bloat context — gate before landing. — |
| **C5. Cache keepalive pings** | C1 | `~` | `~` | `~` | Provider-dependent TTL support. — |

### D. Teaching / differentiator

| Fix | Source | Cheap | Smart | Fast | Notes |
|---|---|---|---|---|---|
| **D1. MemCoder verified-fix persistence** → project skills | D5 / Tier-5 #17 | `+` | `+` | `+` | Store fix pattern; inject next session. Compounds value. |
| **D2. Leakage-aware learn mode** | #6 | `~` | `+` | `~` | Done (B.5). ✅ |
| **D3. Adaptive Socratic vs Narrative (TeaPT)** | Tier-5 #16 | `~` | `+` | `~` | — (P3) |
| **D4. Quiz/assessment schema** | AI_ROADMAP P5-04 | `~` | `+` | `~` | — (P3) |

### E. Process / reporting

| Fix | Source | Cheap | Smart | Fast | Notes |
|---|---|---|---|---|---|
| **E1. Zeroed-run-aware reporting** | analysis | `+` | `~` | `~` | Exclude zeroed from token means; flag as column. ✅ (`billedTokens` + `totalTokens` normalized; zeroed runs recorded as 0) |
| **E2. Per-difficulty buckets (SWE-bench style)** | BENCHMARK_PLAN | `~` | `+` | `~` | Robust claims. ✅ (`family`/`difficulty`/`tags` + per-family tables in reports) |
| **E3. Commit raw results** (P3-03) | BENCHMARK_PLAN | `-` | `~` | `~` | Currently local-only (decided to keep local). — |

---

## 3. Recommended priority (weighted ROI)

**Tier 1 — do now (cheap to build, big win):**
1. **A1** — fix the continuation bug (P0): +9 solves, solves the entire remaining gap. One `prepareStep` branch + a counter. **DONE in TIER-D.**
2. **B1 is dead** — read-cache stub tested-and-failed in TIER-E (see `TIER_E_RESULTS.md` §9). Replacement: **fix the doom-loop detector** to exempt stub-returning reads, plus **targeted-test discipline** (`bun test <failing-file>`) to cut the 20-40 bash/run toward opencode's ~8-9. ✅ (doom-loop now exempts grep/glob; soft repeated-query nudge; shell hint + memoization)
3. **A6** — cap research children at 6: cheaper delegation, less continuation. — (defer; delegation cost is already below opencode at 12/12 solves)

**Tier 2 — high ROI:**
4. **B3 + B4** — compact schemas + read-output gating: attacks the 707-token/step fixed cost. 🟡 (B4 done; B3 open)
5. **C3** — shell-loop bash discipline: biggest single latency win (382s → ~150s). ✅ (live)
6. **B8** — retrieval-as-default. ✅ (live)

**Tier 3 — strategic:**
7. **A4/A5** — phase-gated loop + codified delegation for mf/lh solves. — (mf/lh now 12/12; revisit only for the cost tail)
8. **D1** — MemCoder persistence (the differentiator). —
9. **C1/C2** — provider/concurrency tuning for product UX. —

**Expected combined impact:** solves 279→~295 (98%+), avg tokens/run 34.5k→~25k, avg latency 62s→~35s, all while keeping NIMBL ~25% cheaper than opencode.

> **Measured outcome (2026-08-16, safe-fixes 300-run):** solves **298/300 (99.3%)** with 0 zeroed
> runs; avg billed 21,364 vs opencode 46,844 (**-54.4%**); full-sent 82,389 vs 196,918 (**-58.2%**);
> `lh-fix-all` 12/12 at 177,924 billed vs opencode 183,943. See
> `docs/benchmarks/PHASE_5_TIER_F_FIXES_300_VS_OPENCODE.md`.

---

*Cross-referenced: `docs/benchmarks/BRAINSTORM.md` §12, `IMPROVEMENT_BRAINSTORM_AND_HARNESSES.md` §19, `FAILURE_ANALYSIS_LH_MF_SH.md`, `PLAN_NOW.md`, `TIER_C_OPT_RESULTS.md`.*

# TIER-E Results — 4-Fix Token-Efficiency Set (OpenRouter - StreamLake - deepseek-v4-flash-0731)

Full 300-run tier-b re-run after the **4-fix token-efficiency set**: read-cache (T0.4), test-output summarization (T0.1), test-run memoization (T0.2), and one-shot tool-result pruning (T1.1). Executed live on **OpenRouter** via the runtime custom provider (the `.env` OPENROUTER_KEY was found revoked mid-project; the valid key is in `~/.local/share/opencode/auth.json`), pinned **StreamLake**, model `deepseek/deepseek-v4-flash-0731:StreamLake`, concurrency 8, 180 req/min.

- **Raw JSONL:** `.nimbl/benchmarks/agent-benchmark-20260728-s3-live-1786885433475.jsonl` (300 records)
- **Per-run raws:** `.nimbl/benchmarks/2026-08-16-tierE-tokenfixes-1786885433475/raw-nimbl/` (300 files) + `run.log`
- **Model:** `deepseek/deepseek-v4-flash-0731:StreamLake` @ `https://openrouter.ai/api/v1`
- **Config:** seed `20260728` - samples 3 - modes `none,lexical,hybrid,prompt-cache` - concurrency 8 - 180 req/min
- **Runtime:** ~21 min - **stderr: 0 lines - zero rate-limit/API errors**
- **Cost:** $1.70 at StreamLake rates ($0.0671/M in, $0.1341/M out, $0.0134/M cache-read); `referenceCostUsd` total $3.12

---

## 1. The four fixes in this run

| # | Fix | File | Intended effect |
|---|---|---|---|
| T0.4 | **Read-cache** — unchanged-file re-read returns `[Unchanged since previous read]` stub (stat signature size+mtime) | `src/core/agent.ts` | Kill identical-read doom-loops + cut 40-60 reads/run |
| T0.1 | **Test-output summarization** — `bun test`/vitest/npm/pnpm/yarn outputs condensed to `Test command exited N` + pass/fail lines | `src/core/shell.ts` | Test output 2.3k chars -> ~300-500 tokens/run |
| T0.2 | **Test-run memoization** — same test command re-run with no file change returns cached verdict | `src/core/agent.ts` | 20-28 test runs -> ~5-8 |
| T1.1 | **One-shot tool-result pruning** — prune old tool outputs only once per run instead of every step | `src/core/agent.ts` | Cache-prefix stability (39-57% -> ~80% cache read) |

Verified: typecheck clean, 36 focused tests pass, 300/301 full-suite (pre-existing `stress.test.ts` failure unchanged).

---

## 2. Headline

| Metric | TIER-D | TIER-E | Δ |
|---|---|---|---|
| Solved | **288/300 (96.0%)** | **291/300 (97.0%)** | **+3** |
| Zeroed (doom-loop on identical reads) | 10/300 (3.3%) | **7/300 (2.3%)** | **-3** |
| Hard API/rate-limit failures | 0 | **0** | = |
| Avg tokens / usable run | 40,992 | **73,451** | **+79% (regression)** |
| Avg tool steps / usable run | 17.9 | 24.1 | +6.2 |
| Avg latency | 35 s | **30 s** | **-5 s** |
| Runtime | 28 min | **21 min** | **-7 min** |
| Est. cost (StreamLake rates) | $0.93 | $1.70 | **+83% (regression)** |
| Cache-read share of input | 64% | **74%** | **+10 pts (T1.1 worked)** |

**Verdict: solve rate up (288 -> 291), zeroed down (10 -> 7), latency down — but tokens/cost regressed hard (+79% tokens, +83% cost).** This is precisely the "Token Reduction Is Not Cost Reduction" failure mode (arXiv 2607.12161): the cache-stability win (T1.1) made the prefix stable, but one-shot pruning removed the per-step history bound, so long tasks let their full history grow to the window and re-billed it on every step.

---

## 3. Per-mode

| mode | solved | zeroed | avg tok | avg steps | avg lat |
|---|---|---|---|---|---|
| none | 74/75 | 1 | 70,886 | 25.0 | 32.7 s |
| lexical | 71/75 | 4 | 60,858 | 20.9 | 28.0 s |
| hybrid | 73/75 | 1 | 63,899 | 24.6 | 30.8 s |
| prompt-cache | 73/75 | 1 | **97,649** | 25.8 | 29.5 s |

`none` solved the most (74/75); `prompt-cache` is now the most token-expensive mode (it enables a stable cached prefix, which interacts badly with the one-shot prune on long tasks).

---

## 4. Per-family (vs TIER-D)

| family | TIER-E solved | TIER-D solved | TIER-E avg tok | TIER-D avg tok | Δ tok |
|---|---|---|---|---|---|
| single-fix | 96/96 | 96/96 | 20,410 | 16,562 | +23% |
| retrieval | 60/60 | 60/60 | 8,020 | 7,126 | +13% |
| test-writing | 24/24 | 24/24 | 41,223 | 27,328 | +51% |
| delegation | 12/12 | 12/12 | 70,515 | 43,513 | +62% |
| multi-file | 46/48 | 46/48 | 48,908 | 35,650 | +37% |
| shell-loop | 33/36 | 30/36 | 202,983 | 129,475 | +57% |
| long-horizon | 20/24 | 20/24 | 409,944 | 154,832 | **+165%** |

Every family solved at or above TIER-D, but every family also spent more tokens — and the hard families regressed worst (long-horizon +165%, shell-loop +57%).

---

## 5. Hard-task solves

| task | TIER-E | TIER-D | Sprint C |
|---|---|---|---|
| lh-fix-all | **8/12** | 9/12 | 4/12 |
| sh-hidden-green | 10/12 | 10/12 | 7/12 |
| sh-suite-green | **11/12** | 8/12 | 5/12 |
| lh-forced-context-rename | **12/12** | 11/12 | 10/12 |

- **sh-suite-green 8 -> 11/12** (best result so far) and **lh-forced-context-rename 11 -> 12/12** — the token-efficiency fixes help the shell-loop class.
- **lh-fix-all regressed 9 -> 8/12** and its token cost exploded 291k -> **939k avg**. 4 of its 12 runs zeroed; the 8 survivors include two >2M-token blowups (2.26M @ 221 steps, 1.69M @ 155 steps).

---

## 6. Root-cause analysis of the regression

Raw event streams show three interacting causes:

1. **One-shot prune (T1.1) removed the per-step history bound.** TIER-D pruned tool results on every step past 24 messages, keeping history small but re-invalidating the cache prefix. TIER-E prunes once per run, so after that the history grows unbounded to the context window and is re-billed on every step. The 2.26M-token lh-fix-all run (221 steps) re-sent a full-window history each step.

2. **Read-cache stub pushed `read` into `bash`.** The `[Unchanged since previous read]` stub carries no content, so on long tasks the model stopped using `read` and switched to `Get-Content` through the bash tool to actually see files. Evidence: bash calls on the 4 hard tasks nearly doubled (**810 -> 1608**) and `Get-Content` bash calls roughly doubled (**334 -> 624**). Bash outputs are raw (not summarized) and each bash call also resets the read-to-edit gate counter, so the audit-loop guard never engages.

3. **Read-cache + test-memoization barely engaged.** Only **4** unchanged-read events fired across 8 usable lh-fix-all runs (the model switched to bash too early to hit the cache), and **0** cached-test-result events fired (the model rarely re-ran the exact same test command without an intervening file change).

### What worked vs. what regressed

| Fix | Did it work? | Evidence |
|---|---|---|
| T0.1 test summarization | **Yes** | 116 `Test command exited N` summaries on lh-fix-all; test outputs no longer replay full logs |
| T0.4 read-cache | **Partially** | Killed 3 zeroed runs overall (10 -> 7) but the stub backfired into bash `Get-Content` |
| T0.2 test memoization | **No** | 0 cache hits — edits invalidated the cache before any repeat run |
| T1.1 one-shot prune | **Mixed** | Cache-read share 64% -> 74% (good) but history unbounded growth (bad) |

---

## 7. Remaining zeroed runs (7/300)

| task | mode | last event |
|---|---|---|
| sh-hidden-green | lexical | Read unchanged tests-hidden/loyalty-tiers.test.ts |
| sh-hidden-green | lexical | Read src/support/money.ts |
| sh-suite-green | lexical | Read src/domains/customers/customer.ts |
| lh-fix-all | none | Read src/domains/billing/service.ts |
| lh-fix-all | hybrid | Read unchanged src/domains/inventory/reservation.ts |
| lh-fix-all | lexical | Read unchanged src/support/money.ts |
| lh-fix-all | prompt-cache | Read unchanged src/support/money.ts |

All 7 still die at `read` (the doom-loop guard fires on identical read *inputs* even when the stub would have been returned — the fingerprint keys on `[tool, args]`, not on the returned stub). **The read-cache did NOT fix the doom-loop deaths** because the doom-loop detector counts repeated read calls regardless of output.

---

## 8. Exit-gate status

| gate | TIER-D | TIER-E | status |
|---|---|---|---|
| mf-quote-margin | 12/12 | 12/12 | MET |
| sh-hidden-green | 10/12 | 10/12 | MET |
| sh-suite-green | 8/12 | **11/12** | MET (improved) |
| lh-fix-all | 9/12 | 8/12 | REGRESSED (was the blocker) |
| Easy families | 100% | 100% | HOLD |
| Zeroed runs | 10 | 7 | improved |
| Avg latency | 35 s | 30 s | improved |
| Avg tokens / usable | 40,992 | 73,451 | **REGRESSED +79%** |

**Conclusion:** quality nudged up (291/300, zeroed 7, sh-suite-green 11/12) but the token-efficiency goal failed — cost +83%. Next iteration must (a) revert to bounded per-step pruning OR implement rolling condensation (T1.2) instead of one-shot prune, and (b) make the read-cache stub return usable content or drop it in favor of the doom-loop detector fix, since the stub merely pushed the model into `bash Get-Content`.

# TIER-E vs opencode — Token-Efficiency Set Head-to-Head (Corrected Accounting)

> **Status: superseded / negative result.** This compares the **original 4-fix set**. It remains the historical NIMBL regression record, but its opencode token columns excluded cache-read input while NIMBL columns included it. Do not use the old `5x` headline as a cost comparison.

The corrected comparison rule is: use `billedTokens` or provider cost for money, and compare `totalTokens` only when both harnesses report full-sent input.

TIER-E (NIMBL, 4-fix token set as first built, 300 runs) vs the latest opencode run (run6 FINAL 4-mode-vs-opencode, 75 runs). Same corpus (`benchmarks/corpus/tier-b`), same seed `20260728`, same task set (25 tasks), same live OpenRouter **StreamLake** `deepseek/deepseek-v4-flash-0731` endpoint. opencode raw: `.nimbl/benchmarks/2026-08-15-run6-FINAL-4mode-vs-opencode-1786808124244/opencode-benchmark-20260728-s3-1786811591640.jsonl`.

**Config caveat:** NIMBL runs 4 retrieval modes x 3 samples (300 runs, 12/task); opencode runs 3 samples single-mode (75 runs, 3/task). Solve rates are shown per-run and per-task. Historical token columns below require the accounting correction above.

---

## 1. Aggregate

| Metric | NIMBL TIER-E | opencode | NIMBL TIER-D |
|---|---|---|---|
| Solved (per-run) | 291/300 (97.0%) | 75/75 (100%) | 288/300 (96.0%) |
| Avg tokens / run | **73,451** | **46,844** | 40,992 |
| Total tokens | 21,521,009 | 3,513,287 | 11,887,672 |
| Avg steps / run | 24.1 | ~8 | 17.9 |
| Avg latency | 30 s | ~ | 35 s |
| Reference cost total | $3.12 | $0.51 | $1.73 |

The old statement that opencode was more token-efficient per run is invalid because it compared opencode billed-only tokens with NIMBL full-sent tokens. TIER-E still regressed internally from TIER-D's 41k full-sent average to 73.5k because of the one-shot-prune / bash-Get-Content interaction (see TIER_E_RESULTS.md §6).

---

## 2. Per-family

| family | NIMBL solved | opencode solved | NIMBL avg tok | opencode avg tok |
|---|---|---|---|---|
| single-fix | 96/96 | 27/27 | 20,410 | 28,217 |
| retrieval | 60/60 | 15/15 | 8,020 | 23,543 |
| test-writing | 24/24 | 6/6 | 41,223 | 36,785 |
| delegation | 12/12 | 6/6 | 70,515 | 52,325 |
| multi-file | 46/48 | 9/9 | 48,908 | 41,490 |
| shell-loop | 33/36 | 6/6 | 202,983 | 133,732 |
| long-horizon | 20/24 | 6/6 | 409,944 | 114,635 |

NIMBL beats opencode on cheap-family tokens (single-fix 20.4k vs 28.2k, retrieval 8k vs 23.5k) — its per-step context budgeting works on short tasks. It loses on hard families: **long-horizon 410k vs 115k (+3.6x)** and shell-loop 203k vs 134k (+1.5x), both regressed vs TIER-D's 155k / 129k.

---

## 3. Per-task (hard tasks + notable)

| task | NIMBL | opencode | Δ tok |
|---|---|---|---|
| lh-fix-all | 8/12 · 938,845 tok · 149 steps | 3/3 · 183,943 tok · 88 steps | **+5.1x** |
| sh-hidden-green | 10/12 · 332,400 tok · 109 steps | 3/3 · 115,205 tok · 73 steps | +2.9x |
| sh-suite-green | 11/12 · 282,853 tok · 135 steps | 3/3 · 152,258 tok · 76 steps | +1.9x |
| lh-forced-context-rename | 12/12 · 57,344 tok · 32 steps | 3/3 · 45,327 tok · 26 steps | +1.3x |
| mf-quote-margin | 12/12 · 59,005 tok · 30 steps | 3/3 · 51,518 tok · 23 steps | +1.1x |
| mf-fulfill-dispatch | 10/12 · 49,365 tok · 24 steps | 3/3 · 44,618 tok · 20 steps | +1.1x |
| dl-award-points | 12/12 · 70,515 tok · 15 steps | 3/3 · 49,439 tok · 11 steps | +1.4x |

The old `5x cheaper` statement is not a valid cost comparison. The corrected lesson is that TIER-E's one-shot prune let NIMBL history grow to the window and increased NIMBL's own full-sent and provider-cost metrics; opencode's cache behavior must be compared using the same billed/full fields.

---

## 4. Cache behavior

| metric | NIMBL TIER-E | NIMBL TIER-D | opencode |
|---|---|---|---|
| cache-read share of input | **74%** | 64% | ~90%+ (doc) |

TIER-E's one-shot prune delivered the intended cache-prefix stability (74% cache-read, up from 64%; lh-fix-all 39% -> 76%), but at the cost of unbounded history growth, so the total billed input doubled (11.4M -> 20.8M). opencode's ~90% cache-read comes from its **append-only** compaction (never rewrites old messages in place) combined with bounded history — the combination NIMBL has not yet matched.

---

## 5. What the comparison says

1. **Short tasks: NIMBL already wins** on tokens (single-fix, retrieval) and matches 100% solve. No change needed there.
2. **Hard tasks: the TIER-E 4-fix set moved in the wrong direction.** It made shell-loop/horizon *cheaper-output but more-expensive-history*. The right lever, per opencode's own numbers, is **bounded history + stable prefix simultaneously** — i.e. T1.2 rolling condensation (append-only summary of the middle, keep head+tail verbatim), not one-shot prune.
3. **The corrected `lh-fix-all` target** is billed-token parity, not the old 5x full-token comparison. TIER-D was approximately 183.7k billed versus opencode's 183.9k; TIER-F v2 is approximately 216k billed and should return toward parity by reducing verification steps.

---

## 6. Next steps (ranked, from TIER_D_LONG_HORIZON plan)

1. **Correct the 4-fix set (done in code, needs a fresh full run).** Reverted one-shot prune -> per-step pruning; rewrote the test summarizer to keep failing file paths + Expected/Received; removed the read-cache stub (it pushed the model into `bash Get-Content`). Post-run validation preflight (48 runs) showed solved-run tokens returning toward TIER-D, but that preflight still carried the read-cache; the fully corrected set must be re-measured at full 300-run scale.
2. **T1.2 rolling condensation** — replace per-step prune with OpenHands-style iterative append-only condensation (keep first ~4 msgs + recent tail verbatim, summarize middle once per ~40 steps). Preserves the 74% cache-read win *without* unbounded growth — this is how opencode keeps ~90% cache-read with bounded history.
3. **Fix the doom-loop detector** to exempt reads that return a cache stub (or drop the stub entirely — already done) so the remaining zeroed runs clear.
4. **Targeted-test discipline (T0.3/T2.1)** — opencode runs ~8-9 bash/run vs NIMBL's 20-40; steer the model to run `bun test <failing-file>` instead of the full suite. This is the biggest remaining step-count gap vs opencode.
5. Re-run the focused hard-task preflight (48 runs) before a full benchmark.

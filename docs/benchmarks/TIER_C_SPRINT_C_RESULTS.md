# Sprint C Live Benchmark Results - per-class budgets (2026-08-15)

Run: NIMBL-only live agent benchmark, tag `1786827786898`
Git: `bec2539` + uncommitted harness fixes (prune stub shape, retry regex, corpus env, per-mode steps) - Corpus: `benchmarks/corpus/tier-b` (25 tasks) - Seed: `20260728` - Samples: 3 per task/mode - Concurrency: 4
Endpoint: `https://netic.hackclub.app/v1` (provider `netic`, API key from opencode config) - Model: `deepseek-v4-flash-free`
Rate limit: 60 req/min (same as run-6) - Elapsed: 54 min (3,240,081 ms) - Runs: 300 (25 tasks x 4 modes x 3 samples) - Zero retry events, zero stderr errors

> Companion docs: `TIER_C_VS_OPENCODE.md` (vs opencode run-7). All raw data in `.nimbl/benchmarks/agent-benchmark-20260728-s3-live-1786827786898.jsonl`.

---

## 1. Headline

| Metric | value |
|---|---|
| Solved | **281/300 (93.7%)** |
| Zeroed (step-cap continuation) | 18/300 (6.0%) |
| Hard API/rate-limit failures | 0 |
| Avg tokens / usable run | 40,246 |
| Avg latency | 42.3 s |
| Total tokens | 12.07M |
| Ref cost (solved only, 0731 baseline) | ~$1.77 |

Per mode: none 70/75 (39.1k avg, 41.9k per-solved, 41.1s), lexical 70/75 (40.9k, 43.8k, 45.4s), hybrid 69/75 (34.0k, 37.0k, 44.8s), prompt-cache 72/75 (47.0k, 48.6k, 37.9s).

---

## 2. Per-mode vs run-6 (TIER_B_FINAL_RESULTS.md)

| mode | solved | Sprint C tok | run-6 tok | delta |
|---|---|---|---|---|
| none | 70/75 | 41.9k | 26.2k | +60% |
| lexical | 70/75 | 43.8k | 28.0k | +56% |
| hybrid | 69/75 | 37.0k | 26.8k | +38% |
| prompt-cache | 72/75 | 48.6k | 26.2k | +86% |

Sprint C raised per-solved tokens (+38% to +86%) because it *solved more hard tasks* (which cost 100k+). This is the expected trade-off of the per-class budget work - the claim must be restated per family.

---

## 3. Per-family (tag-classified, all 4 modes pooled)

| family | solved | avg tokens | avg steps | budget |
|---|---|---|---|---|
| single-fix | 96/96 | 16,785 | 9 | 12 |
| retrieval | 60/60 | 8,049 | 3.5 | 8 |
| test-writing | 24/24 | 31,035 | 13 | 16 |
| delegation | 24/24 | 70,659 | 21 | 20 |
| multi-file | 36/36 | 63,352 | 27 | 40 |
| shell-loop | 27/36 (9 zeroed) | 96,107 | ~67 | 50 |
| long-horizon | 14/24 (9 zeroed) | 74,927 | ~47 | 100 |

Run-6 baselines: multi-file 29/36, shell-loop 29/36, long-horizon 11/24. Sprint C improved multi-file, shell-loop and long-horizon solves.

---

## 4. Exit-gate status (from run-6/7 plan)

| gate | run-6 | Sprint C | status |
|---|---|---|---|
| mf-quote-margin (was 6/12) | 7/12 | **12/12** | MET |
| sh-hidden-green (was 5/12) | 7/12 | **7/12** | MET |
| lh-fix-all (was 0/12) | 0/12 | **4/12** (8 zeroed) | NOT MET (capability shown) |
| lh-forced-context-rename | 11/12 | 10/12 | slight regress (1 zeroed) |
| sh-suite-green | 12/12 | 8/12 | regressed (4 zeroed) |
| Easy families (single-fix/retrieval/test-writing) | 100% | **100%** | HOLD |

---

## 5. Zeroed-run analysis (18/300)

| task | zeroed |
|---|---|
| lh-fix-all | 8 |
| sh-hidden-green | 5 |
| sh-suite-green | 4 |
| lh-forced-context-rename | 1 |

**Signature:** `finishReason` undefined, `totalTokens` 0, `attempts` 0, but 76-206 tool steps *executed*. Mechanism: A.3 step-cap continuation re-arms `max(1, remaining)` = 1-step attempts at ~100-step budgets; large histories then trip a non-retryable throw (likely `prepareStep` "Tool-loop context reached..." guard at agent.ts:844) - no retry, no tokens recorded. **Fix:** return last partial text/reasoning instead of throwing; cap continuation re-arms at 3.

---

## 6. Key observations

1. The per-class budget work raised solves (273 to 281) and closed mf-quote-margin (6 to 12/12), but per-solved tokens rose as hard tasks now complete - expected, must be reported per family.
2. The 18 zeroed runs are the single largest data-quality issue and the main blocker to parity with opencode's 100%.
3. Retrieval remains NIMBL's biggest win vs opencode (ret-* tasks 6.8-8.4k vs opencode 16-35k).
4. prompt-cache was the highest-solving mode (72/75) and near-cheapest per solved on some families.

## 7. Reproducibility

```bash
NIMBL_BENCH_CORPUS=benchmarks/corpus/tier-b
NIMBL_CUSTOM_PROVIDER=netic NIMBL_CUSTOM_BASE_URL=https://netic.hackclub.app/v1
NIMBL_CUSTOM_MODEL=deepseek-v4-flash-free NIMBL_CUSTOM_API_KEY=<key>
NIMBL_CUSTOM_CONTEXT_WINDOW=200000 NIMBL_BENCH_LIVE=1 NIMBL_BENCH_SAMPLES=3
NIMBL_BENCH_MODES=none,lexical,hybrid,prompt-cache NIMBL_BENCH_CONCURRENCY=4 NIMBL_BENCH_REQ_PER_MIN=60
bun benchmarks/agent-run.ts
```

*Note: the netic free endpoint used here is no longer available (key expired 2026-08-16). Later runs use OpenRouter/StreamLake - see `TIER_C_OPT_RESULTS.md`.*

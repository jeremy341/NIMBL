# TIER-D Run vs opencode run-7 (OpenRouter - StreamLake - deepseek-v4-flash-0731)

Head-to-head between the **TIER-D NIMBL full run** (300 runs, zeroed-fix) and the **latest opencode run-7** (75 runs), same tier-b corpus, same model build.

- **NIMBL:** `.nimbl/benchmarks/agent-benchmark-20260728-s3-live-1786879459013.jsonl` - live on **OpenRouter**, provider pinned **StreamLake**, model `deepseek/deepseek-v4-flash-0731`, concurrency 8, 180 req/min.
- **opencode run-7:** `.nimbl/benchmarks/2026-08-15-run6-FINAL-4mode-vs-opencode-1786808124244/opencode-benchmark-20260728-s3-1786811591640.jsonl` - 75 runs on the free netic endpoint, same `deepseek-v4-flash-free` = **0731 build** (confirmed). opencode harness untouched by the NIMBL optimization.
- **Same model build both sides** (0731); endpoint differs (netic free vs OpenRouter/StreamLake).

---

## 1. Headline

| Metric | opencode | NIMBL (best mode) | NIMBL (all modes) | delta vs opencode |
|---|---|---|---|---|
| Solved | 75/75 (100%) | 73/75 (none) | **288/300 (96.0%)** | -4.0 pp |
| Avg tokens / usable run | 46,844 | 36,395 (hybrid) | **40,992** | **-12.5%** |
| Avg latency | 60.9 s | 34 s (prompt-cache) | **35 s** | **-43%** |
| Zeroed/errored | 0 | 0 | 10/300 | - |

**NIMBL is now ~12.5% more token-efficient than opencode and ~43% faster per run**, with the solve gap down to 4 points - and all 10 remaining zeroed runs are a single known class (identical-read doom-loop).

> **Update (post-TIER-E):** the read-cache approach for that class was tried and **failed** (see `TIER_E_RESULTS.md` §9); the corrected path is the doom-loop-detector fix and/or targeted-test discipline.

---

## 2. Per-family comparison (NIMBL = all 4 modes pooled, usable runs)

| family | opencode solved | NIMBL solved | OC tok | NIMBL tok | NIMBL delta |
|---|---|---|---|---|---|
| retrieval | 15/15 | 60/60 | 23,543 | **7,126** | **-69.7%** |
| single-fix | 27/27 | 108/108 | 28,217 | **16,578** | **-41.2%** |
| test-writing | 6/6 | 24/24 | 36,785 | **27,328** | **-25.7%** |
| delegation | 6/6 | 24/24 | 52,325 | **43,957** | **-16.0%** |
| multi-file | 9/9 | 34/36 | 41,490 | **32,733** | **-21.1%** |
| long-horizon | 6/6 | 20/24 | 114,635 | 154,832 | +35.1% |
| shell-loop | 6/6 | 18/24 | 133,732 | 204,655 | +53.0% |

NIMBL beats opencode on **five of seven families** and closed most of the solve gap on the two hard ones (long-horizon 20/24, shell-loop 18/24 - up from 16/24 and 13/24 in the previous run). The two losses remain token-inflated by the surviving identical-read deaths and by the high cost of actually *solving* the 100-step hard tasks.

---

## 3. Per-task head-to-head (solved/3 opencode vs solved/12 NIMBL; tokens per usable run)

| task | OC sol | OC tok | NIMBL sol | NIMBL tok | NIMBL st |
|---|---|---|---|---|---|
| bf-carrier | 3/3 | 19,436 | 12/12 | **16,866** | 8.1 |
| bf-clamp | 3/3 | 26,263 | 12/12 | **14,983** | 7.0 |
| bf-discount | 3/3 | 18,691 | 12/12 | **14,418** | 7.5 |
| bf-invoice | 3/3 | 72,937 | 12/12 | **16,118** | 9.7 |
| bf-loyalty-threshold | 3/3 | 34,652 | 12/12 | **17,965** | 10.2 |
| bf-reserve | 3/3 | 19,785 | 12/12 | **16,704** | 8.5 |
| bf-round | 3/3 | 16,454 | 12/12 | 20,947 | 10.2 |
| bf-subtotal | 3/3 | 15,384 | 12/12 | 15,512 | 7.0 |
| bf-truncate | 3/3 | 30,352 | 12/12 | **15,691** | 7.5 |
| dl-award-points | 3/3 | 49,439 | 12/12 | **43,513** | 10.0 |
| dl-idempotency | 3/3 | 55,212 | 12/12 | **44,401** | 11.8 |
| lh-fix-all | 3/3 | 183,943 | **9/12** | 291,104 | 115.2 |
| lh-forced-context-rename | 3/3 | 45,327 | 11/12 | **43,336** | 25.1 |
| mf-billing-idempotency | 3/3 | 28,335 | 12/12 | **19,920** | 8.2 |
| mf-fulfill-dispatch | 3/3 | 44,618 | 10/12 | **42,496** | 20.6 |
| mf-quote-margin | 3/3 | 51,518 | 12/12 | **35,783** | 22.5 |
| ret-base-currency | 3/3 | 35,063 | 12/12 | **7,147** | 3.2 |
| ret-carrier-zone5 | 3/3 | 24,782 | 12/12 | **7,482** | 3.0 |
| ret-idempotency-owner | 3/3 | 25,389 | 12/12 | **7,222** | 4.0 |
| ret-margin | 3/3 | 15,910 | 12/12 | **6,599** | 1.7 |
| ret-retries | 3/3 | 16,573 | 12/12 | **7,182** | 1.8 |
| sh-hidden-green | 3/3 | 115,205 | **10/12** | 194,553 | 90.2 |
| sh-suite-green | 3/3 | 152,258 | **8/12** | 217,283 | 87.5 |
| tw-carriers | 3/3 | 47,095 | 12/12 | **25,786** | 14.0 |
| tw-round | 3/3 | 26,475 | 12/12 | 28,869 | 13.2 |

NIMBL is cheaper on **20 of 25 tasks**. opencode remains cheaper only on lh-fix-all / sh-suite-green / sh-hidden-green / bf-round / tw-round - the ones where NIMBL either fails (identical-read deaths) or spends heavily to solve a 100-step task.

---

## 4. Where each still wins

**NIMBL wins**
- 20/25 tasks cheaper; retrieval -70%, single-fix -41%, test-writing -26%, multi-file -21%, delegation -16%.
- **~43% faster** (35s vs 61s avg) - every family beats opencode on latency.
- lh-fix-all now solves 9/12 (was 4/12 in the previous run), sh-hidden-green 10/12, sh-suite-green 8/12.

**opencode wins**
- 100% solve rate (75/75) vs 96% - but NIMBL's remaining shortfall is **10 identical-read doom-loop deaths** plus 2 unsolved hard samples (mf-fulfill, lh-forced-context).
- Long-horizon / shell-loop per-run tokens lower, because opencode solves 100% of a small sample while NIMBL's solved runs carry heavy cost.

> **Update (post-TIER-E):** the read-cache fix that was planned for those 10 deaths was implemented and **failed** — see `TIER_E_RESULTS.md` §9. The corrected path is the doom-loop-detector fix and/or targeted-test discipline, not a read stub.

---

## 5. Cost

| | opencode | NIMBL (all 300) |
|---|---|---|
| Est. cost | ~$0 (free netic endpoint) | **$0.44** (StreamLake) |
| Per solved task | ~$0 (free) | ~$0.0015 |

NIMBL's $0.44 total remains a trivial fraction of the $10 OpenRouter credit.

---

## 6. Verdict

1. **The zeroed-fix run is the strongest NIMBL result measured:** 288/300 (96%), ~12.5% more token-efficient than opencode, ~43% faster, with the solve-rate gap down to 4 points.
2. **lh-fix-all closed** (4 -> 9/12) - the fix that unblocked the hardest task. Shell-loop family +5 solves.
3. **Remaining gap is the 10 identical-read doom-loop deaths.** The originally-planned read-cache (B1) fix was tried in TIER-E and **failed** (stub pushed the model into `bash Get-Content`; the detector keys on args, not output). Read-cache is removed from the code.
4. Next step: fix the doom-loop detector (exempt stub-returning reads) and/or add targeted-test discipline, then re-run a full 300-run benchmark of the corrected set.

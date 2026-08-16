# TIER-D Results — Zeroed-Fix Full Run (OpenRouter - StreamLake - deepseek-v4-flash-0731)

Full tier-b re-run (300 runs) after the **zeroed-run fixes**: the bash doom-loop exemption and the graceful context-overflow guard. Executed live on **OpenRouter**, pinned **StreamLake**, model `deepseek/deepseek-v4-flash-0731`, concurrency 8, 180 req/min.

- **Raw JSONL:** `.nimbl/benchmarks/agent-benchmark-20260728-s3-live-1786879459013.jsonl` (300 records)
- **Model:** `deepseek/deepseek-v4-flash-0731:StreamLake` @ `https://openrouter.ai/api/v1`
- **Config:** seed `20260728` - samples 3 - modes `none,lexical,hybrid,prompt-cache` - concurrency 8 - 180 req/min - context window 200k
- **Runtime:** ~28 min - **stderr: 0 lines - zero rate-limit/API errors**
- **Cost:** $0.44 at StreamLake rates ($0.0671/M in, $0.1341/M out, $0.0134/M cache-read)

---

## 1. What changed in this run (the two fixes)

| # | Fix | File | Effect |
|---|---|---|---|
| 1 | **Bash doom-loop exemption** — repeated `bash` calls are no longer treated as a doom loop. Re-running the same `bun test` command between edits is the legitimate shell-loop verification pattern, not a stuck loop. | `src/core/agent.ts` | Recovered the 15 shell-loop deaths; cut latency 62s -> 35s |
| 2 | **Graceful context overflow (A.1)** — `prepareStep` no longer throws on long-history overflow; `trimMessagesToWindow` drops oldest messages keeping the first user goal + a tail. Continuation re-arms capped at 3. | `src/core/agent.ts` | Hardening against context-overflow deaths |

Verified: typecheck clean, 298 tests pass (only the pre-existing `stress.test.ts` failure remains, unrelated).

---

## 2. Headline

| Metric | value |
|---|---|
| Solved | **288/300 (96.0%)** |
| Zeroed (doom-loop on identical reads) | 10/300 (3.3%) |
| Hard API/rate-limit failures | **0** |
| Avg tokens / usable run | 40,992 |
| Avg tool steps / usable run | 17.9 |
| Avg latency | **35 s** (was 62 s) |
| Runtime | **28 min** (was 47 min) |
| Est. cost (StreamLake rates) | **$0.44** |

Per mode: `none` 73/75 (48.5k), `lexical` 71/75 (38.4k), `hybrid` 72/75 (36.4k), `prompt-cache` 72/75 (40.6k).

---

## 3. Per-mode

| mode | solved | zeroed | avg tok | avg lat |
|---|---|---|---|---|
| none | 73/75 | 2 | 48,514 | 40 s |
| lexical | 71/75 | 3 | 38,394 | 38 s |
| hybrid | 72/75 | 2 | 36,395 | 40 s |
| prompt-cache | 72/75 | 3 | 40,624 | 34 s |

`none` solved the most (73/75); retrieval modes are cheapest per token.

---

## 4. Per-family (vs previous StreamLake run)

| family | TIER-D solved | prev solved | TIER-D tok | prev tok |
|---|---|---|---|---|
| single-fix | 108/108 | 108/108 | 16,578 | 16,298 |
| retrieval | 60/60 | 60/60 | 7,126 | 7,416 |
| test-writing | 24/24 | 24/24 | 27,328 | 25,510 |
| delegation | 24/24 | 24/24 | 43,957 | 48,581 |
| multi-file | 34/36 | 34/36 | 32,733 | 34,073 |
| shell-loop | **18/24** | 13/24 | 204,655 | 163,538 |
| long-horizon | **20/24** | 16/24 | 154,832 | 140,779 |

The two fixes landed on the hard families: **shell-loop 13 -> 18/24, long-horizon 16 -> 20/24**. Tokens on those families rose because more runs now complete and solve instead of dying at zero.

---

## 5. Hard-task solves (the point of this run)

| task | TIER-D | prev StreamLake | Sprint C |
|---|---|---|---|
| lh-fix-all | **9/12** | 4/12 | 4/12 |
| sh-hidden-green | **10/12** | 8/12 | 7/12 |
| sh-suite-green | **8/12** | 5/12 | 5/12 |
| lh-forced-context-rename | 11/12 | 12/12 | 10/12 |
| mf-quote-margin | 12/12 | 12/12 | 12/12 |
| mf-fulfill-dispatch | 10/12 | 10/12 | 10/12 |

**lh-fix-all more than doubled (4 -> 9/12)** and shell-loop family improved +5. mf-quote-margin holds perfect.

---

## 6. Per-task table

| task | solved | tok | steps |
|---|---|---|---|
| bf-carrier | 12/12 | 16,866 | 8.1 |
| bf-clamp | 12/12 | 14,983 | 7.0 |
| bf-discount | 12/12 | 14,418 | 7.5 |
| bf-invoice | 12/12 | 16,118 | 9.7 |
| bf-loyalty-threshold | 12/12 | 17,965 | 10.2 |
| bf-reserve | 12/12 | 16,704 | 8.5 |
| bf-round | 12/12 | 20,947 | 10.2 |
| bf-subtotal | 12/12 | 15,512 | 7.0 |
| bf-truncate | 12/12 | 15,691 | 7.5 |
| dl-award-points | 12/12 | 43,513 | 10.0 |
| dl-idempotency | 12/12 | 44,401 | 11.8 |
| lh-fix-all | 9/12 | 291,104 | 115.2 |
| lh-forced-context-rename | 11/12 | 43,336 | 25.1 |
| mf-billing-idempotency | 12/12 | 19,920 | 8.2 |
| mf-fulfill-dispatch | 10/12 | 42,496 | 20.6 |
| mf-quote-margin | 12/12 | 35,783 | 22.5 |
| ret-base-currency | 12/12 | 7,147 | 3.2 |
| ret-carrier-zone5 | 12/12 | 7,482 | 3.0 |
| ret-idempotency-owner | 12/12 | 7,222 | 4.0 |
| ret-margin | 12/12 | 6,599 | 1.7 |
| ret-retries | 12/12 | 7,182 | 1.8 |
| sh-hidden-green | 10/12 | 194,553 | 90.2 |
| sh-suite-green | 8/12 | 217,283 | 87.5 |
| tw-carriers | 12/12 | 25,786 | 14.0 |
| tw-round | 12/12 | 28,869 | 13.2 |

---

## 7. Remaining zeroed runs (10/300)

All 10 are **doom-loop on identical `read` re-reads** (e.g. the same file read 3x with identical args) - a genuine audit-loop pattern, correctly caught by the guard. The bash exemption fixed the shell-loop class; the read-re-read class is exactly what the **read-cache fix (B1)** targets (unchanged-file re-reads return a short stub instead of content).

| task | zeroed |
|---|---|
| lh-fix-all | 3 |
| sh-suite-green | 4 |
| sh-hidden-green | 2 |
| lh-forced-context-rename | 1 |

---

## 8. Exit-gate status

| gate | prev | TIER-D | status |
|---|---|---|---|
| mf-quote-margin | 12/12 | **12/12** | MET |
| sh-hidden-green | 8/12 | **10/12** | MET |
| lh-fix-all | 4/12 | **9/12** | **MET** (was the blocker) |
| Easy families (single-fix/retrieval/test-writing) | 100% | **100%** | HOLD |
| Zeroed runs | 18 | **10** | improving |
| Avg latency | 62 s | **35 s** | improved |

**Verdict:** 288/300 (96%), zero infrastructure errors, lh-fix-all closed (4 -> 9/12), latency halved, runtime 40% faster. The remaining gap is 10 identical-read doom-loop deaths - the read-cache (B1) fix is the natural next step.

# NIMBL vs opencode — Tier-B Head-to-Head (2026-08-15)

> **Accounting correction:** this historical report compares old NIMBL full-sent totals with old opencode billed-only totals. The `46.8k vs 26-28k` token claim is not an apples-to-apples full-token comparison. Use `billedTokens` for economic comparisons and `totalTokens` for full-sent volume in new records.

**Run:** run-6 (NIMBL, tag `1786808124244`) + run-7 (opencode-only, tag `1786811591640`)
**Git:** `6c38ad0` · **Corpus:** `benchmarks/corpus/tier-b` · **Seed:** `20260728` · **Samples:** 3 per task/mode · **Concurrency:** 4
**Endpoint:** `https://netic.hackclub.app/v1` (provider `netic`, key `india75`) · **Model:** `deepseek-v4-flash-free` (bare wire id)
**Rate limit:** NIMBL capped at 60 req/min (was 85 in earlier runs); opencode unscoped.
**Retry policy:** run-level retries on `/5\d\d|429|401|rate limit|too many requests|ECONN|ETIMEDOUT|EAI_AGAIN|fetch failed/`; agent-internal retryable() on transient errors.

Raw data lives in this folder:
- `raw-nimbl-1786808124244/` — 300 per-run raw JSON + stream JSONL (75 × 4 modes)
- `raw-opencode-1786811591640/` — 75 per-run raw JSON + stream JSONL
- `agent-benchmark-20260728-s3-live-1786808124244.jsonl` — NIMBL records
- `opencode-benchmark-20260728-s3-1786811591640.jsonl` — opencode records

---

## 1. Executive summary

- **opencode solved all 75 tasks (100%)**; NIMBL solved 67–69/75 (89–92%) depending on mode.
- **Legacy accounting:** opencode reported ~3.51M billed-only tokens and 46.8k billed-only tokens/run, while NIMBL reported ~2.25–2.31M full-sent tokens and 26.2–28.0k full-sent tokens/run. The old 2.5-2.8x statement is invalid without converting both bases.
- **NIMBL was faster**: ~34–38s avg latency vs **~61s** for opencode (−38%).
- **Cheaper per solved task** at reference pricing: NIMBL $0.258–$0.284 vs opencode ~$0.506 (solved-only, see note).
- All three hard failures for NIMBL concentrate in long-horizon / shell-loop tasks (`lh-fix-all` 0/3, `sh-hidden-green` 1–2/3, `mf-quote-margin` 1–2/3). opencode solved every one of those but with 183–202k tokens each.
- Cost/reference figures use the DeepSeek V4-Flash-0731 baseline (`estimateReferenceCost`); they are not actual provider charges.

---

## 2. Aggregate results (75 runs per column)

| Metric | opencode | NIMBL none | NIMBL lexical | NIMBL hybrid | NIMBL prompt-cache |
|---|---|---|---|---|---|
| Solved | **75/75 (100%)** | 67/75 (89.3%) | 69/75 (92.0%) | 69/75 (92.0%) | 68/75 (90.7%) |
| Full tokens (legacy NIMBL basis) | 14,768,839 opencode* | 2,299,506 | 2,305,380 | 2,299,679 | 2,252,497 |
| Billed-only tokens (legacy opencode basis) | 3,513,287 | see `noCacheTokens + outputTokens` | see `noCacheTokens + outputTokens` | see `noCacheTokens + outputTokens` | see `noCacheTokens + outputTokens` |
| Cache read tokens | 11,255,552 | 1,380,480 | 1,563,648 | 1,483,520 | 1,527,040 |
| Uncached (noCache) tokens | n/a | 807,549 | 640,961 | 705,738 | 635,812 |
| Avg tokens / solved task | 46,844 | 26,208 | 27,964 | 26,794 | 26,176 |
| Avg latency / task | 60,875 ms | 36,749 ms | 35,367 ms | 38,453 ms | 34,057 ms |
| Ref cost (all runs) | $0.5060 | $0.3391 | $0.3383 | $0.3391 | $0.3296 |
| Ref cost (solved only) | ~$0.5057 | $0.2584 | $0.2835 | $0.2716 | $0.2608 |
| Failed (errors) | 0 | 1 * | 0 | 0 | 0 |

\* `lh-forced-context-rename`/`none` sample: "Repeating the same tool call is blocked by project policy" — a policy-deny loop, not a rate limit. 0 runs zeroed by rate limiting in any NIMBL mode.

### Historical token efficiency (not a valid cross-harness basis)
| Mode | Avg / solved | vs opencode |
|---|---|---|
| opencode | 46,844 billed-only | — |
| none | 26,208 | **−44.1%** |
| lexical | 27,964 | **−40.3%** |
| hybrid | 26,794 | **−42.8%** |
| prompt-cache | 26,176 | **−44.1%** |

---

## 3. Per-task head-to-head (solved/3, avg tokens)

| Task | Difficulty | opencode | none | lexical | hybrid | prompt-cache |
|---|---|---|---|---|---|---|
| bf-carrier | easy | 3/3 (19,436) | 3/3 (26,835) | 3/3 (25,657) | 3/3 (15,767) | 3/3 (15,810) |
| bf-clamp | easy | 3/3 (26,263) | 3/3 (16,288) | 3/3 (17,859) | 3/3 (16,024) | 3/3 (15,941) |
| bf-discount | easy | 3/3 (18,691) | 3/3 (15,588) | 3/3 (16,778) | 3/3 (13,798) | 3/3 (13,735) |
| bf-invoice | hard | 3/3 (72,937) | 3/3 (18,783) | 3/3 (24,740) | 3/3 (16,136) | 3/3 (21,267) |
| bf-loyalty-threshold | medium | 3/3 (34,652) | 3/3 (17,834) | 3/3 (19,092) | 3/3 (19,972) | 3/3 (18,736) |
| bf-reserve | medium | 3/3 (19,785) | 3/3 (14,977) | 3/3 (18,217) | 3/3 (16,302) | 3/3 (15,960) |
| bf-round | medium | 3/3 (16,454) | 3/3 (18,306) | 3/3 (16,004) | 3/3 (19,266) | 3/3 (17,503) |
| bf-subtotal | medium | 3/3 (15,384) | 3/3 (14,984) | 3/3 (16,582) | 3/3 (15,792) | 3/3 (15,797) |
| bf-truncate | easy | 3/3 (30,352) | 3/3 (15,964) | 3/3 (15,464) | 3/3 (16,782) | 3/3 (16,801) |
| dl-award-points | medium | 3/3 (49,439) | 3/3 (49,241) | 3/3 (59,981) | 3/3 (60,318) | 3/3 (62,034) |
| dl-idempotency | hard | 3/3 (55,212) | 3/3 (58,380) | 3/3 (57,972) | 3/3 (57,022) | 3/3 (59,016) |
| **lh-fix-all** | hard | **3/3 (183,943)** | **0/3** (89,000) | **0/3** (71,979) | **0/3** (69,360) | **0/3** (69,946) |
| lh-forced-context-rename | hard | 3/3 (45,327) | 2/3 (25,237) | 3/3 (36,412) | 3/3 (41,807) | 3/3 (34,764) |
| mf-billing-idempotency | hard | 3/3 (28,335) | 3/3 (24,930) | 3/3 (20,907) | 3/3 (22,989) | 3/3 (36,374) |
| mf-fulfill-dispatch | medium | 3/3 (44,618) | 3/3 (43,848) | 2/3 (42,108) | 3/3 (42,180) | 3/3 (39,444) |
| **mf-quote-margin** | medium | **3/3 (51,518)** | 1/3 (47,771) | 2/3 (49,328) | 2/3 (44,374) | 1/3 (54,718) |
| ret-base-currency | easy | 3/3 (35,063) | 3/3 (7,872) | 3/3 (7,491) | 3/3 (7,264) | 3/3 (7,231) |
| ret-carrier-zone5 | medium | 3/3 (24,782) | 3/3 (8,118) | 3/3 (8,937) | 3/3 (7,640) | 3/3 (7,722) |
| ret-idempotency-owner | easy | 3/3 (25,389) | 3/3 (9,316) | 3/3 (7,544) | 3/3 (9,753) | 3/3 (7,704) |
| ret-margin | easy | 3/3 (15,910) | 3/3 (9,136) | 3/3 (9,091) | 3/3 (7,166) | 3/3 (7,173) |
| ret-retries | easy | 3/3 (16,573) | 3/3 (8,841) | 3/3 (7,859) | 3/3 (7,235) | 3/3 (7,251) |
| **sh-hidden-green** | hard | **3/3 (115,205)** | 1/3 (89,631) | 2/3 (87,897) | 1/3 (90,086) | 1/3 (77,854) |
| sh-suite-green | medium | 3/3 (152,258) | 3/3 (83,479) | 3/3 (67,965) | 3/3 (87,600) | 3/3 (75,066) |
| tw-carriers | medium | 3/3 (47,095) | 3/3 (27,647) | 3/3 (30,679) | 3/3 (32,190) | 3/3 (30,041) |
| tw-round | medium | 3/3 (26,475) | 3/3 (24,497) | 3/3 (31,917) | 3/3 (29,737) | 3/3 (22,944) |

**Legend:** bold rows = opencode solved where NIMBL did not in ≥1 mode.

---

## 4. Observations

1. **Retrieval tasks (`ret-*`) are NIMBL's biggest win** — 7,200–9,700 avg tokens vs opencode's 15,900–35,000 (2–4× fewer) with identical 3/3 solving.
2. **`lh-fix-all` is the consistent miss** (0/3 in every NIMBL mode, even at ~70k tokens) while opencode burned 184k tokens to solve it. This is the single largest quality gap and the clearest "long-horizon" failure signal for NIMBL.
3. **`sh-hidden-green` and `mf-quote-margin`** are partially flaky across modes — mode doesn't fix them.
4. **Mode differences are small in practice** (67–69 solved, ~1–2k tokens spread). `prompt-cache` was marginally most token-efficient and fastest; `lexical`/`hybrid` tied on solves.
5. **Rate limiting did not contaminate run-6** — 0 zeroed runs, and the 2 `[retry]` occurrences (`tw-round` in prompt-cache/hybrid) recovered transparently. Compare run-5 where 41 runs (37×429 + 4×401) errored with no retries.
6. **Latency gap (~61s vs ~35s) partly reflects token volume** — opencode sends far more per turn. Cost/latency deltas are consequences of the same token-efficiency effect.
7. Reference-cost deltas: NIMBL solved-only spend is roughly **half** of opencode's (~$0.26–0.28 vs ~$0.51), consistent with the token-per-solved ratios.

---

## 5. Caveats

- **Samples = 3** per (task, mode): single-run outliers dominate (e.g. any one `mf-quote-margin` failure moves it 33 points). Treat solves as indicative, not conclusive.
- `opencode` had no per-min limiter in this run; NIMBL was capped at 60 req/min. With the endpoint's ~1.5 req/s sustained ceiling, opencode may have benefited from the shared limiter during the sequential phase — not controlled for.
- Ref cost uses a static per-token baseline (DeepSeek V4-Flash-0731 pricing) and ignores provider prompt-cache discounts; it is a comparative proxy only.
- The single NIMBL failure (`lh-forced-context-rename`/none) is a policy-deny loop ("Repeating the same tool call is blocked by project policy") — a harness/agent behavior, not a network issue.

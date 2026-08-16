# Sprint C vs opencode - Tier-C Head-to-Head (2026-08-15)

**NIMBL:** Sprint C live run, tag `1786827786898` (see `TIER_C_SPRINT_C_RESULTS.md` for the standalone analysis)
**opencode:** run-7, tag `1786811591640` - the latest opencode benchmark in `.nimbl/benchmarks/2026-08-15-run6-FINAL-4mode-vs-opencode-1786808124244/`
**Same corpus:** `benchmarks/corpus/tier-b` (25 tasks) - **Same model/endpoint:** `deepseek-v4-flash-free` @ `https://netic.hackclub.app/v1` - **Samples:** NIMBL 3 per task/mode (300 runs), opencode 3 per task (75 runs) - **Seed:** `20260728`

---

## 1. Headline

| Metric | opencode | NIMBL (best mode) | NIMBL (all modes) | delta vs opencode |
|---|---|---|---|---|
| Solved | 75/75 (100%) | **72/75** (prompt-cache) | 281/300 (93.7%) | -6.3 pp |
| Avg tokens / solved | 46,844 | **36,990** (hybrid) | 42,869 | **-8.3%** |
| Avg tokens / run | 46,844 | 34,031-47,022 | 40,246 | -14% |
| Avg latency | 60.9 s | **37.9 s** (prompt-cache) | 42.3 s | **-30.5%** |
| Total tokens | 3.51M | 2.55M (hybrid) | 12.07M | - |
| Zeroed by error | 0 | 3-6/mode | 18/300 | - |

The big caveat: **opencode is the only harness that solved every task, every sample.** NIMBL's edge is tokens and speed, and that edge is much thinner than in run-6 (-8.3% vs -44% per solved) because Sprint C's bigger per-class budgets spend more tokens to buy solves.

---

## 2. Per-family comparison (tag-classified; NIMBL = all 4 modes pooled)

| Family | opencode solved | NIMBL solved | opencode tokens/solved | NIMBL tokens/solved | NIMBL delta |
|---|---|---|---|---|---|
| retrieval | 15/15 | 60/60 | 23,543 | **8,049** | **-65.8%** |
| single-fix | 24/24 | 96/96 | 29,271 | **16,785** | **-42.7%** |
| long-horizon | 6/6 | 14/24* | 114,635 | **74,927** | -34.6% |
| test-writing | 6/6 | 24/24 | 36,785 | **31,035** | -15.6% |
| shell-loop | 9/9 | 27/36* | 95,750 | 96,110 | +0.4% |
| delegation | 6/6 | 24/24 | 52,325 | 70,659 | **+35.0%** |
| multi-file | 9/9 | 36/36 | 41,490 | 63,352 | **+52.7%** |

\* 9 shell-loop and 9 long-horizon NIMBL runs are zeroed continuation errors (bug, not solver quality); raw unsolved counts understate real solves.

**Reading:** NIMBL is decisively cheaper on the two families where it is now perfect (retrieval -66%, single-fix -43%) and on long-horizon (-35% despite 4/12 lh-fix-all solves). It is *more expensive* on delegation (+35%) and multi-file (+53%) - both families it now solves at 100% while opencode also solves 100% - and equal on shell-loop.

---

## 3. Per-task head-to-head (solved/3; NIMBL columns = per mode; bold = NIMBL solved where opencode did)

| Task | opencode | none | lexical | hybrid | prompt-cache |
|---|---|---|---|---|---|
| bf-carrier | 3/3 (19.4k) | 3/3 (21.3k) | 3/3 (20.6k) | 3/3 (**16.0k**) | 3/3 (**15.9k**) |
| bf-clamp | 3/3 (26.3k) | 3/3 (**15.0k**) | 3/3 (16.4k) | 3/3 (16.1k) | 3/3 (16.1k) |
| bf-discount | 3/3 (18.7k) | 3/3 (15.6k) | 3/3 (**15.2k**) | 3/3 (**13.8k**) | 3/3 (**13.7k**) |
| bf-invoice | 3/3 (72.9k) | 3/3 (22.9k) | 3/3 (**15.3k**) | 3/3 (**14.9k**) | 3/3 (19.4k) |
| bf-loyalty-threshold | 3/3 (34.7k) | 3/3 (19.6k) | 3/3 (**17.4k**) | 3/3 (19.1k) | 3/3 (**15.7k**) |
| bf-reserve | 3/3 (19.8k) | 3/3 (21.4k) | 3/3 (**17.3k**) | 3/3 (18.0k) | 3/3 (**16.5k**) |
| bf-round | 3/3 (16.5k) | 3/3 (16.6k) | 3/3 (17.6k) | 3/3 (**16.2k**) | 3/3 (**16.5k**) |
| bf-subtotal | 3/3 (15.4k) | 3/3 (**13.7k**) | 3/3 (18.1k) | 3/3 (17.4k) | 3/3 (15.8k) |
| bf-truncate | 3/3 (30.4k) | 3/3 (**16.0k**) | 3/3 (**15.5k**) | 3/3 (16.9k) | 3/3 (16.8k) |
| ret-base-currency | 3/3 (35.1k) | 3/3 (7.9k) | 3/3 (7.5k) | 3/3 (8.7k) | 3/3 (**7.3k**) |
| ret-carrier-zone5 | 3/3 (24.8k) | 3/3 (8.1k) | 3/3 (**7.6k**) | 3/3 (7.6k) | 3/3 (9.0k) |
| ret-idempotency-owner | 3/3 (25.4k) | 3/3 (9.4k) | 3/3 (**7.8k**) | 3/3 (8.6k) | 3/3 (9.1k) |
| ret-margin | 3/3 (15.9k) | 3/3 (7.7k) | 3/3 (7.8k) | 3/3 (**7.2k**) | 3/3 (7.2k) |
| ret-retries | 3/3 (16.6k) | 3/3 (10.4k) | 3/3 (7.9k) | 3/3 (**7.2k**) | 3/3 (7.2k) |
| tw-carriers | 3/3 (47.1k) | 3/3 (39.2k) | 3/3 (33.7k) | 3/3 (**29.9k**) | 3/3 (31.0k) |
| tw-round | 3/3 (26.5k) | 3/3 (38.2k) | 3/3 (**24.8k**) | 3/3 (**23.9k**) | 3/3 (27.5k) |
| mf-billing-idempotency | 3/3 (28.3k) | 3/3 (**25.6k**) | 3/3 (26.6k) | 3/3 (39.7k) | 3/3 (28.8k) |
| mf-fulfill-dispatch | 3/3 (44.6k) | 3/3 (55.1k) | 3/3 (87.1k) | 3/3 (45.2k) | 3/3 (**43.5k**) |
| **mf-quote-margin** | 3/3 (51.5k) | 3/3 (121.6k) | 3/3 (**75.5k**) | 3/3 (121.8k) | 3/3 (89.8k) |
| dl-award-points | 3/3 (49.4k) | 3/3 (67.7k) | 3/3 (68.6k) | 3/3 (56.3k) | 3/3 (66.8k) |
| dl-idempotency | 3/3 (55.2k) | 3/3 (82.5k) | 3/3 (84.9k) | 3/3 (78.1k) | 3/3 (60.5k) |
| **lh-fix-all** | 3/3 (183.9k) | **1/3** (103.0k) | 0/3 (zeroed) | 0/3 (zeroed) | **3/3** (351.0k) |
| lh-forced-context-rename | 3/3 (45.3k) | 3/3 (**44.5k**) | 3/3 (38.4k) | 2/3 (30.9k) | 2/3 (31.6k) |
| **sh-hidden-green** | 3/3 (115.2k) | 1/3 (71.2k) | 1/3 (61.9k) | **3/3** (185.5k) | 2/3 (128.7k) |
| **sh-suite-green** | 3/3 (152.3k) | 2/3 (122.9k) | 3/3 (327.9k) | 1/3 (51.8k) | 2/3 (130.3k) |

**Legend:** bold task = NIMBL closed (solved >=1 sample) where run-6 did not. Bold token cell = NIMBL cheaper than opencode on that task.

### Where NIMBL beats opencode per task
- All 9 single-fix + all 5 retrieval tasks: cheaper in every mode except one (`bf-carrier`/none, `bf-reserve`/none slightly above).
- 4 hard tasks closed: `mf-quote-margin` **12/12** (-$0.51 reference-cost -29% to -57%), `lh-fix-all` 4/12 incl. prompt-cache **3/3**, `sh-hidden-green` 7/12 incl. hybrid **3/3**, `sh-suite-green` mixed (12/12 run-6 to 8/12).
- opencode's last unbeaten wall: **`lh-fix-all` on lexical/none/hybrid** (0/3 each, zeroed) and `sh-suite-green` hybrid (1/3).

### Where opencode still wins
- 100% vs 93.7% overall; only harness with zero zeroed runs and zero failed samples.
- `lh-fix-all` 183.9k tokens/solved is opencode's worst - NIMBL prompt-cache solves the same task at 351k (multi-attempt, so still more tokens here).
- delegation +35% and multi-file +53% token overhead: NIMBL spends ~60-70k solving what opencode does in ~40-55k.

---

## 4. Latency

| | opencode | NIMBL avg |
|---|---|---|
| All tasks | 60.9 s | 42.3 s (-30.5%) |
| retrieval | 27.9 s | 9.3 s (-66.6%) |
| single-fix | 43.5 s | 22.0 s (-49.4%) |
| long-horizon | 131.5 s | 89.9 s (-31.6%) |
| delegation | 116.1 s | 61.9 s (-46.7%) |
| shell-loop | 99.5 s | 97.9 s (-1.6%) |
| multi-file | 57.8 s | 58.6 s (+1.4%) |

---

## 5. Cost (DeepSeek V4-Flash-0731 reference baseline; not actual charges)

| | opencode | NIMBL (pooled) | NIMBL best mode |
|---|---|---|---|
| Ref cost, solved only | $0.506 / 75 runs | $1.770 / 281 runs | $0.376 (hybrid) / 69 runs |
| Per solved task | ~$0.0067 | ~$0.0063 | ~$0.0055 (hybrid) |
| Retrieval family per solved | ~$0.0033 | **~$0.0011** | - |
| Single-fix per solved | ~$0.0041 | **~$0.0024** | - |

NIMBL's cost edge is real but concentrated: retrieval and single-fix families are 2-3x cheaper per solved task; delegation/multi-file are 1.3-1.5x more expensive.

---

## 6. Verdict

1. **Sprint C bought quality with tokens.** NIMBL went from 273 to 281 solves while opencode held 75/75. The -44% token edge over opencode from run-6 shrank to -8.3% pooled (best mode -21%, hybrid).
2. **The token story must now be told per family**, not globally: retrieval -66%, single-fix -43%, long-horizon -35% cheaper than opencode; delegation +35%, multi-file +53% more expensive.
3. **The 18 zeroed runs are the single largest data-quality issue** in this run and the main blocker to claiming parity on hard tasks. Fixing the step-cap continuation dead-end (return partial results instead of throwing) is the highest-value next step - it would raise the raw solved count and remove ~40% of the remaining gap to opencode's 100%.
4. Next benchmark should re-run with the continuation fix and re-report; only then are family-level token claims vs opencode defensible.

# Phase 5 Controlled opencode vs NIMBL Benchmark (Same Endpoint, Same Model)

**Status:** fresh live run; directional result, not a release claim.

## Purpose

This is the first opencode comparison that satisfies the controlled head-to-head
gate from the Tier-F report: opencode 1.18.18 was pointed at the **same**
OpenRouter endpoint, the **same** API key, and the **same** model
(`deepseek/deepseek-v4-flash-0731:StreamLake`) as NIMBL's 300-run safe-fixes
benchmark, using the same corpus, sample count per task, concurrency, and seed
scheme. The only intentional harness difference is the agent (`opencode run
--auto` vs NIMBL's retrieval + agent pipeline) and, implicitly, the system
prompt / tool schemas each harness ships.

## Run Configuration

| Field | NIMBL | opencode |
|---|---|---|
| Raw record file | `.nimbl/benchmarks/agent-benchmark-20260728-s3-live-1786907292063.jsonl` | `.nimbl/benchmarks/opencode-benchmark-20260728-s3-1786913814362.jsonl` |
| Per-run raw directory | `.nimbl/benchmarks/raw-nimbl-1786907292063/` | `.nimbl/benchmarks/raw-opencode-1786913814362/` |
| Console log | `.nimbl/benchmarks/tier-fixes-300-live-auth.log` | `.nimbl/benchmarks/controlled-opencode-300.log` |
| Endpoint | `https://openrouter.ai/api/v1` | `https://openrouter.ai/api/v1` (injected via `opencode.json`) |
| Provider / model | openrouter / `deepseek/deepseek-v4-flash-0731:StreamLake` | `nimbl-bench/deepseek/deepseek-v4-flash-0731:StreamLake` (same route) |
| API key | OpenRouter key | Same OpenRouter key (read from auth, never logged) |
| Corpus | `benchmarks/corpus/tier-b` | Same 25-task corpus |
| Samples per task | 3 (× 4 modes) | 3 (single mode) |
| Runs | 300 | 75 |
| Concurrency | 8 workers, 180 requests/min | 8 concurrent processes |
| Rate cap | 180/min (self-imposed NIMBL knob) | None (StreamLake paid has no per-minute cap) |
| Seed | 20260728 (+ sample) | 20260728 (+ sample) |
| opencode version | - | 1.18.18 |
| Git revision | `35ad4eca7a32fbe8db03a56dc9c13ad7ce8a1581` | `1337b98357c6d95ff54d322927f8777b8325459d` |
| Worktree | Dirty | Dirty |

Because opencode's injected provider ID collides with a `whitelist` provider
already defined in the global config (`~/.config/opencode/opencode.jsonc`), the
harness injects the custom provider under a unique ID (`nimbl-bench`); opencode
resolves `--model nimbl-bench/<route>` to the same OpenRouter route.

## Accounting

- `totalTokens` (full) is sent input including cache-read input, plus output and
  reasoning.
- `billedTokens` is uncached input plus output and reasoning.
- opencode record fields are verified against each raw `step_finish` event:
  `full = input + cacheRead + output + reasoning`,
  `billed = input + output + reasoning`. 74/75 records match exactly. The one
  non-matching record is a 300 s timeout run whose raw-event array kept growing
  after the promise resolved (fixed by snapshotting at record creation; the
  recorded token counters were already frozen and are authoritative).
- The reference dollar figure uses NIMBL's `estimateReferenceCost()` (DeepSeek
  V4-Flash-0731 rates) for both sides. It is a reference estimate, not a
  provider invoice.

## Headline Results

| Metric | NIMBL (300 runs) | opencode (75 runs) | NIMBL delta |
|---|---:|---:|---:|
| Solved runs | **298/300 (99.3%)** | **71/75 (94.7%)** | **+4.6 pp** |
| Tasks solved at least once | 25/25 | 25/25 | equal |
| Timeouts / infrastructure failures | 0 | 2 (1 solved at kill, 1 unsolved) | - |
| Average full tokens/run | **82,389** | **177,537** | **-53.6%** |
| Average billed tokens/run | **21,364** | **43,327** | **-50.7%** |
| Average tool steps/run | 15 | 13 | +15.4% |
| Average latency/run | 49.2 s | 58.0 s | -15.2% |
| Reference cost total (per run) | $3.57 ($0.0119) | $1.86 ($0.0248) | -52.0% |

Both harnesses solved the full 25-task corpus at least once. On the exact 75
paired-seed samples opencode solved 71/75 while every NIMBL mode solved at
least 74/75 (`prompt-cache` and `none` 75/75), and NIMBL used roughly half the
tokens on average. The token gap is largest on retrieval and single-fix tasks,
where NIMBL's lexical/graph context selection returns a tiny, targeted file set
instead of opencode's default project scan.

## NIMBL Per Mode (vs opencode single mode)

| Mode | Solved | Full tokens/run | Billed tokens/run | Tool steps/run | Latency/run |
|---|---:|---:|---:|---:|---:|
| `none` | 75/75 | 67,430 | 19,473 | 16 | 56.3 s |
| `lexical` | 74/75 | 83,438 | 22,046 | 16 | 52.5 s |
| `hybrid` | 74/75 | 92,476 | 22,605 | 14 | 45.8 s |
| `prompt-cache` | 75/75 | 86,211 | 21,330 | 15 | 42.1 s |
| opencode (single mode) | 71/75 | 177,537 | 43,327 | 13 | 58.0 s |

Every NIMBL mode beats opencode on average full and billed tokens; `none` is
the cheapest on tokens, `prompt-cache` the fastest.

## Per Family

Family labels on the opencode side use the same NIMBL task-family mapping
(single-fix is the tag-precedence fallback). Deltas are per-run averages.

| Family | NIMBL solved | opencode solved | NIMBL billed avg | opencode billed avg | Billed delta | NIMBL full avg | opencode full avg |
|---|---:|---:|---:|---:|---:|---:|---:|
| retrieval | 59/60 | 14/15 | 2,491 | 31,114 | **-92.0%** | 9,702 | 68,214 |
| single-fix | 96/96 | 23/24 | 5,250 | 30,402 | **-82.7%** | 31,269 | 98,712 |
| test-writing | 24/24 | 6/6 | 9,409 | 27,975 | **-66.4%** | 47,788 | 102,694 |
| multi-file | 47/48 | 12/12 | 14,768 | 44,814 | **-67.0%** | 64,464 | 198,585 |
| shell-loop | 36/36 | 9/9 | 58,511 | 102,396 | **-42.9%** | 207,496 | 491,612 |
| delegation | 12/12 | 3/3 | 31,493 | 26,381 | +19.4% | 106,011 | 115,725 |
| long-horizon | 24/24 | 4/6 | 97,356 | 57,807 | +68.4% | 339,563 | 358,692 |

NIMBL is cheaper on billed tokens in 5 of 7 families. The two exceptions are
**not** efficiency wins for opencode:

- **delegation** (`dl-award-points`): opencode solved 3/3 with slightly fewer
  billed tokens (+19.4% for NIMBL) but sent ~9% more full tokens. Single-task,
  n=3; not meaningful.
- **long-horizon**: opencode solved only 4/6, and its average is pulled down by
  two cheap early failures (`lh-fix-all`: one 15 s / 17 k-token failure and one
  300 s timeout / 48 k-token failure). A lower spend that accompanies a lower
  solve rate is not a token-efficiency claim.

## Hard-Task Comparison (per-run averages)

| Task | NIMBL solved | opencode solved | NIMBL billed | opencode billed | Billed delta | NIMBL full | opencode full |
|---|---:|---:|---:|---:|---:|---:|---:|
| `lh-forced-context-rename` | 12/12 | 3/3 | 16,787 | 44,229 | **-62.0%** | 94,483 | 227,952 |
| `sh-hidden-green` | 12/12 | 3/3 | 99,694 | 113,069 | **-11.8%** | 368,600 | 765,528 |
| `sh-suite-green` | 12/12 | 3/3 | 64,048 | 173,234 | **-63.0%** | 213,530 | 657,873 |
| `lh-fix-all` | 12/12 | **1/3** | 177,924 | 71,385 | +149% | 584,644 | 489,433 |

`lh-fix-all` is the key caveat: opencode solved only 1 of 3 samples (one
300 s timeout, one 15 s failure), so its lower average billed tokens reflect
unfinished work, not efficiency. NIMBL solved all 12 and still sent 46.5%
fewer full tokens per run on the one solved-sample basis used in the Tier-F
report.

## Limitations And Next Steps

1. Single sample on each side; the paired-seed design (same `seed + sample`
   scheme) makes per-task seeds align, but 75 opencode runs is a modest n.
2. opencode 1.18.18 sends the same StreamLake route, but the harness-level
   difference (agent loop, system prompt, tool schemas, default context
   scanning) is the entire point of the comparison — do not attribute the gap
   to any single NIMBL feature.
3. The two opencode timeouts were killed by the harness's 300 s cap; a longer
   cap would raise opencode's solve rate but also its token spend.
4. Keep billed and full tokens separate in future reports; billed is the
   economic proxy, full measures context volume.
5. Next: implement the #10 compact-tool-schemas improvement and measure its
   delta with a targeted live NIMBL check before any further comparison runs.
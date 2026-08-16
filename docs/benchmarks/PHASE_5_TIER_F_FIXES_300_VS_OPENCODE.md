# Phase 5 Safe-Fixes Benchmark - 300 Runs vs Latest opencode

**Status:** fresh live benchmark completed; comparison is directional, not a release claim.

## Run Configuration

| Field | NIMBL | opencode comparison |
|---|---|---|
| Raw record file | `.nimbl/benchmarks/agent-benchmark-20260728-s3-live-1786907292063.jsonl` | `.nimbl/benchmarks/2026-08-15-run6-FINAL-4mode-vs-opencode-1786808124244/opencode-benchmark-20260728-s3-1786811591640.jsonl` |
| Per-run raw directory | `.nimbl/benchmarks/raw-nimbl-1786907292063/` | Stored in the existing opencode run directory |
| Console log | `.nimbl/benchmarks/tier-fixes-300-live-auth.log` | Existing run-7 artifacts |
| Provider/model | OpenRouter / `deepseek/deepseek-v4-flash-0731:StreamLake` | Latest recorded `netic/deepseek-v4-flash-free` run |
| Corpus | `benchmarks/corpus/tier-b` | Same 25-task corpus |
| Samples | 3 per task per mode | 3 per task, single mode |
| Modes | `none`, `lexical`, `hybrid`, `prompt-cache` | Single mode |
| Runs | 300 | 75 |
| NIMBL concurrency | 8 workers, 180 requests/minute | Existing artifact; not rerun |
| Safe opt-ins | `NIMBL_SCOPED_TOOLS=1`, `NIMBL_TEST_CACHE_HASH=1`, `NIMBL_REPO_MAP=1` | N/A |
| Git revision | `35ad4eca7a32fbe8db03a56dc9c13ad7ce8a1581` | Historical artifact |
| Worktree | Dirty | Historical artifact |

The NIMBL run completed without provider/API failures. All 300 records contain `benchmarkMetadata`.

## Accounting

- `totalTokens` is full sent input, including cache-read input, plus output/reasoning.
- `billedTokens` is uncached input plus output/reasoning.
- The opencode stored summary fields came from the older adapter. This report recomputes opencode totals from each raw `step_finish` event: `full = input + cacheRead + output + reasoning`, `billed = input + output + reasoning`.
- The endpoint, sample count, concurrency, and harness behavior are not identical. Do not treat the comparison as a controlled pricing experiment.
- NIMBL's `$3.57` `referenceCostUsd` is a reference estimate, not a provider invoice. No directly comparable provider dollar total is claimed here.

## Headline Results

| Metric | NIMBL safe-fixes run | Latest opencode | NIMBL delta |
|---|---:|---:|---:|
| Solved runs | **298/300 (99.3%)** | **75/75 (100%)** | -0.7 pp |
| Tasks solved at least once | **25/25** | **25/25** | equal |
| Zeroed runs | **0** | **0** | equal |
| Average full tokens/run | **82,389** | **196,918** | **-58.2%** |
| Average billed tokens/run | **21,364** | **46,844** | **-54.4%** |
| Average tool steps/run | 15 | 18 | -16.7% |
| NIMBL reference cost total | $3.57 | not comparable | - |

The two NIMBL failures were ordinary unsolved trajectories, not zeroed infrastructure failures: one retrieval run and one multi-file run. The run is materially better than the superseded TIER-E result, but it is still one 300-run sample on a dirty worktree.

## NIMBL Per Mode

| Mode | Solved | Full tokens/run | Billed tokens/run | Tool steps/run | Latency/run |
|---|---:|---:|---:|---:|---:|
| `none` | 75/75 | 67,430 | 19,473 | 16 | 56.3 s |
| `lexical` | 74/75 | 83,438 | 22,046 | 16 | 52.5 s |
| `hybrid` | 74/75 | 92,476 | 22,605 | 14 | 45.8 s |
| `prompt-cache` | 75/75 | 86,211 | 21,330 | 15 | 42.1 s |

`none` had the lowest average token use. `prompt-cache` had the fastest average latency and a perfect solve count in this sample.

## Per Family

Family labels on the opencode side are assigned using the NIMBL task-family mapping so the cohorts match.

| Family | NIMBL solved | NIMBL billed | opencode billed | NIMBL delta | NIMBL full | opencode full |
|---|---:|---:|---:|---:|---:|---:|
| retrieval | 59/60 | 2,491 | 23,543 | -89.4% | 9,702 | 75,750 |
| single-fix | 96/96 | 5,250 | 29,271 | -82.1% | 31,269 | 72,898 |
| test-writing | 24/24 | 9,409 | 36,785 | -74.4% | 47,788 | 106,076 |
| multi-file | 47/48 | 14,768 | 44,921 | -67.1% | 64,464 | 194,233 |
| delegation | 12/12 | 31,493 | 49,439 | -36.3% | 106,011 | 143,604 |
| shell-loop | 36/36 | 58,511 | 95,750 | -38.9% | 207,496 | 491,085 |
| long-horizon | 24/24 | 97,355 | 114,635 | -15.1% | 339,563 | 677,537 |

## Hard-Task Comparison

| Task | NIMBL solved | NIMBL billed | opencode billed | Billed delta | NIMBL full | opencode full |
|---|---:|---:|---:|---:|---:|---:|
| `lh-fix-all` | **12/12** | **177,924** | 183,943 | **-3.3%** | 584,644 | 1,092,615 |
| `sh-hidden-green` | **12/12** | **99,694** | 115,205 | **-13.5%** | 368,600 | 640,389 |
| `sh-suite-green` | **12/12** | **64,048** | 152,258 | **-57.9%** | 213,530 | 767,511 |
| `lh-forced-context-rename` | **12/12** | **16,787** | 45,327 | **-63.0%** | 94,483 | 262,458 |

The key result is `lh-fix-all`: the new run reached 12/12 and is slightly below the latest opencode sample on billed tokens, while sending approximately 46.5% fewer full tokens. This is a directional result, not proof of general superiority: the compared harnesses used different endpoints and different sample counts.

## Comparison With TIER-E

The previous TIER-E run was a superseded negative experiment. It measured the original read-cache stub and one-shot pruning changes, reached 291/300, and regressed its own full-sent average to 73,451 tokens/run. The fresh safe-fixes run reached 298/300, produced zero zeroed runs, and recorded 82,389 full tokens/run with all opt-ins enabled. The aggregate full-token number is higher than TIER-E because this run has a different trajectory distribution and no zeroed records; the stronger evidence is the hard-task result, especially `lh-fix-all` moving from 8/12 in TIER-E to 12/12 here.

## Limitations And Next Gate

1. Run a second 300-run sample before making a stable claim; this result is from one dirty revision.
2. Repeat the run with the opt-ins disabled to isolate each safe fix instead of attributing the pooled result to any single change.
3. Keep billed tokens and full tokens separate in future reports; billed tokens are the economic proxy, while full tokens measure context volume.
4. Compare against a fresh opencode run at the same endpoint and model configuration before claiming a controlled head-to-head.

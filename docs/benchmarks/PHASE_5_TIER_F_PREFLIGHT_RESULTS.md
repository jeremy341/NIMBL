# Phase 5 Research: TIER-F Hard-Task Preflight

**Status:** latest preflight documented; not a full 300-run release benchmark

## Purpose

TIER-F tests the four hard task families where TIER-D still had the largest gap from opencode:

- `lh-fix-all`
- `sh-hidden-green`
- `sh-suite-green`
- `lh-forced-context-rename`

The purpose was to test the Phase 1+2 execution changes before spending the cost of a full 300-run benchmark.

## Run Configuration

| Field | Value |
|---|---|
| Raw artifact | `.nimbl/benchmarks/agent-benchmark-20260728-s3-live-1786896475464.jsonl` |
| Provider | OpenRouter custom provider |
| Endpoint | `https://openrouter.ai/api/v1` |
| Model | `deepseek/deepseek-v4-flash-0731:StreamLake` |
| Corpus | `benchmarks/corpus/tier-b` |
| Samples | 3 per task/mode combination |
| Modes | `none`, `lexical`, `hybrid`, `prompt-cache` |
| Concurrency | 8 |
| Rate limit | 180 requests/minute |
| Context window | 200,000 tokens |
| Runs | 48 |
| Runtime | approximately 12 minutes |

The current committed code was validated with `bun run typecheck`. Focused agent/shell tests passed. The full suite reports `303 pass, 1 fail`; the remaining failure is the pre-existing `tests/stress.test.ts` expectation around context overflow.

## Changes Under Test

| Change | Intended effect | Result |
|---|---|---|
| **S1: read exemption** | Do not classify legitimate repeated reads as a fatal identical-tool doom loop. | Major solve-rate and zeroed-run improvement on hard tasks. |
| **S2: hard read budget restored to 8** | Avoid the v1/v2 experiment where a soft gate at 20 permitted uncontrolled investigation. | Correct cost-control choice; the gate remains bounded. |
| **Repeated-read nudge** | On the third identical read of a path, return a short directive instead of dumping the same content again; reset after edits. | Safe focused-test behavior; it did not materially affect `lh-fix-all` because the model mostly used Bash `Get-Content`. |
| **S3: targeted-test guidance** | Encourage running the failing test file before repeatedly running the full suite. | Improved shell-suite outcomes, but caused more distinct test commands on `lh-fix-all`. |
| **T1: 4,000-character Bash cap** | Bound shell output. | Helps output containment, but may cause more calls when the model uses globbed `Get-Content`. Requires a cap sweep. |
| **T5: test-command normalization/memoization** | Reuse unchanged test results for normalized equivalent commands. | Correctness tests pass; only a small number of live hits occurred because edits invalidate the cache. |

## Headline Results

| Metric | TIER-F v2 | TIER-F v1 | TIER-D hard-task subset | Interpretation |
|---|---:|---:|---:|---|
| Solved | **43/48 (89.6%)** | 42/48 (87.5%) | 38/48 (79.2%) | v2 is +5 solves over TIER-D subset. |
| Zeroed | **2** | 2 | 10 | Infrastructure deaths are greatly reduced versus TIER-D subset. |
| Usable-run average | approximately **239k tokens** | approximately 278k | lower overall | v2 improves v1, but the hard-task average is not a release-quality cost claim. |
| Runtime | approximately **112s average** | approximately 231s | not directly comparable | v2 is materially faster than v1. |

The overall usable-token average is not the right decision metric by itself because `lh-fix-all` dominates the tail. Per-task cost is the important result.

## Per-Task Results

| Task | TIER-F v2 solved | Full tokens | Billed tokens | Avg tool calls | TIER-D solved | TIER-D full tokens | Result |
|---|---:|---:|---:|---:|---:|---:|---|
| `lh-fix-all` | 9/12 | **540,814** | **216,505** | 165.9 | 9/12 | 291,104 | Solves hold; billed cost remains ~18% above opencode. |
| `sh-hidden-green` | **12/12** | 235,708 | **84,498** | 130.1 | 10/12 | 194,553 | +2 solves; billed tokens below opencode. |
| `sh-suite-green` | **11/12** | **95,936** | **29,772** | 167.1 | 8/12 | 217,283 | +3 solves and strong billed/full reduction. |
| `lh-forced-context-rename` | 11/12 | 58,158 | 15,732 | 33.2 | 11/12 | 43,336 | Same solve rate; billed tokens below opencode. |

For comparison, the reviewed opencode adapter reported billed totals of approximately 184k for `lh-fix-all`, 115k for `sh-hidden-green`, 152k for `sh-suite-green`, and 45k for `lh-forced-context-rename`. TIER-F v2 NIMBL billed values are approximately 216k, 84k, 30k, and 16k respectively. The samples and runtime configurations are not identical, so these are directional comparisons only.

## Root Cause of the Remaining Cost Gap

The `lh-fix-all` regression is not primarily caused by the `read` tool. In the worst v2 traces the model used Bash to read source files and tests:

- `lh-fix-all` test commands increased from **48 to 200** across solved runs.
- `Get-Content` calls increased from **68 to 172**.
- v2 produced **121 distinct normalized test commands**, compared with 31 in TIER-D.
- Memoization hit only five times because each edit invalidates the test cache and targeted files create distinct command keys.
- The model used `Get-Content` through Bash, which bypasses the read-specific repeated-read nudge and resets the investigation counter.

The important lesson is that targeted-test guidance improved some shell-loop outcomes but over-expanded the number of verification steps on a multi-domain task. The next experiment should not simply increase budgets. It should coordinate test selection, edit milestones, and Bash read accounting.

## Failure Interpretation

- Two zeroed runs still ended in a repeated-tool policy failure. These are remaining loop-control failures, not provider failures.
- The other hard-task failures were ordinary incomplete or unsuccessful agent trajectories, not infrastructure outages.
- TIER-F is a preflight, not evidence that NIMBL solves 90% of 300 unique tasks.
- `toolSteps` currently counts both running and terminal tool events in the benchmark instrumentation, so cross-harness step comparisons need correction before publication.
- Task tags are available to the benchmark budget selector. A production run must also test classifier-driven budget selection without oracle tags.
- The raw artifact is local and gitignored; benchmark metadata and git revision are not embedded in each record. Reproducibility should be fixed before the next headline benchmark.

## Gate Verdict

| Gate | Status |
|---|---|
| Hard-task solve rate improves | **Pass**: 43/48 vs 38/48 subset baseline |
| Zeroed runs are bounded | **Pass**: 2/48 |
| Shell-suite intelligence improves | **Pass**: 11/12 and 12/12 on the two shell tasks |
| `lh-fix-all` cost is no worse than TIER-D | **Fail**: 541k vs 291k average |
| Full benchmark readiness | **Not yet** |

The correct conclusion is: **Phase 1+2 materially improves hard-task completion. On a corrected billed basis, shell-suite tasks are already cheaper than the reviewed opencode sample; `lh-fix-all` remains approximately 18% higher because verification expands into too many Bash/test calls.**

## Required Next Measurement

Before a full 300-run benchmark:

1. Correct benchmark metadata and unique-tool-step accounting.
2. Run a small cap sweep for Bash output (`4k`, `8k`, and `12k`) on `lh-fix-all`.
3. Compare targeted test policy variants: single failing file, failing suite, and milestone-batched verification.
4. Count Bash file reads toward the same exploration budget as `read` where the command is a pure file dump.
5. Re-run the four-task preflight and require `lh-fix-all` to return near TIER-D cost without losing the shell-task solve gains.

## Related Artifacts

- `docs/benchmarks/TIER_D_RESULTS.md`
- `docs/benchmarks/TIER_E_RESULTS.md`
- `docs/benchmarks/TIER_E_VS_OPENCODE.md`
- `docs/benchmarks/ANALYSIS_BOTTLENECKS_AND_FIXES.md`
- `docs/benchmarks/FAILURE_ANALYSIS_LH_MF_SH.md`
- `.nimbl/benchmarks/agent-benchmark-20260728-s3-live-1786896475464.jsonl`

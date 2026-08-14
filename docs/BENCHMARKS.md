# NIMBL Benchmarks — How to Measure Tokens & Task Quality

NIMBL's thesis is **token efficiency without quality loss**. Two harnesses make that measurable and defensible:

1. **Retrieval benchmark** (`benchmarks/run.ts`, `src/core/benchmark.ts`) — measures how well context *selection* finds the right files (precision@k / recall@k / MRR) and how many tokens the selected excerpts cost.
2. **End-to-end agent benchmark** (`benchmarks/agent-run.ts`, `src/core/agent-benchmark.ts`) — runs the **full agent** (tools, permissions, retries, context, compression, prompt caching) against frozen coding tasks and grades **task success** with ground-truth verifiers, while recording real token usage, cache splits, cost, and latency per configuration.

---

## 1. Retrieval benchmark (context selection quality)

```bash
bun benchmarks/run.ts
NIMBL_BENCH_SAMPLES=5 bun benchmarks/run.ts   # variance across samples
NIMBL_BENCH_COLD=1 bun benchmarks/run.ts       # cold cache
```

Runs `none / lexical / structural / graph / semantic / hybrid / prompt-cache` over `benchmarks/corpus/` and writes raw JSONL to `.nimbl/benchmarks/`. Each record has task, mode, seed, selected paths, precision/recall/MRR, estimated tokens, latency, and full retrieval telemetry. **A mode is only "better" if its token count drops without quality regressing** (see `defensibleClaims`).

## 2. End-to-end agent benchmark (tokens + task success)

```bash
bun benchmarks/agent-run.ts                                        # synthetic, deterministic
NIMBL_BENCH_LIVE=1 NIMBL_PROVIDER=opencode-go NIMBL_MODEL=deepseek-v4-flash NIMBL_BENCH_SAMPLES=3 bun benchmarks/agent-run.ts
```

- **Synthetic (default):** drives the real agent loop + real tools (read/edit/bash) with a deterministic model backend. No API key needed, fully reproducible, and it exercises the whole pipeline. Useful for CI and for validating the harness itself.
- **Live (`NIMBL_BENCH_LIVE=1`):** uses your real provider/model and reports **actual token usage** (input/output/cache read/write), provider cost, latency, and whether each task actually solved. This is what produces the numbers for claims.
- **Custom endpoint (`NIMBL_CUSTOM_*`):** register any OpenAI-compatible endpoint at runtime:
  ```bash
  NIMBL_CUSTOM_PROVIDER=custom NIMBL_CUSTOM_BASE_URL=https://netic.hackclub.app/v1 \
  NIMBL_CUSTOM_MODEL=deepseek-v4-flash-free NIMBL_CUSTOM_API_KEY=<key> \
  NIMBL_PROVIDER=custom NIMBL_MODEL=deepseek-v4-flash-free \
  NIMBL_BENCH_LIVE=1 bun benchmarks/agent-run.ts
  ```

### What it measures per (task × mode × sample)

| Metric | Meaning |
|---|---|
| `solved` | every ground-truth verifier passed |
| `passedChecks / totalChecks` | partial grading |
| `inputTokens / outputTokens / totalTokens` | real (live) or synthetic token accounting |
| `noCacheTokens / cacheReadTokens / cacheWriteTokens` | prompt-cache split |
| `referenceCostUsd / providerCostUsd` | GPT-4o reference vs real provider cost |
| `latencyMs` | wall time incl. context build + tool calls |
| `toolSteps` | number of tool calls made |
| `retrievalTokens / retrievalCandidates` | how much context retrieval contributed |

### Configurations (modes)

`none` (no context) · `lexical` (lexical + structural compression) · `hybrid` (graph + hybrid retrieval + structural) · `prompt-cache` (hybrid + caching). The summary reports solved/total and token variance per mode — so you can answer **"does hybrid context let the agent solve the same tasks with fewer tokens than none?"**

### Corpus

`benchmarks/corpus/agent-tasks.json` — frozen tasks against `benchmarks/corpus/fixture/`. Verifiers: `fileContains`, `fileAbsent`, `command` (exit 0), `answerContains`. **Do not edit fixture files or ground truth after a commit is tagged for a claim.**

### The rule for claims

A lower-token result is **not** "better" if task quality regresses. Use the per-mode `solved` counts next to the token variance; only claim savings for modes that solve at least as many tasks as the baseline.

---

## 3. Reproducibility guarantees

Every run record carries `benchmarkMetadata`: timestamp, seed, git revision, git-dirty flag, NIMBL version, provider, model, context window, and cache state. Raw results are committed JSONL under `.nimbl/benchmarks/`. Re-run with the same seed + revision + env to reproduce.

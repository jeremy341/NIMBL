# Phase 5 Research: NIMBL Optimization Brainstorm

**Status:** ideas and experiments only; three Priority-0 measurement items implemented 2026-08-16 (✅ marked below); remaining ideas not yet implemented

**Target:** keep NIMBL cheap and fast while reaching approximately 80-90% of opencode's coding intelligence, with a path toward solving all 300 benchmark runs. The target is a quality-constrained frontier, not token minimization at any cost.

**Accounting:** the historical NIMBL token figures in this document are full-sent tokens, including cache-read input. Use `billedTokens` and provider cost for economic comparisons with opencode.

## Rating Scale

- **TE:** expected token/cost efficiency, 1-5
- **SP:** expected speed/latency, 1-5
- **IN:** expected solve quality/intelligence, 1-5
- **IR:** implementation risk, 1-5; higher is riskier
- **CF:** confidence that a controlled experiment will be informative, 1-5

Ratings are hypotheses. Every item has an experiment and a kill criterion.

## What the TIER Results Say

| Evidence | Meaning for the backend |
|---|---|
| TIER-D: 288/300, 40,992 usable tokens/run, 35s average | NIMBL is already cheap and reliable on short/retrieval-heavy families. |
| TIER-E: 291/300 but 73,451 tokens/run and $1.70 | Better solves do not justify unbounded history or cache-prefix gains. |
| TIER-F v2: 43/48 hard-task solves, 2 zeroed | Read-loop hardening materially improves difficult tasks. |
| TIER-F v2 `sh-suite-green`: 11/12 at 95,936 tokens | Targeted verification can be a major win in the right task shape. |
| TIER-F v2 `lh-fix-all`: 9/12 at 540,814 tokens | The current long-horizon loop still overuses Bash and test invocations. |
| TIER-E read-cache stub | Contentless unchanged-read responses push the model to Bash; do not repeat this design. |
| TIER-E one-shot prune | Stable cache prefixes are not worth unbounded history rebilling. |

## Priority 0: Measurement and Control

> **Status update 2026-08-16:** three items below are now implemented in the safe-fixes set
> (✅) and validated by the 300-run `PHASE_5_TIER_F_FIXES_300_VS_OPENCODE.md`.

| Idea | Why it matters | TE | SP | IN | IR | CF | Experiment / kill criterion |
|---|---:|---:|---:|---:|---:|---|
| ✅ Correct unique tool-call accounting | Current running + terminal event counting inflates steps and weakens harness comparisons. | 1 | 2 | 1 | 1 | 5 | `toolSteps` now counts unique terminal tool IDs only. |
| ✅ Embed benchmark metadata per record | Current raw records do not carry full revision, dirty state, provider, model, and cache metadata. | 1 | 2 | 1 | 1 | 5 | Every record carries `benchmarkMetadata` (revision, dirty, provider, model, context, cache state). |
| ⬜ Remove oracle task tags from evaluation | Budget selection using task tags overstates production behavior. | 2 | 2 | 4 | 2 | 5 | Compare tag-free classifier routing against oracle budgets. Kill improvements that disappear without tags. |
| ⬜ Progress-aware loop controller | Track discovery, edits, verification, changed files, and useful observations instead of raw steps. | 4 | 4 | 5 | 3 | 5 | Replay hard traces. Require at least +10 percentage points on hard solves or a measurable tail-token reduction; reject if easy-task tokens rise over 10%. |
| ✅ Bash-aware exploration budget | Pure `Get-Content`/file-dump commands currently bypass the read gate. | 4 | 4 | 4 | 2 | 5 | `isReadLikeShellCommand` now soft-counts pure file-inspection Bash into `readsSinceEdit` (does not hard-block). |
| ⬜ Failure taxonomy | Without labels, optimizations can trade one failure class for another. | 3 | 2 | 5 | 2 | 5 | Label historical traces: retrieval miss, audit loop, edit failure, test misunderstanding, context, provider, permission, evaluator. Reject features with no attributable failure change. |

## Priority 1: Long-Horizon and Shell-Loop Execution

| Idea | Why it matters | TE | SP | IN | IR | CF | Experiment / kill criterion |
|---|---|---:|---:|---:|---:|---:|---|
| Phase-gated repair mode | Force `localize -> plan -> edit -> targeted verify -> final verify` for multi-file tasks. | 4 | 4 | 5 | 3 | 5 | Run `lh-fix-all`, `mf-*`, and shell tasks. Reject if hard solves do not improve or if easy tasks inherit the overhead. |
| Milestone ledger | Preserve goal, files, decisions, tests, errors, unresolved work, and next action as structured state. | 4 | 3 | 5 | 3 | 4 | Force repeated compaction and measure repeated work. Reject if decisions or failing paths are lost. |
| Targeted verification planner | Parse failure paths, changed files, package scripts, and compiler output to select one test command. | 3 | 4 | 5 | 3 | 5 | Compare file, suite, and milestone-batched policies. Reject if test tokens or missed regressions rise. |
| Bash output cap sweep | TIER-F suggests 4k may cause more globbed `Get-Content` calls. | 3 | 3 | 3 | 1 | 5 | Compare 4k/8k/12k on the four hard tasks. Choose the cheapest quality-preserving cap. |
| Read/glob/grep evidence packet | Return path, symbols, line ranges, signatures, imports, and a small relevant body by default. | 5 | 4 | 4 | 3 | 4 | Compare current reads with bounded packets. Reject if the model compensates with Bash rereads or hidden-test solves fall. |
| Stuck detector | Detect read-heavy loops, repeated failed tests, unchanged fingerprints, no edits, and no-progress windows. | 4 | 4 | 5 | 3 | 5 | Replay known failures. Reject if false positives exceed 5% of solved runs. |
| Structured tool outcomes | Return `success`, `changed`, `diagnostics`, `retryable`, and `nextSuggestedAction` fields. | 3 | 3 | 4 | 3 | 4 | Test malformed streams and provider compatibility. Reject if tool-call errors increase. |

## Priority 1: Context, Retrieval, and Memory

| Idea | Why it matters | TE | SP | IN | IR | CF | Experiment / kill criterion |
|---|---|---:|---:|---:|---:|---:|---|
| Rolling append-only condensation | Keep stable head, structured ledger, and recent tail; summarize the middle incrementally. | 5 | 3 | 5 | 3 | 5 | Compare against per-step pruning and TIER-E one-shot pruning. Reject if cache gains do not beat history cost or decision retention falls. |
| Evidence registry | Store file hash, symbols, ranges, test relevance, and provenance; ask for new content only when needed. | 5 | 4 | 4 | 3 | 4 | Must never return contentless stubs. Reject if Bash rereads increase or required details disappear. |
| Intent-adaptive retrieval | Lexical for exact symbols, structural for declarations, graph for dependencies, semantic for conceptual queries. | 4 | 4 | 4 | 2 | 4 | Compare fixed hybrid against adaptive selection using MRR and solve rate. Reject if retrieval latency rises without quality gain. |
| Graph-scatter-aware expansion | Expand farther only when relevant hits are distributed across modules. | 4 | 4 | 4 | 2 | 4 | Add scatter telemetry. Reject if context tokens rise over 15% without recall gain. |
| Query expansion from failures | Derive aliases from test names, compiler errors, exports, and paths. | 4 | 3 | 4 | 3 | 4 | Offline retrieval benchmark plus hard replay. Reject if false positives or retrieval tokens rise over 10%. |
| Moderate query-aware compression | Extractively prune low-value sentences after retrieval; preserve syntax, imports, paths, and diagnostics. | 5 | 3 | 4 | 3 | 4 | Test compression ratios 0.5 and 0.75. Reject any hidden-test regression or compensating reread increase. |
| LSP diagnostic adapter | Use definitions, references, diagnostics, and compiler output as high-confidence retrieval. | 3 | 3 | 5 | 4 | 3 | Prototype TypeScript only. Reject if startup dominates normal latency or absence of LSP is not graceful. |

## Priority 1: Tool and Model Economics

| Idea | Why it matters | TE | SP | IN | IR | CF | Experiment / kill criterion |
|---|---|---:|---:|---:|---:|---:|---|
| Intent-scoped tools | Large tool schemas and catalogs reduce tool-call reliability. | 4 | 3 | 3 | 3 | 4 | Compare schema tokens and malformed-call rates by task family. Reject if weak models call tools less reliably. |
| Role-specific routing | Cheap models for classification, reranking, compaction, and teaching checks; strong model for difficult edits. | 4 | 4 | 4 | 4 | 3 | Begin with compaction only. Reject if savings are erased by duplicate context or more retries. |
| Verification-confidence escalation | Spend more steps only after failed verification, scattered retrieval, or low progress. | 4 | 4 | 5 | 4 | 3 | Compare fixed budgets with adaptive frontier. Reject if easy tasks cost over 15% more without quality gain. |
| Provider health routing | Use latency EWMA, errors, rate limits, capability, and price. | 3 | 5 | 3 | 3 | 4 | Replay outages and slow providers. Reject oscillating routes or silent quality loss. |
| Parallel independent reads | Reduce wall time for independent retrieval/search calls. | 2 | 5 | 3 | 3 | 4 | Compare wall clock and context size. Reject if output ordering or context growth harms solves. |
| Compact tool schemas | Reduce fixed per-step schema overhead. | 4 | 3 | 3 | 3 | 4 | Measure uncached tokens/step and invalid tool calls. Reject if the model loses tool semantics. |

## Priority 2: Teaching and Long-Term Value

| Idea | Why it matters | TE | SP | IN | IR | CF | Experiment / kill criterion |
|---|---|---:|---:|---:|---:|---:|---|
| Evidence-based mastery | A successful assisted fix should not automatically increase learner mastery. | 2 | 2 | 5 | 3 | 5 | Raise confidence only after independent explanation, quiz, or later fix. Reject if assisted success still inflates mastery. |
| Teach from verification evidence | Explain the failing assertion, change, and concept from existing trace data without another model call. | 3 | 2 | 5 | 2 | 4 | Compare factuality and answer leakage. Reject unsupported explanations. |
| Adaptive Socratic/narrative mode | Experts need concise narrative; learners may benefit from questions. | 2 | 3 | 4 | 3 | 4 | Measure follow-ups, completion, and leakage. Reject abandonment or answer disclosure. |
| Verified project skills | Persist intent -> fix -> verification patterns with file hashes and provenance. | 4 | 3 | 5 | 4 | 3 | Reuse only on repeated repository tasks. Reject stale or unverified advice. |

## Priority 0 Security and Reliability

| Idea | TE | SP | IN | IR | CF | Experiment / kill criterion |
|---|---:|---:|---:|---:|---:|---|
| Secret redaction before persistence and telemetry | 2 | 2 | 2 | 3 | 5 | Seed fake credentials through files, shell, prompts, and exports. Release-block on leakage. |
| OS-backed credential storage | 1 | 2 | 1 | 4 | 5 | Test Windows and non-Windows migration/revocation. Avoid silent plaintext fallback. |
| SSRF-safe webfetch | 1 | 2 | 2 | 3 | 5 | Block loopback, link-local, private addresses, unsafe redirects, and file-like URLs by default. |
| Deterministic replay/fault injection | 2 | 2 | 4 | 3 | 5 | Replay malformed streams, provider errors, stale locks, interrupted processes, and concurrent writes. |
| Resource budgets beyond tokens | 3 | 4 | 4 | 3 | 5 | Bound wall time, subprocesses, output bytes, index memory, embedding calls, and child sessions. |

## What Not to Do Yet

1. Do not reintroduce the TIER-E contentless read-cache stub.
2. Do not use one-shot pruning merely to increase cache-read percentage.
3. Do not increase every hard-task step budget before reducing audit and verification loops.
4. Do not add tree search or multi-agent swarms to easy tasks.
5. Do not claim semantic retrieval quality without offline retrieval metrics and end-to-end task evidence.
6. Do not optimize solved-run token averages while hiding zeroed-run cost and failure probability.

## Proposed Experiment Order

1. Measurement correction and failure labeling.
2. Bash-aware progress controller plus targeted verification planner.
3. Bash-cap and verification-policy sweep on the four hard tasks.
4. Rolling structured condensation and evidence registry.
5. Intent-scoped tools and moderate evidence compression.
6. Adaptive retrieval and graph-scatter budgets.
7. Difficulty-aware model/provider routing.
8. Teaching evidence and verified project skills.

The order is deliberate: control the loop before adding more intelligence, and measure the frontier before expanding the architecture.

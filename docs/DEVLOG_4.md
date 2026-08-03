# NIMBL - Devlog #4: Graph Edges, Vector Indexes, and a Benchmark That Can Prove It

Devlog #3 ended with parser-backed structural chunks and a promise: prove NIMBL saves tokens on reproducible tasks without making answers worse. This one covers the phases between that promise and the harness that can check it.

## Context Stopped Being Just Lexical

The index used to pick files by term frequency, proximity, symbol names, and path relevance, then stop. That handles "where is the theme set" but not "who calls this helper." P2-03 added a dependency graph over the same files the index already reads.

Every file and symbol gets a stable identity (`file:path`, `path#name`). Edges come from imports, exports, references, calls, inheritance, and test relationships. Ambiguous symbol names are deliberately not linked, because a wrong edge is worse than no edge. When a file changes, only its edges are recomputed.

Retrieval now seeds the graph with lexical matches and expands under a strict budget with hop tracking. A candidate selected via `src/features/feature.ts` can pull in its importers, its tests, or the report generator that calls it. Each expansion carries a `graph: …` reason so the UI and benchmark logs can explain why a file appeared.

## Semantic Retrieval Without the Marketing

Real semantic search needs hosted embeddings, but NIMBL should work offline. P2-04 split the difference:

- A deterministic local embedder that never needs a network call, and a hosted OpenAI-compatible `/embeddings` adapter when you set `NIMBL_EMBEDDINGS_URL/KEY/MODEL`.
- A versioned vector index at `.nimbl/vector-index.json`, keyed by content hashes, persisted and reloaded when sources are unchanged.
- Hybrid fusion: lexical at 0.5, semantic at 0.35, graph at 0.15, with MMR diversity and duplicate suppression.

The important sentence here: the offline embedder is a real feature, not a claim about semantic quality. P3-01 exists precisely so nobody confuses the two.

## Provider Prompt Caching Is Not the Retrieval Cache

Two things were getting conflated. The local retrieval cache answers "have I run this index query before." Provider prompt caching answers "does the model API charge me less for a stable prefix I already sent."

P2-05 builds a stable system prefix (instructions, project instructions, session summary) ahead of the dynamic retrieval text. Anthropic gets per-part `cacheControl: { type: "ephemeral" }` on the stable parts. OpenAI-compatible chat providers get a stable `promptCacheKey` with explicit mode. The OpenAI Responses API and local providers get no hint at all, because they either cache automatically or would ignore it. Provider-reported cache read/write tokens already flow into usage records.

## The Benchmark

P3-01 is a frozen corpus at `benchmarks/corpus/`: a small fixture project and `tasks.json` with ground-truth relevant files per query. The harness runs lexical, graph, and hybrid modes against the same queries, grades precision@k, recall@k, and MRR, repeats across samples for variance, and writes raw JSONL under `.nimbl/benchmarks/` with the git revision, seed, and config that produced it.

```bash
bun benchmarks/run.ts
NIMBL_BENCH_SAMPLES=5 bun benchmarks/run.ts
```

The first run is not a marketing claim, and it should not be cited as one: on the tiny fixture, lexical and hybrid land at recall 1.0 / MRR ~0.92–1.0 while graph expansion trades precision for breadth (recall 0.83, MRR 0.625) because it pulls importers that ground truth didn't ask for. That is exactly the kind of trade-off P3-02 is meant to measure on a real corpus before any number leaves this repository.

## Where It Stands

149 tests pass across config, api, context, dependency graph, structural chunks, hybrid retrieval, prompt caching, benchmark grading, agents, sessions, permissions, and TUI smoke coverage. `bun run typecheck` is clean. The roadmap's P2-03, P2-04, P2-05, and P3-01 checklists are complete; P3-02 ablations and P3-03 claims are the honest next step.

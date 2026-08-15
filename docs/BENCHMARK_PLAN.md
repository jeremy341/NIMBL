# NIMBL Benchmark Plan — How Coding Harnesses Are Benchmark, And What We Should Run

**Date:** 2026-08-14
**Research basis:** SWE-bench / SWE-bench Verified (OpenAI), aider Polyglot leaderboard, Terminal-Bench, SWE-agent scaffolds, our own P3-01/P3-02 work.

---

## 1. How the industry benchmarks coding agents

Three dominant methodologies, in increasing fidelity:

### 1.1 SWE-bench / SWE-bench Verified (task-solving)
- **Setup:** real GitHub issues; agent gets a repo + issue text, must produce a patch. Hidden tests grade it.
- **Grading:** `FAIL_TO_PASS` tests (must pass = issue solved) + `PASS_TO_PASS` tests (must still pass = no regressions). Both required → task "resolved".
- **Key lessons from the Verified paper:**
  - Tasks must be *well-specified* and tests must *fairly* judge solutions — they threw out 68% of original samples as underspecified or unfair.
  - Results are reported per **difficulty bucket**, and solve rate is the headline metric.
- **What it measures:** pure task success. **What it ignores:** token usage, cost, latency. (That's why we need more.)

### 1.2 Aider Polyglot leaderboard (editing + efficiency)
- **Setup:** 225 Exercism exercises across C++, Go, Java, JavaScript, Python, Rust. Agent must write code that passes hidden tests.
- **Grading:** `Pass rate 1` (no test feedback) and `Pass rate 2` (with test/error feedback, more realistic for agents). Reports **% correct**, **$ total cost**, **$ per case**, **seconds per case**, **prompt tokens**, **completion tokens**, **% well-formed outputs**, malformed-response counts, exhausted-context counts, user-ask counts.
- **What it measures:** correctness **and** cost **and** tokens **and** latency, all on the same corpus.
- **Lesson for NIMBL:** this is the closest model — pair a success metric with full token/cost/latency accounting so "better" means *same-or-better quality at fewer tokens*.

### 1.3 Terminal-Bench / SWE-agent (end-to-end agents)
- Agent gets a shell in a repo, works autonomously. Graded on whether it passes hidden tests / produces the required artifact. Focuses on agent loop behavior (tool use, iteration, recovery).

### 1.4 Ablation / efficiency benchmarks (our unique angle)
- No mainstream harness measures **"equal quality with fewer context tokens"** head-to-head across harnesses on the same model. That's NIMBL's differentiator and where we can lead.
- Standard practice: fix the **model**, vary only the **harness** (context selection, compression, caching), measure quality + tokens + cost, and only call a configuration "better" if quality doesn't regress (our P3-03 rule).

---

## 2. What NIMBL should benchmark (the full suite)

We need three layers, from cheap/fast to expensive/defensible.

### Layer A — Retrieval quality (implemented, P3-01)
`bun benchmarks/run.ts` — context selection precision/recall/MRR + estimated tokens per mode (none/lexical/structural/graph/semantic/hybrid/prompt-cache). Validates the *context layer* in isolation. Keep.

### Layer B — End-to-end agent task benchmark (implemented, P3-02)
`bun benchmarks/agent-run.ts` — runs the **real agent** on frozen coding tasks with ground-truth verifiers. Reports per task×mode×sample:
- `solved` (all verifiers pass) + partial `passedChecks`
- input/output/total tokens, cache read/write split
- reference cost (GPT-4o) + real provider cost
- latency, tool steps, retrieval tokens
- Synthetic mode (no key, deterministic) and **live mode** (`NIMBL_BENCH_LIVE=1`).

### Layer C — Cross-harness comparison vs opencode (implemented, P3-03)
`bun benchmarks/compare-run.ts` — same corpus, same verifiers, same model:
- NIMBL live run vs `opencode run --format json --auto` run
- opencode token usage parsed from its `step_finish` events (input/output/cache/cost)
- **head-to-head per task: solved? tokens? cost? latency?**

---

## 3. Concrete benchmark runs we should execute

### 3.1 Every release / CI (fast, no key)
```bash
bun run typecheck
bun test
bun benchmarks/run.ts                     # retrieval quality (synthetic, deterministic)
bun benchmarks/agent-run.ts               # agent task benchmark, synthetic mode
```
Checks the harness still behaves; catches regressions. ~1 min.

### 3.2 When measuring real token efficiency (needs a key)
```bash
# Same model, both harnesses, live — via a shared custom OpenAI-compatible endpoint:
OPENCODE_BENCH_MODEL=netic/deepseek-v4-flash-free \
OPENCODE_BENCH_BASE_URL=https://netic.hackclub.app/v1 \
OPENCODE_BENCH_API_KEY=<key> \
OPENCODE_BENCH_PROVIDER=netic \
bun benchmarks/compare-run.ts
```
`compare-run.ts` now registers the SAME endpoint as a NIMBL custom provider
(`NIMBL_CUSTOM_*` env vars are derived automatically), so **both harnesses run the
identical model live** and the comparison is apples-to-apples.
**The key fairness rule: identical model + identical corpus + identical verifiers. Only the harness varies.**

### 3.3 NIMBL custom provider (any OpenAI-compatible endpoint)
```bash
NIMBL_CUSTOM_PROVIDER=custom NIMBL_CUSTOM_BASE_URL=https://netic.hackclub.app/v1 \
NIMBL_CUSTOM_MODEL=deepseek-v4-flash-free NIMBL_CUSTOM_API_KEY=<key> \
NIMBL_PROVIDER=custom NIMBL_MODEL=deepseek-v4-flash-free \
NIMBL_BENCH_LIVE=1 bun benchmarks/agent-run.ts
```
This registers a runtime provider (base URL, model, key) without editing the catalog.
`getProvider` auto-registers it lazily whenever `NIMBL_CUSTOM_BASE_URL` is set.

### 3.3b Reference result (2026-08-14, netic deepseek-v4-flash-free)

Both harnesses solved all 6 tasks at equal quality; NIMBL (hybrid) used fewer tokens on every task:

| task | NIMBL (hybrid) tokens | opencode tokens | NIMBL savings |
|---|---|---|---|
| read-config | 5,525 | 12,253 | 55% |
| theme-config | 6,083 | 13,189 | 54% |
| add-helper | 5,916 | 10,983 | 46% |
| feature-summary | 9,739 | 25,597 | 62% |
| update-config | 8,894 | 25,254 | 65% |
| run-tests | 20,522 | 27,799 | 26% |

Note: single-sample, tiny corpus — treat as indicative, not a published claim until
a bigger corpus + ≥3 samples + committed raw JSONL.
For the chosen model, run NIMBL live on all 6 tasks in every mode:
```
modes: none | lexical | hybrid | prompt-cache
samples: 3 (for variance)
```
Then compare against opencode. Report table:

| task | mode | solved | input | output | cache read | total | $ cost | latency |
|---|---|---|---|---|---|---|---|---|
| read-config | hybrid | ✓ | 620 | 90 | 8k | 710 | 0.0002 | 3.1s |
| … | | | | | | | | |
| **opencode** | – | ✓ | 11k | 130 | 12k | 13.5k | 0.01 | 15s |

**Claim format (P3-03):** "On `deepseek-v4-flash` over NIMBL's 6-task corpus, the `hybrid` configuration solved 6/6 tasks with **X% fewer input tokens** than opencode at equal quality." Only publish if `solved` counts match and raw JSONL + git revision are committed.

> **Tier B update (2026-08-15):** the 150-file generated corpus (25 tasks × 3 samples, same
> netic model) initially did **not** reproduce these savings (run-1 baseline: NIMBL hybrid solved
> 68/75 at ~20% more tokens; opencode solved 75/75). After the root-cause fixes, the final
> run-6/7 (tag `1786808124244` + `1786811591640`) **did** reproduce savings: NIMBL solved 67–69/75
> (89–92%) vs opencode 75/75, at **40–44% fewer tokens per solved task** (26.2–28.0k vs 46.8k) and
> ~38% lower latency. See [docs/TIER_B_FINAL_RESULTS.md](./TIER_B_FINAL_RESULTS.md) for the
> per-task/category tables, the shell-mismatch / analysis-paralysis / delegation-overhead root
> causes, and the actionable fixes (shell-hint in the bash tool description, verify-after-edit
> nudge, delegate token budget).

### 3.4 Recommended target metrics to report per release
1. **Solve rate** (tasks fully passed / total) — primary quality
2. **Tokens per solved task** (input + output, excluding cache) — efficiency
3. **Cache-hit ratio** (cache read / input) — caching effectiveness
4. **$ per solved task** (provider cost) — cost efficiency
5. **Median latency per task** — responsiveness
6. **Tool calls per task** — agent-loop efficiency

---

## 4. What we still need to build / tighten (honest gaps)

| Gap | Why | Effort |
|---|---|---|
| ~~**NIMBL custom baseURL provider**~~ | ~~Without this, the head-to-head isn't "same model both sides"~~ | **DONE — `NIMBL_CUSTOM_*` env vars register a runtime provider; compare-run derives them from `OPENCODE_BENCH_*` so both sides are identical** |
| **Bigger corpus** — 6 tiny fixture tasks solve 100% on both, so it can't discriminate | Real claims need tasks with a spread of difficulty; add bug-fix + multi-file + test-writing tasks | Medium |
| **Per-difficulty reporting** (SWE-bench style buckets) | Makes claims robust | Small |
| **Cost: commit raw results per release** | P3-03 requires it | Process, not code |
| **≥3 samples for variance** on live runs | Single-sample numbers are indicative, not claims | Process |

---

## 5. Summary — the benchmark set we should run

1. **Retrieval benchmark** (synthetic, CI) — context quality, per mode. ✔ exists
2. **Agent task benchmark** (synthetic + live) — solve rate + tokens + cost + latency, per mode. ✔ exists
3. **Cross-harness comparison vs opencode** (live, same model) — the headline "token-efficient at equal quality" claim. ✔ exists (needs NIMBL custom-provider support for true parity)
4. **Ablation matrix** — prove which config is most token-efficient without quality loss. ✔ exists (via modes)
5. **Release gate** — commit raw JSONL + git revision with every savings claim.

The single most important step was adding a **NIMBL custom-provider/baseURL override** so both harnesses run the exact same model — that's now done (`NIMBL_CUSTOM_*` env vars + auto-derivation in compare-run), and a reference live run (netic deepseek-v4-flash-free) shows NIMBL solving all 6 tasks at equal quality with 26–65% fewer tokens. Next: a bigger, difficulty-spread corpus and committed raw results per release.

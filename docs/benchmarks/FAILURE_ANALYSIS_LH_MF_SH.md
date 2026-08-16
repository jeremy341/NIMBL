# NIMBL Failure Analysis: long-horizon, multi-file, shell-loop tasks

**Source:** final run-6/7 (`2026-08-15-run6-FINAL-4mode-vs-opencode-1786808124244`),
cross-checked against run-1 baseline and run-3 (both hybrid-only).
**Git:** `6c38ad0` · **Model:** `netic/deepseek-v4-flash-free` · **Samples:** 3/task/mode.

## TL;DR

NIMBL fails `lh-fix-all`, `sh-hidden-green`, and `mf-quote-margin` because it runs out of
**agent steps before it ever commits a fix**. Every failing run ends with
`finishReason: "tool-calls"` at the step cap — the model is *mid-investigation*, not mid-fix.
The agent is capped at **8 tool steps** while opencode is given effectively unlimited steps
(72–102 steps on `lh-fix-all`). On top of the cap, NIMBL's read-heavy "audit loop" behavior
burns most of those steps on reads (52–83 reads per failure, **0–3 edits**), and the existing
read-to-edit guard is advisory only — it injects a message but never halts the loop.

## 1. Scope of the problem

| Task | tags | run-1 | run-3 | run-6 (all 4 modes) |
|---|---|---|---|---|
| `lh-fix-all` | long-horizon, multi-file | 0/3 | 0/3 | **0/12** |
| `sh-hidden-green` | shell-loop, bug-fix | 1/3 | 0/3 | 5/12 (1–2/3 per mode) |
| `mf-quote-margin` | multi-file, bug-fix | 2/3 | 2/3 | 7/12 (1–2/3 per mode) |
| `mf-fulfill-dispatch` | multi-file | – | – | 11/12 (only `lexical` 2/3) |

The failures are **persistent across runs and independent of retrieval mode** (`none` fails as
often as `hybrid`/`prompt-cache`). This is an agent-loop problem, not a context-selection
problem.

## 2. Failure signature

Every failing record (`n=27`) shows:

- `finishReason: "tool-calls"` — the SDK's `stopWhen(stepCountIs(...))` cut the stream while a
  tool call was still pending. The agent did **not** finish, and it did **not** hit an error or
  a token limit.
- `attempts: 1` — the retry loop re-arms only on **thrown** errors (agent.ts:699-739). A step-cap
  cut-off returns normally with `finishReason: "tool-calls"`, so **no retry is triggered** even
  though `maxAttempts`/`MAX_ATTEMPTS` would otherwise allow up to 3 (live: 5).
- Step budget: benchmark passes `maxToolSteps: 8` (agent-benchmark.ts:532); `agent.ts:142`
  hard-caps `MAX_TOOL_STEPS = 12`. So NIMBL gets **8 model turns per task, period.**

| Task (failing avg) | reads | edits | bash | glob | grep | logged toolSteps (~2× real calls) |
|---|---|---|---|---|---|---|
| `lh-fix-all` | 82.7 | **0** | 3.2 | 3.7 | 0.3 | 88–122 |
| `sh-hidden-green` | 52.9 | 3.1 | 5.7 | 1.7 | 0.3 | 46–84 |
| `mf-quote-margin` | 27 | 2.3 | 2 | 4.3 | 3.3 | 30–46 |
| `mf-fulfill-dispatch` | 18 | **0** | 2 | 6 | 2 | 28 |

Compare solved `sh-hidden-green`: **14.8 reads, 18 edits, 14.4 bash** — the successful runs
iterated: run tests → read output → edit → re-run. The failing runs mostly *read* the source and
tests but never cycled the verify loop.

## 3. Concrete failure behaviors (from raw event streams)

1. **`lh-fix-all` — audit loop until budget death.** One `hybrid` sample fired `glob **/*`,
   then **14 sequential reads** of every hidden test + every unit test + every domain source, then
   another burst of reads of `docs/glossary.md`, `docs/architecture.md`, shipping/orders/support.
   Zero edits. The read-to-edit guard (threshold 12) *should* have injected
   "Investigation budget reached … make the focused edit now" at step 13+ — but it only appends
   an instruction to the *next* model turn (agent.ts:725-734); the model ignored it and kept
   reading different files each turn.
2. **Doom-loop detector is fingerprint-based and useless here.** `doom_loop: deny` fires only on
   an *identical* `(toolName, args)` fingerprint repeated 3× (agent.ts:750). The audit loop
   reads *different files each time*, so the fingerprint never repeats → the detector never
   trips. It correctly caught the one `lh-forced-context-rename`/none failure (same `bash` call
   repeated) but cannot see "lots of *distinct* reads with no edit."
3. **`mf-quote-margin` — analyzed, didn't act.** Runs that failed ended with
   "Now I'll trace the arithmetic…", "the trace shows the pipeline…", "The primary bug is already
   visible" — then the step cap hit. Only 0–4 edits attempted; 0–2 bash runs (never verified).
4. **`sh-hidden-green` — knew the failure list, never fixed it.** "All 15 failures are now
   visible. Let me read the hidden tests and the corresponding source modules" — then read 50+
   files, made 0–11 edits, and hit the cap. opencode solved the same task with 71–79 steps.
5. **No delegation.** Zero failing records used `delegate`. The `delegate` tool description
   actively discourages it ("prefer doing work inline… child work restarts context"). For
   `lh-fix-all`'s "fix 5 bugs top-down", a divide-and-conquer delegation is exactly what's
   needed — but it's never invoked.

## 4. Root causes (ranked)

1. **Step cap too low: 8 turns is not enough for multi-bug/long-horizon work.** opencode used
   72–102 steps on `lh-fix-all`; NIMBL is cut off at 8. No amount of token efficiency fixes
   this. This is the single dominant cause.
2. **Step-cap cut-off is not retried** (`finishReason: "tool-calls"` ≠ thrown error) → a second
   attempt with "you didn't finish, continue" never happens. `maxAttempts` is effectively
   dead for the most common failure mode.
3. **Read-to-edit guard is advisory, not enforced.** Injecting text at `prepareStep` is too weak;
   the model ignores it. A hard stop, or a forced "edit now or answer now" path, is needed.
4. **Doom-loop detector only sees exact repeats.** Distinct-but-equivalent reads (audit loop)
   evade it. A read/glob/grep-ratio heuristic at the step level would catch this class.
5. **No sub-agent usage on long-horizon tasks**, and the delegate tool's own description
   discourages it for exactly the tasks that need it.

## 5. Why this matters for the token claim

NIMBL's "40–44% fewer tokens per solved task" headline only counts *solved* tasks. The unsolved
tasks are precisely the high-token, high-complexity ones opencode burns 115–202k tokens on.
If NIMBL could *solve* them with even 2–3× the current token spend, the efficiency-per-solve
story stays intact **and** the solve-rate gap (89–92% vs 100%) closes. The opportunity is: give
the agent enough steps (and enough retry/planning structure) to finish, while keeping per-turn
context small. That is exactly the "teach with fewer tokens" thesis — the failure is not
context selection, it's agent loop *execution budget*.

## 6. Recommended fixes (see docs/benchmarks/TIER_B_RESEARCH_PAPERS.md for the literature behind each)

1. **Raise/scale the step budget.** Make `maxToolSteps` task-aware (easy/medium/hard) and raise
   the hard cap (`MAX_TOOL_STEPS = 12` is the floor the benchmark also lowers). opencode's 72–102
   steps on `lh-fix-all` is the evidence.
2. **Retry on step-cap cut-off.** Treat `finishReason: "tool-calls"` at the cap as a
   "continue/attempt +1" signal instead of a normal stop, appending "You ran out of steps with an
   edit still pending. Finish the fix now."
3. **Enforce the read-to-edit budget, don't just suggest it.** Either hard-stop after N
   read-only calls (return "no more reads until an edit/answer"), or switch the agent into
   "must act" mode.
4. **Add a step-level "audit ratio" guard** (e.g., reads since edit > 8 and edits == 0 → force a
   plan/act decision), complementing the identical-fingerprint doom-loop detector.
5. **Encourage (not discourage) delegation for genuinely separable work** (`lh-fix-all` is 5
   independent bugs; `sh-hidden-green` is per-module). Fix the delegate tool description and give
   child sessions enough steps (currently also `maxToolSteps: 8`).

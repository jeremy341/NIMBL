# NIMBL Research Papers — Token Optimizations & Agent Improvements

**Purpose:** catalog of research papers that (a) validate NIMBL's existing architecture and (b)
offer concrete, implementable improvements. Each paper is mapped to the NIMBL module it most
directly informs. This mirrors how the current backend (hybrid retrieval, graph expansion,
prompt caching, request budgeting, Socratic teaching) was modeled after prior research.

**Companion doc:** `docs/FAILURE_ANALYSIS_LH_MF_SH.md` explains *why* NIMBL fails on
long-horizon/multi-file/shell-loop tasks; the highest-impact papers here (Tier 1) are the fixes.

---

## Tier 1 — directly fixes the lh/mf/sh failures (agent loop budget)

### 1. ReAct: Synergizing Reasoning and Acting in Language Models
- **arXiv:** [2210.03629](https://arxiv.org/abs/2210.03629) — Yao et al. (ICLR 2023)
- **Idea:** interleave reasoning traces and tool actions; reasoning updates the plan, actions
  gather evidence. NIMBL's loop is already ReAct-style.
- **Gap NIMBL has:** the plan is not *persisted between steps* — each `prepareStep` re-derives
  intent from the raw history. ReAct's explicit "thought → action → observation" trace is the
  structure NIMBL's compaction should keep (it currently discards raw turns into a summary,
  losing the plan).
- **Apply to:** `agent.ts` loop + `token-compression.ts` (keep plan traces, drop low-value
  tool output), `tasks.ts` todo persistence.

### 2. Plan-and-Act: Improving Planning of Agents for Long-Horizon Tasks
- **arXiv:** [2503.09572](https://arxiv.org/abs/2503.09572) — Erdogan et al. (ICML 2025)
- **Idea:** separate a **Planner** (produces a structured high-level plan) from an **Executor**
  (turns the plan into actions). Decoupling planning from execution is what makes long-horizon
  tasks tractable.
- **Gap NIMBL has:** `lh-fix-all` failure is "audit forever, never act." A Planner-first mode
  would make NIMBL emit a checklist (which modules to fix, in what order) *before* reading more
  files, then execute it. The `plan` agent mode exists but is never *switched into* mid-task.
- **Apply to:** new `AgentMode` or auto-escalation: detect multi-file/long-horizon intent →
  run a `plan` pass → hand the plan to `build` as a todo list.

### 3. Reflexion: Language Agents with Verbal Reinforcement Learning
- **arXiv:** [2303.11366](https://arxiv.org/abs/2303.11366) — Shinn et al. (NeurIPS 2023)
- **Idea:** after a failed episode, the agent writes a **verbal reflection** into an episodic
  memory buffer that guides the next attempt — no weight updates.
- **Gap NIMBL has:** the step-cap cut-off is not retried at all (`finishReason: "tool-calls"`
  is not treated as an error, agent.ts:699-739). Reflexion's pattern: on failure, summarize
  "what did I try, why did it stall, what should I do next" and run attempt +1 with that text in
  context. This turns NIMBL's dead attempts into learning iterations.
- **Apply to:** `agent.ts` retry loop (re-arm on step-cap finish with a reflection prompt),
  `sessions.ts` (store reflections), `learning.ts` (concept encounters).

### 4. Agentless: Demystifying LLM-based Software Engineering Agents
- **arXiv:** [2407.01489](https://arxiv.org/abs/2407.01489) — Xia et al.
- **Idea:** a **localization → repair → validation** three-phase pipeline, *without* an
  open-ended agent loop, outperforms complex agents on SWE-bench Lite at 1/10th the cost.
- **Gap NIMBL has:** the exact inverse of NIMBL's problem. NIMBL lets the agent wander (52–83
  reads, 0 edits on `lh-fix-all`); Agentless forces a strict phase order. NIMBL's
  `structural-context.ts` + `dependency-graph.ts` are already localization machinery — a
  "localize-then-fix-then-verify" execution mode would use them directly.
- **Apply to:** `agent.ts` (phase-gated loop for bug-fix/multi-file tasks), `structural-context`
  (localization output as the fix prompt).

### 5. Don't Break the Cache: An Evaluation of Prompt Caching for Long-Horizon Agentic Tasks
- **arXiv:** [2601.06007](https://arxiv.org/abs/2601.06007) — Lumer et al.
- **Idea:** caching *system-prompt-only* (or excluding dynamic tool results) beats naive
  full-context caching; dynamic content belongs at the end of the prompt; caching cuts agent
  costs 41–80% and TTFT 13–31%.
- **Gap NIMBL has:** `prompt-cache.ts` already orders stable prefix + dynamic retrieval text —
  but every tool step grows history, and the model must be re-sent each step. Long-horizon tasks
  accumulate many steps; only the *system + plan* part should stay cached, with tool results
  excluded (exactly the paper's recommendation).
- **Apply to:** `prompt-cache.ts` (cache block boundaries), `request-budget.ts` (what counts as
  stable vs dynamic).

---

## Tier 2 — token efficiency the whole pipeline (defends the −40% claim)

### 6. Characterizing Prompt Compression Methods for Long Context Inference
- **arXiv:** [2407.08892](https://arxiv.org/abs/2407.08892) — Jha et al. (ICML 2024 Es-FoMo)
- **Idea:** **extractive compression outperforms token-pruning and summarization** for most
  tasks, reaching ~10× compression with minimal degradation.
- **Gap NIMBL has:** `structural-context.ts` uses parser-backed *declaration chunks* (a strong
  extractive approach) — this validates it. But `token-compression.ts` still ships full excerpts
  in some paths; extractive-first is the evidence-backed default.
- **Apply to:** `structural-context.ts`, `token-compression.ts` (default mode), benchmark
  ablation (`benchmarks/run.ts`).

### 7. LLMLingua-2 / TACO-RL / CPC / ICPC / DAC / PIS — prompt compression families
- **arXiv:** [2403.12968](https://arxiv.org/abs/2403.12968) (LLMLingua-2, token-classification
  compressor), [2409.13035](https://arxiv.org/abs/2409.13035) (TACO-RL, task-aware RL),
  [2409.01227](https://arxiv.org/abs/2409.01227) (CPC, context-aware sentence encoder, ~11×
  faster than token-level), [2501.01625](https://arxiv.org/abs/2501.01625) (ICPC, information
  theory), [2507.11942](https://arxiv.org/abs/2507.11942) (DAC, entropy+attention),
  [2504.16574](https://arxiv.org/abs/2504.16574) (PIS, attention-based importance sampling)
- **Idea:** compress prompts by removing low-information tokens/sentences while preserving
  task-relevant content; the frontier is **query-aware, sentence-level** compression.
- **Gap NIMBL has:** NIMBL compresses by *selection* (retrieval) and *structure* (declarations),
  not by *sentence-level token pruning*. A lightweight sentence-importance filter over retrieved
  excerpts (query-aware, no extra LLM) could shrink retrieval context further without quality
  loss — directly extending the `retrieval` win (currently −66% vs opencode).
- **Apply to:** `structural-context.ts` + `context.ts` (post-selection excerpt pruning),
  `request-budget.ts`.

### 8. ContextSniper: Token-Efficient Code Memory for Repository-Level Program Repair
- **arXiv:** [2607.01916](https://arxiv.org/abs/2607.01916) — Luk et al.
- **Idea:** index code as 3 abstract levels, retrieve with a hybrid ranker, **filter long tool
  output through an intention-aware gate**, return compact evidence packets; full source on
  demand. −51.5% tokens on SWE-bench Lite with unchanged resolution.
- **Gap NIMBL has:** NIMBL's `read` tool returns whole files (up to 48 KB); tool output then
  re-enters the model on the next step. Gating tool output (only the relevant slice) is exactly
  what this paper does and directly attacks the "82 reads × full file" audit loop.
- **Apply to:** `agent.ts` read tool + `token-compression.ts` (output gating), `context.ts`
  (hierarchical code memory).

### 9. Remember, Don't Re-read: Stateful ReAct Agents for Token-Efficient Experimentation
- **arXiv:** [2606.14945](https://arxiv.org/abs/2606.14945) — Jabbarvaziri
- **Idea:** stateless agents re-read full history each iteration → O(n²) total tokens. A
  stateful agent with a typed persistent state → O(1) per turn, −52–90% tokens.
- **Gap NIMBL has:** NIMBL already compacts history (`sessions.ts` compaction) but the failing
  runs show the agent re-reading the *same files* across steps (distinct calls, so the doom-loop
  detector misses it). A step-level "already-read" cache that returns a hash/stub for unchanged
  files directly implements "don't re-read."
- **Apply to:** `agent.ts` read tool (read cache), `context.ts` (per-session file cache).

### 10. GenericAgent / TokenPilot / vCache — context density, cache continuity
- **arXiv:** [2604.17091](https://arxiv.org/abs/2604.17091) (GenericAgent: *context information
  density maximization*, self-evolving SOPs), [2606.17016](https://arxiv.org/abs/2606.17016)
  (TokenPilot: ingestion-aware compaction + lifecycle-aware eviction, −61–87% cost, cache-safe),
  [2502.03771](https://arxiv.org/abs/2502.03771) (vCache: verified semantic caching with
  per-entry thresholds)
- **Idea:** long-horizon performance is bounded by *decision-relevant info per token*, not
  context length. Keep prompts dense, keep cache prefixes stable, evict only when relevance
  expires.
- **Gap NIMBL has:** compaction exists but is not **cache-prefix-aware** (compacting mid-session
  invalidates the cache prefix — the exact trap TokenPilot studies). Making compaction
  cache-contiguous (fold into the stable system prefix) preserves both goals.
- **Apply to:** `sessions.ts` (compaction policy), `prompt-cache.ts` (prefix continuity),
  `learning.ts` (SOP evolution → concept store).

---

## Tier 3 — tool-layer efficiency (the "audit loop" + delegation)

### 11. TSCG / Tool Forge — token-efficient tool schemas & routing
- **arXiv:** [2605.04107](https://arxiv.org/abs/2605.04107) (TSCG: compile JSON schemas to
  compact structured text, ≥51% schema-token reduction, restores small models from 0→84%
  accuracy), [2605.28000](https://arxiv.org/abs/2605.28000) (Tool Forge: expose only
  intent-scoped tool sessions, −99.2% tool context)
- **Gap NIMBL has:** `agent.ts` ships every tool's full JSON schema every step
  (`toolSchemas` in `fitRequestToBudget`). TSCG's structured-text schemas would cut that fixed
  per-step overhead; Tool Forge's intent-scoped tool subset would cut it further for single-
  purpose tasks.
- **Apply to:** `request-budget.ts` (toolSchema serialization), `agent.ts` (MODE_TOOLS already
  scopes by mode — extend per-intent).

### 12. ToolGate — pre-call control (execute vs skip tool calls)
- **arXiv:** [2606.03054](https://arxiv.org/abs/2606.03054) — Liu et al.
- **Idea:** a lightweight controller predicts whether a proposed tool call should run or be
  skipped; −31–36% token cost with accuracy preserved.
- **Gap NIMBL has:** the read-guard (`countReadsSinceEdit`) is the closest analog but it's
  advisory. ToolGate's classifier is the *enforced* version: after N read-only calls with no
  edit, block further reads (return a directive instead of file content).
- **Apply to:** `agent.ts` `prepareStep` (make the read-guard a hard gate), read/glob/grep tools.

### 13. CodeAgents — codified multi-agent reasoning
- **arXiv:** [2507.03254](https://arxiv.org/abs/2507.03254) — Yang et al.
- **Idea:** represent agent interaction (Task/Plan/Feedback/roles/tools) as modular pseudocode
  with loops and typed variables → −55–87% input / −41–70% output tokens, +3–36 accuracy.
- **Gap NIMBL has:** delegation is *narrative* (free-text prompts to a child session). Codifying
  the delegation contract (typed subtask, expected output shape, verify criteria) makes child
  sessions cheaper and more reliable — and the `delegate` tool's own description currently
  *discourages* delegation, while `lh-fix-all` (5 independent bugs) is the canonical delegation
  case.
- **Apply to:** `delegate` tool + `agent-benchmark.ts` child sessions (maxToolSteps: 8 → scale by
  subtask), `tasks.ts` (typed delegation contract).

---

## Tier 4 — what the model does with the context (validates + informs NIMBL's story)

### 14. Lost in the Middle
- **arXiv:** [2307.03172](https://arxiv.org/abs/2307.03172) — Liu et al. (TACL 2023); follow-ups
  [2406.16008](https://arxiv.org/abs/2406.16008) (Found in the Middle: calibrate positional
  attention bias, +15pp RAG),
  [2412.10079](https://arxiv.org/abs/2412.10079) (multi-hop "lost in between"),
  [2510.10276](https://arxiv.org/abs/2510.10276) (retrieval-demands account)
- **Idea:** models under-use the middle of long contexts; relevant info at the edges wins. This
  is *why* NIMBL's small, high-density context beats opencode's huge dumps on `ret-*` tasks.
- **Apply to:** `context.ts` ordering (put the single most relevant item first/last — NIMBL
  already reverses retrieval low→high; the paper explains why that helps), `request-budget.ts`
  (keep context short to stay out of the "lost middle" regime).

### 15. LongFuncEval — long-context tool calling
- **arXiv:** [2505.10570](https://arxiv.org/abs/2505.10570) — Kate et al.
- **Idea:** tool-calling accuracy drops 7–91% as tool-catalog size, tool-response length, and
  conversation length grow — even in "long-context" models.
- **Gap NIMBL has:** direct evidence that long agent sessions with big tool outputs (the exact
  lh/mf/sh regime) degrade model performance — supporting both output gating (ContextSniper) and
  step-scoped tools (Tool Forge) as high-value fixes.

---

## Tier 5 — the teaching/learning differentiator (NIMBL's thesis)

### 16. Socratic tutor papers — the pedagogical core
- **arXiv:** [2403.00199](https://arxiv.org/abs/2403.00199) (Socratic question generation via
  data augmentation + DPO — small 7B model beats prompting baselines),
  [2409.05511](https://arxiv.org/abs/2409.05511) (Socratic chatbot promotes critical thinking vs
  direct-answer chatbots),
  [2605.29582](https://arxiv.org/abs/2605.29582) (PEARL: pedagogically-aligned RL for Socratic
  tutors),
  [2607.22996](https://arxiv.org/abs/2607.22996) (HeuristicEdu: RL to stop "keyword leakage" —
  tutors revealing answers; SE 30→63%, leakage 30→13%),
  [2509.12107](https://arxiv.org/abs/2509.12107) (TeaPT: Socratic vs Narrative; Socratic drives
  engagement)
- **Idea:** the *directness/leakage* of a teaching LLM is a learnable, measurable property, and
  small models can be trained to be good Socratic tutors.
- **Gap NIMBL has:** `learn` mode + `teachingPrompt()` exist but are prompt-based. The papers
  show leakage control (don't reveal the answer) is the key quality lever, measurable via
  keyword-leakage metrics — NIMBL can adopt that metric for its learn mode without retraining.
- **Apply to:** `agent.ts` teachingPrompt, `learning.ts` (leakage-aware question generation),
  tests.

### 17. MemCoder — code agents that co-evolve with project history
- **arXiv:** [2603.13258](https://arxiv.org/abs/2603.13258) — Deng et al.
- **Idea:** distill intent→code mappings from past commits into long-term memory; self-refine
  from verification feedback; +9.4pp on SWE-bench Verified over the base model.
- **Gap NIMBL has:** NIMBL's `learning.ts` records *concept encounters*, not *working patches*.
  Persisting "this bug pattern → this fix" as reusable knowledge (project-local, like skills) is
  a natural extension that also powers the learning story.
- **Apply to:** `learning.ts`, `skills.ts` (auto-generated project skills from verified fixes),
  `sessions.ts`.

---

## Action priority (what to implement first)

| Priority | Fix | Paper(s) | Module |
|---|---|---|---|
| 1 | Scale step budget per difficulty; treat step-cap as retryable with reflection | 2, 3 | `agent.ts`, `agent-benchmark.ts` |
| 2 | Enforce read-to-edit (hard gate, not advisory) | 3, 12 | `agent.ts` `prepareStep` |
| 3 | Localize→fix→verify phase mode for multi-file tasks | 4, 2 | `agent.ts`, `structural-context.ts` |
| 4 | Cache-only stable prefix; exclude tool results from cache block | 5 | `prompt-cache.ts`, `request-budget.ts` |
| 5 | Read-cache / don't re-read same file | 9 | `agent.ts` read tool |
| 6 | Tool-output gating (intention-aware slice, not whole file) | 8 | `agent.ts`, `token-compression.ts` |
| 7 | Enable & codify delegation for separable subtasks | 13 | `delegate` tool, `tasks.ts` |
| 8 | Sentence-level excerpt pruning (query-aware extractive) | 6, 7 | `structural-context.ts` |
| 9 | Cache-prefix-aware compaction | 10 | `sessions.ts`, `prompt-cache.ts` |
| 10 | Compressed tool schemas | 11 | `request-budget.ts` |

## References (all verified live on arXiv, 2026-08-15)

1. ReAct — arxiv.org/abs/2210.03629
2. Plan-and-Act — arxiv.org/abs/2503.09572
3. Reflexion — arxiv.org/abs/2303.11366
4. Agentless — arxiv.org/abs/2407.01489
5. Don't Break the Cache — arxiv.org/abs/2601.06007
6. Characterizing Prompt Compression — arxiv.org/abs/2407.08892
7. LLMLingua-2 — arxiv.org/abs/2403.12968 · TACO-RL — arxiv.org/abs/2409.13035 ·
   CPC — arxiv.org/abs/2409.01227 · ICPC — arxiv.org/abs/2501.01625 · DAC — arxiv.org/abs/2507.11942 ·
   PIS — arxiv.org/abs/2504.16574
8. ContextSniper — arxiv.org/abs/2607.01916
9. Remember, Don't Re-read — arxiv.org/abs/2606.14945
10. GenericAgent — arxiv.org/abs/2604.17091 · TokenPilot — arxiv.org/abs/2606.17016 ·
    vCache — arxiv.org/abs/2502.03771
11. TSCG — arxiv.org/abs/2605.04107 · Tool Forge — arxiv.org/abs/2605.28000
12. ToolGate — arxiv.org/abs/2606.03054
13. CodeAgents — arxiv.org/abs/2507.03254
14. Lost in the Middle — arxiv.org/abs/2307.03172 · Found in the Middle — arxiv.org/abs/2406.16008 ·
    Multi-hop — arxiv.org/abs/2412.10079 · Retrieval-demands — arxiv.org/abs/2510.10276
15. LongFuncEval — arxiv.org/abs/2505.10570
16. Socratic: DPO — arxiv.org/abs/2403.00199 · Critical thinking — arxiv.org/abs/2409.05511 ·
    PEARL — arxiv.org/abs/2605.29582 · HeuristicEdu — arxiv.org/abs/2607.22996 ·
    TeaPT — arxiv.org/abs/2509.12107
17. MemCoder — arxiv.org/abs/2603.13258

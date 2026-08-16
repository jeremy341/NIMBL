# Phase 5 Research: Public Coding-Agent Harnesses

**Status:** research only; no implementation changes

**Goal:** compare the engineering patterns and publicly reported evidence behind major coding-agent harnesses, then identify what NIMBL should borrow without losing its low-token, teaching-first identity.

## Evidence Rules

- **Measured:** reported by a benchmark, paper, or reproducible artifact. The number belongs to the complete model + harness + prompt + environment configuration, not to the harness alone.
- **Documented:** a feature described in public source code or documentation.
- **Inferred:** an engineering interpretation, not a benchmark result.
- Public scores are not directly comparable unless model, task set, hints, sampling, endpoint, rate limits, verifier, and cost accounting match.
- A missing public score is not evidence that a harness is weak.

## Comparison Table

Ratings are NIMBL research judgments on a 1-5 scale: **TE** token efficiency, **SP** speed, **IN** coding intelligence, and **FIT** fit for NIMBL. They are not measured scores.

| Harness | Backend pattern | Public evidence | TE | SP | IN | FIT |
|---|---|---|---:|---:|---:|---:|
| **OpenCode** | Tool loop with shell, read/search, edit, patch, LSP, MCP, subagents, permissions, compaction, session history, bounded tool output, and provider-specific context behavior. | Public architecture and documentation, but no comparable public coding benchmark found for the reviewed configuration. | 5 | 4 | 5 | 5 |
| **Aider** | Repository map using symbols/dependency ranking, diff/search-replace editing, lint/test loop, architect/editor separation, and prompt caching. | Aider edit leaderboard reports 84.2% on 133 Exercism tasks for both cited o1 and Claude 3.5 Sonnet configurations. This is setup-specific. | 5 | 4 | 4 | 5 |
| **OpenHands** | Event-stream state, CodeAct shell/Python/browser actions, Docker sandbox, skills, delegation, and iterative environment feedback. | OpenHands paper reports 26.0% SWE-bench Lite with Claude 3.5 Sonnet at approximately $1.10 average cost, plus 79.3% HumanEvalFix Python in its setup. | 3 | 3 | 4 | 4 |
| **SWE-agent** | Purpose-built agent-computer interface: bounded file viewer, search, line edits, linting, concise observations, history processor, malformed-call correction, and cost/step limits. | Paper reports 18.0% SWE-bench Lite with GPT-4 Turbo and 87.7% HumanEvalFix; removing linting or using full history reduced its reported Lite score to 15.0%. | 4 | 4 | 4 | 5 |
| **mini-SWE-agent** | Minimal Bash-first loop, linear history, subprocess execution, configurable environments, and trajectory logging. | Project README claims above 74% SWE-bench Verified; the exact official leaderboard/configuration must be checked before using it as a formal comparison. | 4 | 5 | 4 | 4 |
| **Claude Code** | Small tool surface with Bash and string replacement, layered project instructions, memory, compaction, subagents, hooks, fallback models, and exact-prefix prompt caching. | Anthropic reported 49% SWE-bench Verified for Claude 3.5 Sonnet using a two-tool scaffold. Current product scores are not standardized in the cited documentation. | 4 | 4 | 5 | 5 |
| **Gemini CLI** | File/shell/web/MCP tools, hierarchical instructions, resume/fork/rewind, shadow-Git checkpoints, token caching, health-aware fallback routing, skills, and reviewable memory. | Public behavioral/integration/performance evaluation infrastructure; no directly comparable public SWE-bench score found in reviewed materials. | 4 | 4 | 4 | 4 |
| **Cursor** | Semantic search, grep, Explore subagents, checkpoints, long-running plans, checking agents, and model routing based on complexity and production feedback. | Company reports on SQLite experiments and routing economics; these are proprietary experiments, not SWE-bench comparisons. | 4 | 4 | 5 | 4 |
| **Devin** | Sandboxed shell/editor/browser, long-horizon planning, context recall, learning, and collaboration. Detailed harness internals are limited publicly. | Cognition reported 13.86% on a random SWE-bench subset under a non-equivalent comparison setup. | 2 | 2 | 3 | 2 |
| **Agentless** | Deterministic localization -> repair -> patch validation pipeline rather than an unconstrained tool loop. | Paper reports 32.0% SWE-bench Lite and approximately $0.70 in its configuration. | 5 | 5 | 4 | 5 |
| **AutoGen-style teams** | Stateful multi-agent conversations, handoffs, tools, termination conditions, timeouts, and token limits. | Framework documentation demonstrates orchestration and termination, but not a comparable coding score. | 2 | 2 | 3 | 3 |

## Harness Findings

### 1. Context discipline is an intelligence feature

SWE-agent's ablations, Aider's repository map, Claude Code's lazy context and OpenCode's bounded compaction all point to the same conclusion: a longer context is not automatically more intelligent. Relevant evidence must be selected, ordered, preserved, and made available again when needed.

**NIMBL implication:** preserve the existing lexical, structural, graph, and hybrid retrieval stack, but prioritize an evidence ledger and intent-aware output gating over larger dumps.

### 2. Verification is the main recovery mechanism

Aider, SWE-agent, OpenHands, Claude Code, and Agentless all make compiler, test, or patch validation central. The best systems do not merely ask the model to be careful; they turn external execution feedback into the next state transition.

**NIMBL implication:** move from general tool-loop guidance toward explicit `localize -> edit -> targeted verify -> repair -> final verify` phases for difficult tasks.

### 3. Small interfaces can beat broad tool catalogs

SWE-agent and Claude Code demonstrate that strong tool affordances can be more valuable than many tools. Large schemas and long tool results reduce tool-call reliability and re-bill context.

**NIMBL implication:** keep the rich backend, but expose a small phase-specific tool set to the model. Retrieval and delegation remain available as escalations rather than default schema weight.

### 4. Autonomy is not the same as quality

Agentless is important because a fixed localization/repair/validation pipeline can outperform more autonomous agents on bounded repair tasks. OpenHands and Devin demonstrate the value of broad environments, but broad environments also add cost, latency, and failure surface.

**NIMBL implication:** add a constrained repair mode before adding more autonomy. Use free-form ReAct only when the task is genuinely exploratory.

### 5. Routing and role separation are economic levers

Cursor publicly describes complexity-aware routing; FrugalGPT and RouteLLM provide research support for model cascades. Cheap models are plausible for classification, retrieval reranking, compaction, and teaching checks, while the strongest model is reserved for ambiguous edits and repeated failures.

**NIMBL implication:** route by task difficulty and verification confidence, not by a static provider preference.

## What NIMBL Already Does Well

- Integrated lexical, structural, dependency-graph, local embedding, hybrid retrieval, MMR, and retrieval telemetry.
- Request budgets that account for system prompts, schemas, history, summaries, attachments, instructions, and retrieval.
- Provider prompt-cache metadata and stable-prefix ordering.
- Explicit task-family budgets, continuation handling, bounded shell output, test summarization, and test memoization.
- Session CAS storage, checkpoints, permissions, protected-file handling, and external-directory approval.
- Teaching modes, concept encounters, leakage checks, and learning state rather than a pure code-generation loop.
- A frozen benchmark corpus, retrieval ablations, raw event traces, verifiers, and cross-harness comparison scripts.

## What Common Harnesses Do Better

- **OpenCode:** mature append-only compaction, subagent isolation, provider integration, and production-grade session behavior.
- **Aider:** highly compact repository maps and practical diff-oriented editing.
- **SWE-agent:** disciplined bounded viewers, concise observations, and benchmark-tested agent-computer interfaces.
- **Claude Code:** layered memory, lazy context loading, subagents, checkpoints, rewind, and cache-aware prompt layout.
- **OpenHands:** event-sourced execution and broad environment/skill composition.
- **Agentless:** explicit phase control and low-cost deterministic repair.
- **Cursor:** production-informed model routing and long-running task orchestration.

## Recommended Borrowing Order

1. Borrow Agentless' phase gates for multi-file and long-horizon repair.
2. Borrow SWE-agent's bounded viewer and concise diagnostic format.
3. Borrow OpenCode/Claude Code append-only compaction and checkpoint semantics.
4. Borrow Aider's compact repository map and diff-first edits.
5. Borrow Cursor/FrugalGPT-style difficulty-aware routing.
6. Borrow OpenHands' event-sourced trace model only where NIMBL's existing session model needs it.

## Sources

- [OpenCode agents](https://opencode.ai/docs/agents/)
- [OpenCode context runtime](https://github.com/anomalyco/opencode/blob/dev/CONTEXT.md)
- [Aider repository map](https://aider.chat/docs/repomap.html)
- [Aider caching](https://aider.chat/docs/usage/caching.html)
- [Aider edit leaderboard](https://aider.chat/docs/leaderboards/edit.html)
- [OpenHands paper](https://arxiv.org/abs/2407.16741)
- [OpenHands architecture](https://github.com/OpenHands/OpenHands/blob/main/docs/architecture.md)
- [SWE-agent paper](https://arxiv.org/html/2405.15793v3)
- [mini-SWE-agent](https://github.com/SWE-agent/mini-swe-agent)
- [SWE-bench Verified](https://www.swebench.com/verified.html)
- [Anthropic SWE-bench scaffold](https://www.anthropic.com/research/swe-bench-sonnet)
- [Gemini CLI](https://github.com/google-gemini/gemini-cli)
- [Gemini model routing](https://geminicli.com/docs/cli/model-routing/)
- [Cursor long-running agents](https://cursor.com/blog/long-running-agents)
- [Cursor Router](https://cursor.com/blog/how-cursor-router-works)
- [Agentless](https://arxiv.org/abs/2407.01489)
- [AutoGen termination](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/termination.html)

## Bottom Line

NIMBL does not need to become a larger autonomous framework. The highest-value pattern across public harnesses is **small, high-quality evidence plus explicit verification and bounded recovery**. NIMBL's differentiator should remain retrieval-driven, low-cost learning assistance; the next capability jump should come from execution control, not from indiscriminately adding tools or context.

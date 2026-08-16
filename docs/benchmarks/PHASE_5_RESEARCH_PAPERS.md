# Phase 5 Research: Papers and Technical Reports

**Status:** research survey; no implementation changes

**Scope:** a curated set of high-relevance papers and technical reports from classic agent work through current coding-agent research. This is not a claim to enumerate every paper in the literature. The selection prioritizes mechanisms NIMBL could test in its own repository benchmark.

## Rating Scale

Ratings are expected impact for NIMBL, not published paper scores:

- **TE:** token/cost efficiency
- **SP:** speed/latency
- **IN:** coding intelligence or solve quality
- **FIT:** fit with the existing NIMBL backend

`5` means high expected value; it does not mean the idea is already validated in NIMBL.

## Retrieval and Code Context

| Paper | Evidence and mechanism | Advantages | Drawbacks | TE | SP | IN | FIT |
|---|---|---|---|---:|---:|---:|---:|
| [RAG](https://arxiv.org/abs/2005.11401) (2020) | Foundational retriever + generator architecture; improved grounding on knowledge tasks. | External, updateable evidence and provenance. | Retriever errors propagate; not code-specific. | 4 | 3 | 4 | 5 |
| [CodeSearchNet](https://arxiv.org/abs/1909.09436) (2019/2020) | Code-search corpus and expert relevance annotations across six languages. | Gives NIMBL a retrieval evaluation model: precision, recall, MRR. | Function-level search does not fully model repository repair. | 3 | 3 | 4 | 5 |
| [GraphCodeBERT](https://arxiv.org/abs/2009.08366) (2020) | Data-flow-aware code representation and graph-guided attention. | Supports symbol/data-flow retrieval without sending more source. | Requires parser/model infrastructure; representation gains may not transfer directly. | 4 | 3 | 4 | 5 |
| [RepoCoder](https://arxiv.org/abs/2303.12570) (2023) | Iterative retrieval and generation; reported more than 10% improvement over a baseline in reported completion settings. | Directly supports a second retrieval pass after initial evidence. | Extra calls and mostly completion-focused evaluation. | 3 | 2 | 5 | 5 |
| [Lost in the Middle](https://arxiv.org/abs/2307.03172) (2023) | Relevant facts in the middle of long contexts are often used less effectively. | Strong justification for bounded, ordered evidence packets. | Non-code tasks and model behavior changes over time. | 5 | 4 | 5 | 5 |
| [GraphRAG](https://arxiv.org/abs/2404.16130) (2024) | Entity/community graph summaries improve global questions over large corpora. | Useful for repository architecture and cross-module overviews. | Expensive/stale summaries; overkill for local bug fixes. | 2 | 2 | 4 | 3 |

## Compression, Memory, and Context Lifecycle

| Paper | Evidence and mechanism | Advantages | Drawbacks | TE | SP | IN | FIT |
|---|---|---|---|---:|---:|---:|---:|
| [LLMLingua](https://arxiv.org/abs/2310.05736) (2023) | Reported up to 20x prompt compression with limited loss on tested tasks. | Direct cost reduction for old turns and tool output. | Compression can delete code-critical syntax; compression itself costs compute. | 5 | 3 | 4 | 4 |
| [LongLLMLingua](https://arxiv.org/abs/2310.06839) (2023/2024) | Query-aware compression; reported fewer tokens with improved long-context performance in tested settings. | Combines compression with position-bias mitigation. | Results are model/task-dependent and need code validation. | 5 | 4 | 5 | 5 |
| [Characterizing Prompt Compression](https://arxiv.org/abs/2407.08892) (2024) | Extractive compression often beats aggressive token pruning and summarization in tested settings. | Validates NIMBL's structural/extractive approach. | Compression tradeoffs differ by task and model. | 5 | 4 | 4 | 5 |
| [ReadAgent](https://arxiv.org/abs/2402.09727) (2024) | Episodic reading plus gist memory and lookup into original text; reported 3.5-20x effective context extension on document tasks. | Recoverable memory rather than irreversible deletion. | Extra memory/lookup calls; document-centric evidence. | 4 | 3 | 5 | 4 |
| [MemGPT](https://arxiv.org/abs/2310.08560) (2023) | Working context plus archival memory and paging operations. | Clear long-session memory abstraction. | Model-directed paging can be expensive and unpredictable. | 4 | 3 | 4 | 4 |
| [Generative Agents](https://arxiv.org/abs/2304.03442) (2023) | Memory stream, retrieval, reflection, and planning; reflection improved simulated behavior. | Useful for NIMBL learning/concept memory. | Subjective, non-code evaluation; reflection can be wrong. | 3 | 2 | 4 | 3 |
| [Infini-attention](https://arxiv.org/abs/2404.07143) (2024) | Model-architecture approach to bounded-memory long context. | Promising for future local serving. | Requires model retraining or architecture support. | 3 | 3 | 3 | 2 |

## Tool Use and Coding-Agent Interfaces

| Paper | Evidence and mechanism | Advantages | Drawbacks | TE | SP | IN | FIT |
|---|---|---|---|---:|---:|---:|---:|
| [ReAct](https://arxiv.org/abs/2210.03629) (2022/2023) | Interleaves reasoning, action, and observation; reported gains on ALFWorld and WebShop. | Natural model for file search, edits, and tests. | Verbose action loops and tool-call drift. | 3 | 3 | 5 | 5 |
| [Toolformer](https://arxiv.org/abs/2302.04761) (2023) | Self-supervised learning of when/how to call APIs. | Principled tool-selection concept. | Requires training traces/fine-tuning; not immediately usable with arbitrary providers. | 3 | 3 | 4 | 3 |
| [API-Bank](https://arxiv.org/abs/2304.08244) (2023) | Tool planning/argument/execution benchmark with 73 runnable tools. | Supports separate tool-use metrics and failure taxonomy. | Generic APIs differ from repository operations. | 3 | 3 | 4 | 4 |
| [SWE-agent](https://arxiv.org/abs/2405.15793) (2024) | Agent-computer interface with bounded viewers, edits, linting, concise observations, and history processing. | Directly relevant to NIMBL's tool contract. | Results depend heavily on model and harness details. | 5 | 4 | 5 | 5 |
| [AgentBench](https://arxiv.org/abs/2308.03688) (2023/2024) | Multi-environment agent benchmark and failure analysis. | Encourages trajectory/tool adherence metrics, not only final text. | Broad environments are not repository-specific. | 3 | 2 | 4 | 4 |
| [LongFuncEval](https://arxiv.org/abs/2505.10570) (2025) | Reports tool-call accuracy degradation as tool catalog, response length, and conversation length grow. | Direct evidence for scoped tools and bounded outputs. | Newer evaluation needs replication. | 5 | 4 | 5 | 5 |

## Software Engineering Pipelines

| Paper | Evidence and mechanism | Advantages | Drawbacks | TE | SP | IN | FIT |
|---|---|---|---|---:|---:|---:|---:|
| [SWE-bench](https://arxiv.org/abs/2310.06770) (2023/2024) | 2,294 real GitHub issue-resolution tasks with test-based patch validation. | The canonical repository-level evaluation target. | Tests can be incomplete/flaky; versions and contamination matter. | 2 | 2 | 5 | 5 |
| [Agentless](https://arxiv.org/abs/2407.01489) (2024) | Localization -> repair -> validation without open-ended autonomous exploration; reported 32% SWE-bench Lite at about $0.70. | Cheap, interpretable, and directly aligned with NIMBL retrieval. | Less flexible for open-ended exploration. | 5 | 5 | 5 | 5 |
| [OpenHands](https://arxiv.org/abs/2407.16741) (2024) | CodeAct actions in a sandbox with iterative feedback; reported setup-specific SWE-bench and HumanEvalFix results. | Broad environment and skill composition. | Runtime/sandbox overhead and broad failure surface. | 3 | 3 | 4 | 4 |
| [MemCoder](https://arxiv.org/abs/2603.13258) (2026) | Distills verified intent-to-code mappings into project memory; existing NIMBL notes report a 9.4 percentage-point SWE-bench improvement. | Natural extension of project skills and learning state. | New result; requires careful staleness and provenance controls. | 4 | 3 | 5 | 4 |

## Reflection, Planning, and Test-Time Compute

| Paper | Evidence and mechanism | Advantages | Drawbacks | TE | SP | IN | FIT |
|---|---|---|---|---:|---:|---:|---:|
| [Self-Consistency](https://arxiv.org/abs/2203.11171) (2022/2023) | Samples multiple reasoning paths and selects a consistent answer; reported gains on several reasoning benchmarks. | Simple best-of-N baseline when a verifier exists. | Extra calls; correlated errors; not inherently patch-aware. | 2 | 1 | 4 | 3 |
| [Tree of Thoughts](https://arxiv.org/abs/2305.10601) (2023) | Branch, evaluate, and backtrack; Game of 24 result improved from 4% to 74% in the paper's setup. | Useful for difficult planning/debugging escalations. | Branching cost and unreliable self-evaluation. | 1 | 1 | 5 | 3 |
| [Self-Refine](https://arxiv.org/abs/2303.17651) (2023) | Generate -> critique -> revise; reported approximately 20-point average improvement across seven tasks. | Easy to apply to explanations and patches. | Extra turns; self-critique can repeat mistakes. | 2 | 2 | 4 | 4 |
| [Reflexion](https://arxiv.org/abs/2303.11366) (2023) | Stores verbal feedback after failure; paper reports 91% HumanEval pass@1 versus an 80% GPT-4 baseline in its setup. | Fits failed-test reflection and retry. | Reflection quality depends on external feedback. | 3 | 2 | 5 | 5 |
| [LATS](https://arxiv.org/abs/2310.04406) (2023/2024) | MCTS over reasoning/actions with value estimates, reflection, and environment feedback. | Strong deep-debugging escalation. | High cost and difficult budget control. | 1 | 1 | 5 | 3 |
| [Scaling Test-Time Compute](https://arxiv.org/abs/2408.03314) (2024) | Adaptive compute allocation using verifiers; reported over 4x efficiency over a best-of-N baseline in tested settings. | Supports confidence-based escalation rather than always using maximum budget. | Requires reliable difficulty and verification signals. | 4 | 3 | 5 | 5 |

## Routing, Caching, and Serving

| Paper/report | Evidence and mechanism | Advantages | Drawbacks | TE | SP | IN | FIT |
|---|---|---|---|---:|---:|---:|---:|
| [FrugalGPT](https://arxiv.org/abs/2305.05176) (2023) | Prompt adaptation, model approximation, and cascades; reported large cost reductions in its evaluated tasks. | Strong rationale for cheap triage and expensive escalation. | Router calibration and vendor changes. | 5 | 4 | 4 | 5 |
| [RouteLLM](https://arxiv.org/abs/2406.18665) (2024/2025) | Preference-trained router chooses strong vs weak models; reports cost reduction without quality loss in some settings. | More principled than fixed model tiers. | Preference quality may not predict patch correctness. | 5 | 4 | 4 | 4 |
| [Prompt Cache](https://arxiv.org/abs/2311.04934) (2023/2024) | Reuses attention states for reusable prompt modules; prototype reports large TTFT improvements for suitable workloads. | Directly supports stable system/tool prefixes. | Requires serving-stack support and exact cache boundaries. | 5 | 5 | 2 | 4 |
| [Anthropic prompt caching](https://www.anthropic.com/news/prompt-caching) (2024) | Provider report claims up to 90% cost and 85% latency reduction for long stable prompts. | Immediately useful where supported. | Vendor-specific and exact-prefix dependent. | 5 | 5 | 1 | 5 |
| [OpenAI prompt caching](https://platform.openai.com/docs/guides/prompt-caching) | Exact-prefix reuse, cached-token accounting, stable instructions/tools first, dynamic content last. | Concrete prompt layout and telemetry rules. | Provider-specific; no output-token savings. | 5 | 5 | 1 | 5 |
| [Speculative decoding](https://arxiv.org/abs/2211.17192) (2022/2023) | Small draft model proposes tokens; large model verifies; reported 2-3x acceleration in a tested setup. | Latency reduction without quality change. | Requires compatible serving and draft model. | 2 | 5 | 1 | 2 |
| [PagedAttention](https://arxiv.org/abs/2309.06180) (2023) | Paged KV-cache management; vLLM reported 2-4x throughput improvements in its setup. | Important for local/high-concurrency serving. | Outside orchestration; requires controlled inference server. | 2 | 4 | 1 | 3 |

## Recommended Interpretation

### Highest-confidence, near-term ideas

1. Agentless phase gating for long-horizon repair.
2. SWE-agent-style bounded evidence and concise diagnostics.
3. LongLLMLingua/extractive compression experiments on code tool output.
4. Reflexion-style failure records grounded in test/compiler output.
5. FrugalGPT/RouteLLM-style difficulty-aware routing.
6. Provider-specific prompt-cache measurement with cache-read and uncached-token accounting.

### Valuable but gated ideas

- Iterative RepoCoder retrieval when the first evidence packet is insufficient.
- Tree/LATS-style search only after ordinary verification fails.
- GraphRAG only for repository-wide architecture questions.
- Persistent MemCoder-style project knowledge only after verification and staleness rules exist.
- Speculative decoding/PagedAttention only in a controlled local serving deployment.

### Ideas not to adopt blindly

- Contentless read-cache stubs: TIER-E showed that they pushed the model into Bash file dumps and did not fix the argument-based doom-loop detector.
- One-shot history pruning: TIER-E showed that stable cache prefixes do not compensate for unbounded history growth.
- Always-on planning or tree search: extra inference can make easy tasks materially more expensive.
- Aggressive token deletion: code syntax, failing paths, expected/received values, and imports are high-value evidence.

## Existing NIMBL Research

The older paper catalog in `TIER_B_RESEARCH_PAPERS.md` and `BRAINSTORM.md` remains useful, but this report supersedes its priority ordering where TIER-E/F experiments have falsified an idea. In particular, the read-cache stub is now a rejected design, while bounded history, verification gating, and evidence packets are promoted.

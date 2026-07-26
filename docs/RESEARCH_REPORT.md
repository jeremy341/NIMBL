# NIMBL — Comprehensive Research Report

## Token-Efficient AI Coding Companion That Teaches

**Tagline:** Learn more. Use fewer tokens.

**Name:** NIMBL (dropped 'e' from "nimble" — quick, light, efficient)

**npm:** `nimbl`

**Reference implementation:** [opencode](https://github.com/anomalyco/opencode) — cloned at `C:\Users\jerem\Documents\GITHUB\opencode`

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [The Problem](#2-the-problem)
3. [The Solution](#3-the-solution)
4. [Token Efficiency Techniques](#4-token-efficiency-techniques)
5. [Context Management Analysis](#5-context-management-analysis)
6. [Learning System Design](#6-learning-system-design)
7. [App Flow & UX](#7-app-flow--ux)
8. [Tech Stack](#8-tech-stack)
9. [Architecture](#9-architecture)
10. [Name Research](#10-name-research)
11. [Stardance Strategy](#11-stardance-strategy)
12. [References](#12-references)
13. [FreeLLM Integration & Automatic Failover](#13-freellm-integration--automatic-failover)
14. [V0.1 Build Plan](#14-v01-build-plan--first-working-prototype)
15. [opencode-to-NIMBL File Mapping](#15-opencode-to-nimbl-file-mapping)
16. [Branding Replacement Guide](#16-branding-replacement-guide)

---

## 1. Product Vision

NIMBL is a token-efficient AI coding companion built in **TypeScript** with a **black-and-green terminal aesthetic**, taking heavy UI/architecture inspiration from [opencode](https://github.com/anomalyco/opencode). It connects to the Hack Club AI proxy (and other providers), helps you code while teaching you along the way, and uses 10-50x fewer tokens than existing tools like Cursor or Claude Code.

### Design Philosophy

The interface is deliberately terminal-native and keyboard-driven. **Black is the primary color** (`#0a0a0a` backgrounds, `#111111` surfaces) — **dark forest forest green `#06402b` is strictly accent** (interactive elements, buttons, highlights, cursors). No gradients. No rounded corners. Monospace typography (JetBrains Mono / Fira Code). Think `btop` or `lazygit` — black canvas, subtle green signals. Modern, fast, no mouse required.

### Core Differentiator

Every existing AI coding tool is a **code generator**. You say "build X" and it builds X. NIMBL is a **learning companion** that:

- Explains code as it suggests changes
- Asks you questions instead of giving answers (Socratic method)
- Tracks your skill growth over time
- Uses 10-50x fewer tokens per interaction
- Works with any API provider (Hack Club, OpenAI, Ollama, etc.)
- Runs in terminal or browser — one TypeScript codebase

### Target Audience

- Hack Club members (13-18 year olds)
- Beginner-to-intermediate developers
- Anyone who wants to learn while they code
- Budget-conscious developers (free via Hack Club proxy)

### Distribution

- **TUI:** `bunx nimbl` or `npx nimbl` (TypeScript, cross-platform)
- **Web:** `nimbl serve` (browser-based) — post-v0.1
- **Desktop:** Post-v0.1 (reuse same TUI/web codebase)

---

## 2. The Problem

### The AI Coding Access Gap

Hack Club provides free AI access via `ai.hackclub.com` — 30+ models, OpenAI-compatible API. But:

1. **Coding agents are explicitly blocked:**
   > "No coding agents — You are not allowed to use this service with coding agents like Cursor."

2. **No Hack Club-native coding tool exists.** Teens juggle VS Code + Cursor + Replit + AI chat windows.

3. **AI slop is destroying the community.** 80% of reviews in the Jackpot program were spent rejecting AI-generated projects.

4. **The proxy blocks the best tools but provides no alternative.** Teens get free model access but can't use it where it matters.

### The Token Waste Problem

Existing coding agents are extremely token-hungry:

| Tool | Tokens per Task | Cost per Task |
|------|----------------|---------------|
| Cursor | 100K-500K | $0.50-$2.50 |
| Claude Code | 200K-1M | $3.00-$15.00 |
| GitHub Copilot | 50K-200K | $0.25-$1.00 |
| **NIMBL** | **5K-30K** | **$0.01-$0.15** |

### The Learning Problem

AI coding tools optimize for **output**, not **understanding**. The gap between "code that works" and "code you could explain" is widening. The community wants AI that helps people learn, not AI that replaces learning.

---

## 3. The Solution

NIMBL is a token-efficient AI coding companion that:

### 3.1 Saves Tokens (10-50x fewer than competitors)

Uses a multi-layered token optimization pipeline:

```
User asks question
    ↓
1. Check prompt cache → Reuse static prefix (50-90% savings)
    ↓
2. Semantic search (RAG) → Find 3-5 most relevant code chunks
    ↓
3. Graph traversal (tree-sitter) → Include direct dependencies
    ↓
4. Budget assembly → Fit within 60% of context window
    ↓
5. Send to LLM → Stream response
    ↓
6. Cache prefix → Next request reuses static sections
```

### 3.2 Interaction Modes

Four modes — from teaching companion to full autonomous agent:

**Assist Mode (default) — Code alongside NIMBL:**
- You code in your own editor, NIMBL watches and suggests
- Explains suggestions before applying
- You accept/reject/modify each change
- Token-efficient: sends only relevant snippets

**Learn Mode:**
- Socratic questioning — asks YOU to solve it
- Progressive hints (L0-L4)
- Micro-quizzes from your own code
- Tracks skill progress

**Review Mode:**
- Reviews your code for bugs, patterns, improvements
- Explains WHY something is a problem
- Suggests alternatives with tradeoffs

**Code Mode — Full autonomous agent:**
- Prompt and NIMBL does everything: reads files, writes code, runs commands, iterates
- Like opencode or Claude Code, but with NIMBL's token efficiency
- Requires a non-Hack-Club provider (opencode Go, OpenRouter, API key)

### 3.3 Works Everywhere

- Hack Club proxy (free, zero setup)
- OpenAI API key
- Anthropic API key
- OpenRouter
- Local Ollama (offline)
- Any OpenAI-compatible endpoint

---

## 4. Token Efficiency Techniques

### 4.1 API-Level Prompt Caching

**What:** Major LLM providers automatically cache the KV tensors from previously processed prompt prefixes. When two requests share an identical prefix, the cached version is reused.

**Savings:** 50-90% on cached tokens

| Provider | Discount | Latency Reduction |
|----------|----------|-------------------|
| Anthropic Claude | 90% on cache hits | 85% TTFT reduction |
| OpenAI GPT-5.x | 90% on cached tokens | 80% TTFT reduction |
| OpenAI GPT-4o | 50% on cached tokens | 50% TTFT reduction |
| Google Gemini | Variable | Variable |

**Implementation:** Trivial. Keep system prompts and tool definitions stable. Place volatile content (user queries, file diffs) at the end.

**Production proof:** GitHub achieved 93%+ cache hit rates. ProjectDiscovery cut costs by 59-70%.

**Implementation difficulty:** Trivial (OpenAI) to Moderate (Anthropic, requires `cache_control` breakpoints).

---

### 4.2 Hierarchical Code Compression (TREEFRAG / Skeletons)

**What:** Using AST parsers (tree-sitter) to understand code structure and compress files into hierarchical representations. Instead of sending full source code, send function signatures, class definitions, imports — only hydrating (expanding) full bodies on demand.

**Savings:** 10-24x compression (89-97%)

| Method | Compression Ratio | Quality Impact |
|--------|------------------|----------------|
| TREEFRAG LOD1 | 18:1 to 24:1 | 94-97% success rate |
| Context-Condenser | 8-15x | Minimal (on-demand hydration) |
| Composto L0 | 97.5% | Structure only |
| Composto L1 | ~89% | Code + health signals |
| ReduceTheTokens | 90%+ | Structural map |

**Key paper — TREEFRAG (2026):**
- Decomposes codebases into tree-structured function-level fragments
- Achieves 18:1 compression ratio (207K tokens → 11K tokens)
- 94-97% success rate on 40 real-world issues across 12 frontier models
- Tree-of-2D structure fights lost-in-the-middle effects

**Key paper — Composto (2026):**
- 4-tier node classification: Keep (0.8%), Summarize (0.9%), Compress (6.9%), Drop (86.6%)
- 89% overall compression with budget-aware context packing
- Multi-level IR: L0 (~10 tokens, names only) to L3 (raw source)

**Implementation difficulty:** Moderate. Requires tree-sitter integration. Ready-made implementations exist.

**Production proof:** Context-Condenser (MCP server), Composto, ReduceTheTokens.

---

### 4.3 RAG for Codebases (Semantic Code Search)

**What:** Building a retrieval-augmented generation system specifically for code: parsing codebases with AST, creating embeddings, building vector indices, and retrieving only the most relevant snippets.

**Savings:** ~98% fewer tokens than grep+read

**Components:**
1. AST-based chunking (tree-sitter): Split code into functions/classes
2. NL enrichment: Summarize each chunk in English before embedding (10x search quality)
3. Hybrid search: Vector similarity + BM25 + Reciprocal Rank Fusion
4. Two-stage retrieval: Fast vector search → GPU cross-encoder reranking
5. Token budget optimization: Assemble context within budget

| System | Token Savings | Approach |
|--------|--------------|----------|
| Semble | ~98% vs grep+read | Static embeddings + BM25 + RRF |
| CodeRAG | High (returns only relevant chunks) | Hybrid vector + BM25 |
| Morph Semantic Search | ~1000ms total, top 10 results | Two-stage: HNSW + GPU reranking |

**Implementation difficulty:** Moderate. Multiple open-source implementations exist.

**Production proof:** Sourcegraph, Cursor, GitHub Copilot all use semantic code search.

---

### 4.4 Incremental Context / Diff-Only Updates

**What:** Instead of re-sending entire files, only send what changed (git diffs) plus affected dependencies.

**Savings:** 30-85% reduction

| System | Token Reduction | Approach |
|--------|----------------|----------|
| Delta Context Engine | 85% | Change Detection → AST Symbols → Dep Graph → Context Assembly |
| diffctx | Variable (budget-controlled) | Walks dep graph from changed lines |
| AdaEdit | >30% on long edits | Adaptive diff/full-code choice |
| FastEdit | ~50% output tokens saved | AST-based, zero location tokens |

**Delta Context Engine (2026) — 4-layer pipeline:**
1. Change Detection: git diff identifies modified files
2. AST Symbols: Extract definitions and references from changed files
3. Dependency Graph: Trace which other files are affected
4. Context Assembly: Assemble minimum context within token budget

**Auto-escalation:** 5-9 files changed → 4K tokens; 10+ files → 8K tokens.

**Implementation difficulty:** Moderate. Requires git integration + tree-sitter.

---

### 4.5 Token Budget Management

**What:** Explicitly allocating fixed token budgets to different context components.

**Four-Tier Allocation Model (Production Consensus):**

| Tier | Component | Budget | Eviction Priority |
|------|-----------|--------|-------------------|
| 1 | System prompt + tool schemas | 10-15% | Never evict |
| 2 | RAG results, injected memories | 20-30% | Just-in-time retrieval |
| 3 | Conversation history | 30-40% | Rolling compression |
| 4 | Intermediate reasoning, tool outputs | 15-25% | Most expendable |

**Production numbers (Harbor Support):**
- Before budgeting: Median 31K tokens, $0.42/ticket, 61% first-contact resolution
- After budgeting: Median 19K tokens, $0.26/ticket, 72% first-contact resolution
- **38% cost reduction, 11-point resolution improvement**

**Key rules:**
- Stay below 60% of context window (quality degrades above this)
- Max 5-8 MCP servers before crowding out work
- Max 200 durable instructions (context rot beyond this)
- System prompt + AGENTS.md: ~20K tokens max

---

### 4.6 Trajectory Reduction (AgentDiet)

**What:** Analyzing and removing useless, redundant, and expired information from agent interaction trajectories during execution.

**Savings:** 40-60% input token reduction, 21-36% total computational cost reduction

**AgentDiet (2025):**
- LLM-based reflection module periodically reviews and compresses historical trajectories
- Removes 69.2%-77.4% of content it processes
- Uses a cheaper model (GPT-5 mini at 12x cheaper) for compression
- Maintains same accuracy on SWE-bench Verified

**Implementation:** Moderate. Requires sliding-window with hyperparameters:
- `a` (delay steps): how long to wait before compressing
- `b` (context window for reflection): how much history to review
- `θ` (token threshold): skip compression below this

---

### 4.7 Sub-Agent Architecture

**What:** Specialized sub-agents handle focused tasks with clean context windows. Main agent coordinates, sub-agents perform deep work, return only condensed summaries.

**Savings:** 60-70% reduction for complex tasks

| Metric | Without Delegation | With Delegation | Savings |
|--------|-------------------|-----------------|---------|
| Subagents per task | 5-10 | 2-3 | 50-70% |
| Spawn overhead | 25K-50K tokens | 10K-15K tokens | 60-70% |
| Duplicate file reads | 30K-100K tokens | 0-5K tokens | 95% |
| Total per complex task | 250K-500K tokens | 80K-150K tokens | 60-70% |

**Break-even analysis:**
- 1 file task: never delegate (overhead too high)
- 2-7 files: delegate only if >6 turns expected
- 8-15 files: always delegate
- 15+ files: mandatory delegation

---

### 4.8 Codified Prompting

**What:** Replacing verbose natural-language prompts with structured pseudocode using typed variables, control structures, and reusable subroutines.

**Savings:** 55-87% input token reduction, 41-70% output reduction

**Performance improvement:** 3-36 percentage points over natural language baselines.

**Example:**
```
// Natural language (verbose):
// "First, read the file at the given path. Then, parse it as JSON.
//  If parsing fails, return an error. If successful, extract the
//  'users' field. Filter users where 'active' is true. Return the
//  filtered list sorted by 'name'."

// Codified prompting (concise):
// fn load_active_users(path: str) -> list<user> {
//   json = read_file(path) ?? return error("File not found")
//   data = parse_json(json) ?? return error("Invalid JSON")
//   return data.users.filter(u => u.active).sort_by(u => u.name)
// }
```

**Implementation difficulty:** Low. Prompt engineering change only.

---

### 4.9 Context as a Tool (CaT)

**What:** Elevating context maintenance to a callable tool integrated into agent decisions. The agent decides when to compress, what to keep, and what to discard.

**Result:** 57.6% solved rate on SWE-Bench-Verified, outperforming ReAct agents.

**Structured workspace:**
- Stable task semantics (never change)
- Long-term memory (persists across sessions)
- Short-term interactions (current session)

**Implementation difficulty:** High. Requires careful prompt engineering or RL training.

---

### 4.10 Adaptive Edit Format Selection

**What:** Dynamically choosing between diff-based editing (small changes) and full-code regeneration (large changes), selecting whichever requires fewer tokens.

**Savings:** >30% reduction in latency and cost on long-code editing tasks.

**Structure-aware diffs:**
- BlockDiff: AST-level block boundaries
- FuncDiff: Function-level boundaries
- Adaptive: Model chooses format per edit type

---

### 4.11 Early Termination (CodeFast)

**What:** Detecting when the LLM is generating excess tokens and terminating generation early.

**Result:** 34%-452% faster inference, no quality degradation.

**Implementation:** Train a lightweight binary classifier (GenGuard) to predict when to stop.

---

### 4.12 NL Enrichment for Embeddings

**What:** Before embedding code chunks, send them to an LLM to generate English descriptions. Embed this hybrid text (code + description).

**Result:** 10x improvement in search quality over raw code embeddings.

**Used by:** Sourcegraph, Morph, leading Code AI platforms.

---

### 4.13 Merkle Tree Incremental Sync

**What:** Using Merkle trees to detect which files changed, enabling O(log n) incremental re-indexing.

**Result:** ~270ms incremental re-index vs ~23s full index on 10K files.

---

### 4.14 LLM-Generated Compression (LLMLingua-2)

**What:** Task-agnostic prompt compression via token classification (BERT-sized compressor).

**Savings:** 2x-5x compression ratios, 1.6x-2.9x end-to-end speedup, 8x reduction in GPU memory.

**Open source:** github.com/microsoft/LLMLingua (6K+ GitHub stars)

---

### 4.15 LongCodeZip

**What:** Dual-stage compression: coarse-grained (function-level via conditional perplexity) + fine-grained (block-level via knapsack optimization).

**Savings:** Up to 5.6x compression without degrading task performance.

**Implementation difficulty:** Low (plug-and-play, no training).

---

### 4.16 SWEzze

**What:** Oracle-guided Code Distillation + fine-tuned lightweight compression model.

**Savings:** 6x stable compression, 51.8%-71.3% total token budget reduction.

**Bonus:** Actually IMPROVED issue resolution rates by 5.0%-9.2% (compression helps by filtering noise).

---

### 4.17 Structured Context Eviction (CWL)

**What:** "Context Window Lifecycle" — annotate agent trajectory as typed, dependency-linked episodes, then use deterministic LLM-free eviction policy.

**Result:** 89 sequential tasks across 80 million tokens with no measurable accuracy degradation.

**Eviction scoring:**
- Turn decay (40%): Sigmoid decay since last reference
- Edit recency (25%): Recently edited files stay sticky
- Token cost (20%): Expensive files prioritized for eviction
- Dependency graph (15%): Files imported by active files protected

Before dropping: AST-compress to signatures-only (64% average savings).

---

### 4.18 Latent Context Language Models (LCLMs)

**What:** Encoder-decoder compressor models that compress long token sequences into shorter latent embeddings.

**Savings:** Up to 16x compression with manageable quality loss.

**Status:** Research only (2026). Not yet production-deployed. Establishes new Pareto frontier.

---

### Summary: Implementation Priority

| Priority | Technique | Savings | When |
|----------|-----------|---------|------|
| **Immediate** | API Prompt Caching | 50-90% | Week 1 |
| **Immediate** | Token Budget Management | 38-56% | Week 1 |
| **Immediate** | Codified Prompting | 55-87% | Week 1 |
| **High** | RAG for Codebases | ~98% | Weeks 2-3 |
| **High** | Incremental Context | 30-85% | Weeks 2-3 |
| **High** | Hierarchical Compression | 10-24x | Weeks 2-4 |
| **Medium** | Trajectory Reduction | 40-60% | Month 2 |
| **Medium** | Sub-Agent Architecture | 60-70% | Month 2 |
| **Low** | Context as a Tool | 26-54% | Month 3+ |
| **Research** | LCLMs | 16x | Future |

---

## 5. Context Management Analysis

### 5.1 How Cursor Manages Context

**Architecture:** Three-layer runtime — editor, AI model orchestration, context-aware processing engine.

**7-tier prioritization:**
1. Workspace Semantic Index — embeddings in Turbopuffer, Merkle tree for incremental updates
2. `.cursor/rules/` files — MDC format, 4 rule types (Always, Auto, Agent, Manual)
3. `@`-mentions — @file, @codebase, @Docs, @folder, @symbol, @image, @web
4. MCP server connections — max 40 tools per session
5. Active file and selection
6. Conversation history (older messages truncated/summarized)
7. Debug context — error messages, stack traces (auto-captured)

**Key insight:** Cursor rebuilds the entire prompt on every message. Heavy prompt caching on static sections.

---

### 5.2 How Claude Code Manages Context

**5-tier system:**
1. CLAUDE.md files (hierarchical: global → project → directory → personal)
2. MEMORY.md / Auto Memory (cross-session persistence)
3. MCP server connections (practical limit: 5-8 servers)
4. Codebase (autonomous exploration — burns context fast)
5. Current conversation + command output

**Critical findings:**
- Quality degrades at 20-40% of context window
- Auto-compaction fires at 83.5% — LOSSY (one developer lost 3 hours of context)
- Best practice: stay below 60% capacity
- CLAUDE.md should be 50-200 lines max
- Instruction budget: ~200 durable instructions beyond which ALL instructions degrade

**The Document & Clear pattern:**
When context gets heavy, document findings in a file, then `/clear`, rebuild context.

---

### 5.3 How Aider Manages Context (Gold Standard)

**6-phase repo map:**

**Phase 1: Symbol Extraction (tree-sitter)**
- Parse each file into AST
- Extract definitions and references via tag queries
- Cache in SQLite with mtime invalidation

**Phase 2: Graph Building**
- Nodes = files, edges = references (referencing file → defining file)
- Edge weights: base 1.0, mentioned ident ×10, meaningful name ×10, underscore ×0.1

**Phase 3: PageRank Ranking**
- Personalized PageRank biased toward files in chat and mentioned files
- Returns per-file relevance scores

**Phase 4: Token Budget Management**
- Default: 1K tokens (1/8 of max input)
- Dynamic resizing based on conversation state

**Phase 5: Output Formatting**
- Hierarchical tree: file → class → method → signature
- Truncated via ellipsis when budget exceeded

**Phase 6: Integration**
- Repo map injected into every prompt
- Explicit files shown in full

**130+ languages supported via tree-sitter-language-pack.**

---

### 5.4 How GitHub Copilot Manages Context

**VS Code context assembly:**
1. Active file content around cursor
2. Surrounding lines (contextual code)
3. Snippets from recently opened/edited files
4. Import statements and project structure
5. Inline comments and docstrings

**Internal ranking:**
- Weights code, documentation, function signatures
- Filters redundant information
- Dynamic prioritization by proximity, syntax, comments
- Adapts to developer habits over time

---

### 5.5 The Context Rot Problem

**Research finding (Chroma, July 2025):**
- ALL 18 frontier models degrade as input length increases
- 200K-token window shows serious accuracy loss at 50K tokens
- Degradation is continuous, not a cliff
- Coherent, well-structured input degrades MORE than shuffled input (counterintuitive!)
- "Lost in the Middle" effect: attention dips in the middle of context

**Root cause:** Rotary Position Embedding (RoPE) introduces long-term decay prioritizing beginning/end tokens.

**Optimal heuristics:**

| Metric | Recommendation |
|--------|---------------|
| Context fill % | Below 60% |
| System prompt + AGENTS.md | ~20K tokens max |
| AGENTS.md file | 50-200 lines |
| Instruction count | Max ~200 |
| Repo map budget | 1/8 of max input |
| MCP servers | Max 5-8 |
| File selection per task | 5-10 relevant files |
| Compaction trigger | Proactive at 60% |

---

### 5.6 The Four Context Engineering Principles

From Manus and Anthropic:

1. **Token Economics:** Tokens are a finite budget. Every token has inference cost and attention cost.
2. **Signal-to-Noise Ratio:** Critical metric is not "how much context" but "how much *relevant* context."
3. **Primacy/Recency Bias:** Place most important info at beginning and end. Middle gets least attention.
4. **Stale Context is Worse Than Missing Context:** Stale info is actively harmful because model treats it as authoritative.

---

### 5.7 The Compaction Taxonomy

| Strategy | How It Works | Used By |
|----------|-------------|---------|
| AI Summarization | LLM reads old messages, produces summary | Qwen-Code, Aider, NIMBL |
| Sliding Window | Keep only last N turns, discard rest | OpenClaw |
| Pruning | Clear old tool outputs, keep conversation text | Claude Code, NIMBL |
| Server-Side Editing | Delete content via provider API without cache invalidation | Claude Code (Anthropic) |

---

### 5.8 Optimal Context Architecture for NIMBL

Based on all research, the optimal context management system has 6 layers:

**Layer 1: Static Project Knowledge (Persistent)**
- AGENTS.md hierarchy — lightweight root, detailed subdirectories
- Tree-sitter repo map — automatic structural awareness in ~1K tokens
- Cached and version-controlled

**Layer 2: Dynamic Structural Index (Built at startup, updated incrementally)**
- Tree-sitter knowledge graph — definitions, references, call graphs
- PageRank-based relevance ranking — personalized to conversation
- Token-budgeted rendering
- SQLite cache with mtime invalidation

**Layer 3: Semantic Search (On-demand retrieval)**
- Embedding-based retrieval for fuzzy searches
- Graph-based retrieval for structural queries
- Hybrid: embeddings + graph for best-of-both

**Layer 4: Agentic Exploration (Model-driven, for unfamiliar code)**
- Let model decide what to read when static + semantic is insufficient
- Constrain tool outputs: sandbox long results, compress before injecting
- Track what model has read to avoid re-reading

**Layer 5: Context Lifecycle Management (Continuous)**
- Staleness scoring: turn decay + edit recency + token cost + dep graph
- Proactive compaction at 60% fill
- AST compression before eviction (64-70% savings)

**Layer 6: Prompt Engineering**
- Structured output format (skeletonized, not raw source)
- Instruction budget management (max ~200)
- Prompt caching exploitation (90% cost savings)
- Model routing (simple → fast model, complex → large-context model)

---

## 6. Learning System Design

### 6.1 Existing Learning-Focused Tools

| Tool | Type | Key Innovation |
|------|------|----------------|
| **Pear** | CLI companion | Watches diffs in real-time, builds learning state memory, teaches in gaps between actions |
| **Code.org AI Tutor** | K-12 platform | Socratic questioning, Gemini Flash + GPT-4o Mini, per-individual tuning |
| **Contral** | Desktop IDE | "Build Mode" (explains), "Learn Mode" (curriculum), "Defense Mode" (micro-challenges) |
| **CodeSensei** | Claude Code plugin | Belt progression (White→Black), micro-quizzes from your project |
| **Chiron** | Multi-platform plugin | Socratic mentor, L0-L4 hint ladder, /challenge drills, /postmortem review |
| **CodeTeach** | Web + VS Code | Paste code → interactive course with fill-in-the-blank + spaced repetition |

### 6.2 Adaptive Learning Architecture

**Student Model Dimensions:**
- Mastery level per skill (0-100)
- Cognitive Load (overwhelmed?)
- Zone of Proximal Development (what's just beyond ability?)
- Error patterns (systematic vs careless)
- Help-seeking frequency (too much = dependency; too little = pride)
- Time-on-task
- Engagement/motivation state

**Content Adaptation Strategies:**
1. Dynamic Difficulty Adjustment (Elo rating, like MyCodeWeapon)
2. Multi-Armed Bandit (Thompson Sampling): exploration vs exploitation
3. Fuzzy Logic Tutoring (PerFuSIT): 5 inputs → 5 strategies
4. Reinforcement Learning (SP-TeachLLM): Q-learning for strategy selection

### 6.3 The Hint Escalation System (from STAP research)

| Level | Name | Example | Rule |
|-------|------|---------|------|
| 0 | Nudge | "Think about edge cases" | No code |
| 1 | Strategy | "Consider a hash map" | No code |
| 2 | Structure | "Loop through array, check each" | No code |
| 3 | Detailed | "Initialize counter, iterate 0 to n-1" | No code |
| 4 | Full walkthrough | Complete step-by-step | Last resort |

**Critical rule — Answer Leakage Prevention:** Any compilable/runnable code shown as hint = leakage. Track explicitly. STAP research defines MVH (Minimum Viable Hint) levels precisely.

### 6.4 Spaced Repetition (FSRS Algorithm)

**FSRS v6 (2026)** — the state-of-the-art:

**DSR Model:**
- **Difficulty (D):** Intrinsic complexity (1-10 scale)
- **Stability (S):** Days until recall probability drops to 90%
- **Retrievability (R):** Current recall probability: `R = 0.9^(t/S)`

**How it works:**
1. After each review, update S and D based on rating (Again/Hard/Good/Easy)
2. Next review at `t = S` days (when R = 90%)
3. Optimizer trains on personal history to customize 17-21 parameters

**Benchmark:** 81% improvement over SM-2 (classic Anki algorithm) on 1.7B reviews.

**For code learning specifically:**
- Concept recall (FSRS-scheduled review of patterns)
- Application practice (re-doing similar problems with variation)
- Dual mastery: code-writing ability + conceptual understanding must both pass

### 6.5 Gamification That Works

**Evidence-based findings (68-study review):**

| Technique | Effectiveness | Notes |
|-----------|--------------|-------|
| XP + Levels (logarithmic) | High | Early levels fast, later harder. Creates momentum. |
| Badges/Achievements | #1 most motivating | Must represent real milestones, not participation |
| Daily Streaks | High (Duolingo validated) | Must be forgiving — one miss shouldn't destroy streak |
| Leaderboards | Conditional | Cohort-based only (weekly). Global discourages newcomers. |
| Unlimited Attempts | High | Reduces fear. Students explore more freely. |
| Immediate Feedback | #1 critical element | Seeing code pass tests = strong accomplishment feeling |
| Progress Bars | Moderate | Simple but effective. Tie to mastery, not time. |

**What doesn't work:**
- Gamification alone (without theory): only 48% on post-tests
- Effectiveness decreases for unfamiliar topics over time
- Extrinsic rewards can undermine intrinsic motivation

**Adaptive gamification (TUM research, 2026):**
- Socializers → collaborative challenges
- Achievers → milestone quests
- Explorers → bonus content unlocks
- Competitors → leaderboard features
- Free Spirits → autonomy options
- Philanthropists → mentorship features

### 6.6 Skill Tree Architecture

**RPG-Style Skill Tree (most popular):**
```
Foundation → Frontend → Backend → AI/ML → Systems
  |              |           |          |
  v              v           v          v
 HTML/CSS     React      Node.js    PyTorch
  JS Fund.    TypeScript  PostgreSQL  LangChain
  Git         State Mgmt  REST APIs  Vector DBs
```

**Nodes unlock when prerequisites are met.** Each node has: title, description, XP reward, resources, optional quiz.

**Mastery Gates (not just XP thresholds):**
CodeSensei's belt system requires:
1. XP threshold met
2. Concept mastery gates passed
3. Quiz accuracy >= 60%

**Skill Decay (optional):** Nodes desaturate if not reviewed in 30+ days. Forces periodic review.

---

## 7. App Flow & UX

### 7.1 Design Language: Black Primary, Green Accent

```
Color Palette (Black-dominant, #06402B green for accent only):
  Background    #0a0a0a  (pure black canvas — the primary color)
  Surface       #111111  (dark card/section background)
  Accent        #06402b  (dark forest green — buttons, highlights, active states)
  Accent Light  #0a5c3e  (lighter green — hover states, focus rings)
  Accent Dim    #042e1f  (deeper green — disabled states, inactive elements)
  Text          #e0e0e0  (off-white primary text)
  Muted         #666666  (grey secondary text)
  Error         #ff3333  (red — errors and alerts only)
  Border        #1a1a1a  (subtle dividers, barely visible)
  Warning       #ffaa00  (amber — warnings)

Green (#06402b) is NEVER used for backgrounds or decorative purposes. It appears
only on interactive elements: buttons, input cursors, progress bars, selected
items, keyboard hints, and success states. Everything else is black or grey.

### 7.2 First Launch

```
$ nimbl

  ███╗   ██╗ ██╗ ███╗   ███╗ ██████╗  ██╗
  ████╗  ██║ ██║ ████╗ ████║ ██╔══██╗ ██║
  ██╔██╗ ██║ ██║ ██╔████╔██║ ██████╔╝ ██║
  ██║╚██╗██║ ██║ ██║╚██╔╝██║ ██╔══██╗ ██║
  ██║ ╚████║ ██║ ██║ ╚═╝ ██║ ██████╔╝ ███████╗
  ╚═╝  ╚═══╝ ╚═╝ ╚═╝     ╚═╝ ╚═════╝  ╚══════╝

  Token-efficient AI coding that teaches.
  Learn more. Use fewer tokens.

  [1] Hack Club (free, zero setup)
  [2] OpenAI API key
  [3] Anthropic API key
  [4] OpenRouter
  [5] Local Ollama
  [6] Custom endpoint

  Select [1-6]:
```

### 7.3 Main Interface (TUI)

```
┌─ NIMBL ── Dashboard ── Learning ── Settings ─────── ⚡ 847 tokens saved ─┐
│                                                                          │
│  ▸ Chat                              │  ▸ Files                         │
│                                      │     src/                         │
│  ┌──────────────────────────────────┐│     ├─ index.ts       ◄ active   │
│  │ You: Fix the login bug           ││     └─ auth.ts                   │
│  │                                  ││                                  │
│  │ NIMBL: I found the issue in      ││  ▸ Context                       │
│  │ auth.ts line 34. The session     ││     ████████░░ 62% used          │
│  │ token expires before validation. ││     Cached: 2,340 tokens         │
│  │                                  ││     Saved: 847 tokens            │
│  │ Here's what's happening:         ││                                  │
│  │ The JWT expiry is 3600s but      ││  ▸ Learning                      │
│  │ your refresh interval is 7200s.  ││     Skills: ████████░░ 78%       │
│  │ This mismatch means tokens       ││     Streak: 12 days              │
│  │ always expire before the client  ││     Today: +45 XP                │
│  │ tries to refresh them.           ││     Level 7 ──────────────────►  │
│  │                                  ││                                  │
│  │ Suggested fix:                   ││  ▸ Tokens                        │
│  │   - token_expiry = 3600          ││     Used: 1,247                  │
│  │   + token_expiry = 86400         ││     Saved: 847 (40%)             │
│  │                                  ││     Cache hit: 92%               │
│  │ [Accept] [Modify] [Explain More] ││                                  │
│  └──────────────────────────────────┘│                                  │
│                                      │                                  │
├──────────────────────────────────────┴──────────────────────────────────┤
│ > _                                                            nimbl ▐  │
└──────────────────────────────────────────────────────────────────────────┘
```

**V0.1 scope note:** This mockup shows the full vision with Files, Learning, and Context panels. V0.1 builds a simplified version: chat area + input bar + status bar only. See Section 14.2 Phase B+C for the exact v0.1 layout (no side panels, no learning stats, no context budget display).

### 7.4 Interaction Modes

**Assist Mode (default) — Coding alongside NIMBL:**

You code in your own terminal/editor. NIMBL runs as a companion process — watching your project files, listening for questions, and providing suggestions in real-time. You do NOT code inside NIMBL. You code wherever you normally code. When you hit a keybind or ask a question:

1. NIMBL reads the current context: active file, git diff, cursor position, recent edits
2. It sends only the relevant snippets (not the whole file, not the whole repo)
3. It streams a response — explanation first, then a suggested diff
4. You accept (applies the change), modify (edit before applying), or reject
5. It explains what it changed and why, then updates your skill tree

This is the teaching layer on top of your normal workflow. Think of it as a smarter pair programmer that watches over your shoulder and speaks up when it can help — without getting in your way.

**Learn Mode:**
- Socratic questioning — asks YOU to solve it
- Progressive hints (L0-L4)
- Micro-quizzes from your own code
- Tracks skill progress

**Review Mode:**
- Reviews your code for bugs, patterns, improvements
- Explains WHY something is a problem
- Suggests alternatives with tradeoffs

**Code Mode (requires non-Hack-Club provider):**

Full autonomous coding agent — prompt and NIMBL does everything: reads files, writes code, runs commands, git operations, iterates until done. Exactly like opencode or Claude Code.

- Reads and navigates the codebase autonomously
- Creates, edits, and deletes files
- Runs shell commands and reacts to output
- Manages git (commit, branch, diff)
- Multi-step reasoning with tool loops

**Provider restrictions:**
| Provider | Works with Code Mode? |
|---|---|
| Hack Club proxy | **No** (explicitly blocks coding agents) |
| opencode Zen (free) | **No** (free models, no tool calling) |
| opencode Go (paid) | **Yes** |
| OpenRouter ($10 credits) | **Yes** |
| Any API key (OpenAI, Anthropic, etc.) | **Yes** |
| Local Ollama | **Yes** (limited by local model capability) |

Code Mode requires a provider that supports tool calling and has sufficient context window. Hack Club and free models are for Assist/Learn/Review only.

### 7.5 Token-Efficient Context Pipeline

```
User asks question
    ↓
1. Check cache (prompt caching) ──→ Cache hit? Use cached prefix
    ↓ miss
2. Semantic search (RAG) ──→ Find 3-5 most relevant code chunks
    ↓
3. Graph traversal (tree-sitter) ──→ Include direct dependencies
    ↓
4. Budget assembly ──→ Fit within token budget (60% of window)
    ↓
5. Send to LLM ──→ Stream response
    ↓
6. Cache prefix ──→ Next request reuses static sections
```

### 7.6 Commands

```
/assist          Switch to assist mode
/learn           Switch to learn mode
/review          Review current file
/add <file>      Add file to context
/remove <file>   Remove file from context
/context         Show current context usage and savings
/skills          Show skill tree and progress
/quiz            Start a quiz from your code
/compact         Compress conversation history
/clear           Clear context (keep project config)
/model           Switch AI model
/provider        Switch API provider
/history         Show session history
/export          Export learning progress
/code            Switch to Code Mode (autonomous agent, non-Hack-Club provider required)
/quit            Exit
```

### 7.7 Desktop & Web

Desktop and web UIs are post-v0.1. V0.1 is TUI-only. The same TypeScript codebase will power all three modes when ready.

---

## 8. Tech Stack

### 8.1 Language & Runtime: TypeScript + Bun

NIMBL is written entirely in **TypeScript** running on **Bun** (primary) with Node.js compatibility.

| Why TypeScript | Why Bun |
|---|---|
| Type safety catches bugs at compile time | 3-5x faster than Node.js for CLI startup |
| Same language as opencode — direct reuse of UI patterns | Native TypeScript support (no ts-node needed) |
| Huge ecosystem (npm, Ink, tree-sitter) | Built-in test runner, bundler, SQLite |
| One language for TUI (and later web/desktop) | Cross-platform: Windows, macOS, Linux |
| Teen-accessible: TypeScript is taught in Hack Club | Single binary distribution possible |

### 8.2 UI Framework: REPL (V0.1), opencode TUI (V0.2+)

V0.1 is a pure Node.js readline REPL — no TUI framework, no Solid.js, no Ink. The opencode TUI integration is deferred to v0.2. The REPL uses green ANSI escape codes for the prompt and stats display.

### 8.3 Stack Comparison

| Component | NIMBL (TypeScript) | opencode (TypeScript) |
|---|---|---|
| Language | TypeScript | TypeScript |
| Runtime | Bun | Bun |
| TUI | REPL (readline) — v0.1 · opencode TUI — v0.2+ | Ink + custom widgets |
| LLM Client | AI SDK (Vercel) | AI SDK (Vercel) |
| Code Parsing | tree-sitter (WASM) — v0.2 | tree-sitter (WASM) |
| Vector Store | SQLite + custom embeddings — v0.2 | SQLite |
| Package size | 5-15 MB (bun binary + deps) | ~10 MB |
| Startup time | <200ms | <200ms |
| Type safety | Full (TypeScript strict) | Full (TypeScript strict) |
| Desktop/Web | Post-v0.1 | Built-in |

### 8.4 Key Dependencies

```json
{
  "dependencies": {
    "@ai-sdk/openai": "5.0.0",
    "@ai-sdk/anthropic": "2.0.0",
    "ai": "5.0.0"
  },
  "devDependencies": {
    "typescript": "5.8.3",
    "bun-types": "1.3.13",
    "vitest": "3.2.0"
  }
}
```

**V0.1 note:** opencode TUI integration (workspace dep `@opencode-ai/tui`) is deferred to v0.2. V0.1 is a pure REPL with zero framework deps beyond the AI SDK.

### 8.5 Why Not Python Anymore

The original plan used Python + Textual. The switch to TypeScript is driven by:

1. **opencode is TypeScript.** Adapting its UI components directly saves months of work.
2. **Type safety.** A learning tool that modifies code must never introduce type errors.
3. **Ecosystem.** AI SDK, Ink, tree-sitter WASM — all TypeScript-native.
4. **Distribution.** `bunx nimbl` is simpler than `pip install nimbl` for Hack Club teens.
5. **One language everywhere.** TUI now, web/desktop later — all TypeScript, all the same packages.

### 8.6 OpenCode Skills for NIMBL Development

NIMBL is built using opencode as the AI coding assistant. These opencode skills are essential for building high-quality UI:

| Skill | Purpose | Why Needed |
|---|---|---|
| `tui-design` | Terminal UI layouts, Ink components, dashboard design | TUI layout, keyboard handling, terminal patterns |
| `tdd` | Test-driven development workflow | Writing tests for config, API layer |
| `systematic-debugging` | Root-cause analysis for bugs | Debugging API errors, theme issues |

**Install commands:**
```
opencode skill install tui-design
opencode skill install tdd
opencode skill install systematic-debugging
```

All three are already installed at `C:\Users\jerem\.agents\skills\`.

### 8.7 opencode as Reference Implementation

The cloned opencode repo at `C:\Users\jerem\Documents\GITHUB\opencode` serves as the primary reference. Key areas to study:

| Area | Path | What to Learn |
|---|---|---|
| UI Components | `packages/ui/src/components/` | Button, Dialog, Tabs, Accordion, Toast, Tooltip, Select, etc. |
| Theme System | `packages/ui/src/theme/` | Theme resolution, color tokens, theming engine, theme JSON schema |
| Styles | `packages/ui/src/styles/` | CSS architecture, animations, color systems, Tailwind integration |
| TUI Framework | `packages/tui/` | Ink-based terminal UI, keyboard handling, layout system |
| Desktop Shell | `packages/app/` and `packages/desktop/` | Electron main process, window management, native menus |
| Config System | `packages/opencode/src/config/` | JSONC config parsing, provider definitions, model configuration |
| LLM Integration | `packages/llm/` | AI SDK usage, streaming, tool calling, provider abstraction |

**How to adapt:** Don't copy-paste. Study how opencode solves a UI problem, then reimplement the same pattern in NIMBL with the black/green theme. The component APIs should be compatible so that theme JSON files can be reused directly.

---

## 9. Architecture

### 9.1 Project Structure (V0.1)

```
nimbl/
├── package.json
├── tsconfig.json
├── .gitignore
├── AGENTS.md
├── docs/
│   ├── RESEARCH_REPORT.md
│   └── LOGO_DESIGN.md
├── src/
│   ├── index.ts                    # B4 — REPL entry point
│   ├── config.ts                   # B2 — CLI args + defaults
│   └── core/
│       ├── api.ts                  # B3 — sendChat() + estimateSavings()
│       └── provider-defaults.ts    # B1 — hardcoded fallback
└── tests/
    ├── config.test.ts
    └── api.test.ts
```

**Only these 5 source files exist in v0.1.** Everything below is v0.2+.

### 9.2 V0.2+ Additions (do NOT build in v0.1)

```
src/
├── core/
│   ├── context.ts      # Token-efficient context engine
│   ├── agent.ts        # AI agent loop
│   ├── learning.ts     # Explain/quiz/progress system
│   ├── auth.ts         # Hack Club OAuth + BYOK
│   ├── cache.ts        # Prompt caching
│   └── budget.ts       # Token budget management
├── indexing/            # Codebase indexing (tree-sitter, RAG, PageRank)
│   ├── parser.ts
│   ├── symbols.ts
│   ├── graph.ts
│   ├── embeddings.ts
│   └── rag.ts
├── tui/                 # TUI overlays (opencode TUI integration)
│   └── logo.tsx
├── ui/                  # Shared UI components, theme engine, styles, icons
└── integrations/        # Provider registry, Hackatime, Git
    └── providers/
```

### 9.3 Context Engine Pipeline (V0.2+)

```typescript
import { AI } from "@ai-sdk/openai"

interface ContextBundle {
  systemPrompt: string
  retrievedContext: string
  conversation: Message[]
  budget: TokenBudget
}

class ContextEngine {
  private budget: number
  private cache: PromptCache
  private index: CodebaseIndex
  private graph: DependencyGraph

  constructor(budgetTokens = 60_000) {
    this.budget = budgetTokens
    this.cache = new PromptCache()
    this.index = new CodebaseIndex()
    this.graph = new DependencyGraph()
  }

  async assemble(
    query: string,
    conversation: Message[],
    activeFiles: string[]
  ): Promise<ContextBundle> {
    // 1. Check prompt cache
    const cachedPrefix = this.cache.getPrefix(conversation)

    // 2. Semantic search
    const relevant = await this.index.search(query, { topK: 5 })

    // 3. Graph traversal
    const deps = this.graph.getDependencies(relevant, { maxDepth: 2 })

    // 4. Budget assembly
    const context = this.budgetAssemble(cachedPrefix, relevant, deps, conversation)

    // 5. Cache for next request
    this.cache.storePrefix(context)

    return context
  }

  private budgetAssemble(...components: unknown[]): ContextBundle {
    // Tier 1: Static anchors (system prompt) — 15%
    // Tier 2: Retrieved context (RAG) — 25%
    // Tier 3: Conversation history — 35%
    // Tier 4: Scratch space — 25%
    // ...
  }
}
```

### 9.4 Learning System (V0.2+)

```typescript
interface SkillNode {
  id: string
  name: string
  description: string
  xp: number
  mastery: number        // 0-100
  prerequisites: string[]
  children: string[]
  lastReviewed: number    // timestamp
  nextReview: number      // FSRS-scheduled
}

class LearningSystem {
  private db: Database
  private fsrs: FSRS
  private skillTree: SkillTree

  constructor(db: Database) {
    this.db = db
    this.fsrs = new FSRS()
    this.skillTree = new SkillTree(db)
  }

  async shouldTeach(ctx: ConversationContext): Promise<boolean> {
    // Check for repeated errors, learning mode, teachable moments
  }

  generateHint(level: 0 | 1 | 2 | 3 | 4, concept: string): string {
    const hints: Record<number, string> = {
      0: this.nudge(concept),
      1: this.strategy(concept),
      2: this.structure(concept),
      3: this.detailed(concept),
      4: this.walkthrough(concept),
    }
    return hints[level]
  }

  updateProgress(userId: string, skill: string, correct: boolean): void {
    const mastery = this.skillTree.getMastery(userId, skill)
    const newMastery = correct
      ? Math.min(100, mastery + 10)
      : Math.max(0, mastery - 5)

    const nextReview = this.fsrs.schedule(newMastery)
    this.skillTree.setNextReview(userId, skill, nextReview)
  }
}
```

---

## 10. Name Research

### 10.1 NIMBL

| Check | Status |
|-------|--------|
| npm `nimbl` | **AVAILABLE** |
| GitHub | No major conflict |
| CLI command | `nimbl` — 5 chars |
| Import | `import { assist } from "nimbl"` |
| Domain | nimbl.dev (check needed) |

**Why NIMBL:**
1. Evokes efficiency — "nimble" means quick and light (token-efficient)
2. Evokes learning — a nimble mind is adaptive
3. Evokes coding — developers want nimble tools
4. 1 syllable, easy to spell
5. Works for TUI (and later web/desktop)
6. npm confirmed available

---

## 11. Stardance Strategy

### 11.1 How Stardance Works

- **Stardust = hours × quality multiplier** (10x-20x per hour)
- Track hours via Hackatime (IDE plugin)
- Ship project with live demo URL + public GitHub repo
- Get reviewed by Shipwright, enter voting pool
- 12 votes needed for payout

### 11.2 Reward Math

| Phase | Duration | Hours | Multiplier | Stardust |
|-------|----------|-------|------------|----------|
| TUI v1 | Weeks 1-3 | 80-120h | 15x | 1,200-1,800 |
| Desktop v1 | Weeks 4-6 | 60-80h | 18x | 1,080-1,440 |
| Polish + Docs | Weeks 7-8 | 40-60h | 15x | 600-900 |
| **Total** | 8 weeks | **180-260h** | **~16x** | **2,880-4,140** |

### 11.3 Ship Requirements

1. **GitHub repo** — public, MIT license
2. **npm package** — `npx nimbl` or `bunx nimbl`
3. **Live demo** — GIF/video in README showing it in action
4. **Devlogs** — regular progress updates (every 15+ min of tracked time)
5. **README** — clear installation + usage instructions

---

## 12. References

### Token Efficiency
- AgentDiet (2025) — Trajectory reduction via LLM reflection
- TREEFRAG (2026) — Tree-structured function-level fragments, 18:1 compression
- Composto (2026) — 4-tier node classification, 89% compression
- LongCodeZip (ASE 2025) — Dual-stage compression, 5.6x ratio
- SWEzze (2026) — Oracle-guided distillation, 6x compression
- LLMLingua-2 (ACL 2024) — Task-agnostic prompt compression
- CaT (ACL 2026) — Context as a Tool, 57.6% solved rate
- ACON (2025) — Agent Context Optimization, 26-54% reduction
- CompactionRL (2026) — RL-trained context compaction
- CodeFast (2024) — Early termination for code generation

### Context Management
- Chroma Research (July 2025) — Context rot across 18 frontier models
- Aider RepoMap (2023-2026) — PageRank-based code context selection
- Cursor Architecture (2026) — 7-tier semantic context system
- Claude Code Best Practices (2026) — CLAUDE.md hierarchy, compaction
- Codebase-Memory (2026) — Tree-sitter knowledge graph, 83% quality at 10x fewer tokens
- Distil (2026) — Token-efficient code analysis, ~95% context reduction

### Learning Systems
- SP-TeachLLM — Multi-module LLM tutoring framework
- STAP — Socratic Tutor for Adaptive Programming, MVH levels
- LEA — Learning Engagement Assistant, tri-modal (Chat/Tutor/Quiz)
- AgentTutor — Multi-turn interactive system with LATS
- MyCodeWeapon — Elo rating + Thompson Sampling + FSRS
- Pear — Learning state memory, teaches in context
- CodeSensei — Belt progression, micro-quizzes from project
- Chiron — L0-L4 hint ladder, /challenge drills

### Gamification
- 68-study systematic review — Evidence-based gamification findings
- TUM Research (Speth et al., 2026) — Adaptive gamification via HEXAD
- FSRS v6 (2026) — Free Spaced Repetition Scheduler, 81% improvement over SM-2

### Frameworks & Reference
- **opencode** (anomalyco/opencode) — Primary TUI reference, cloned at `C:\Users\jerem\Documents\GITHUB\opencode`
- Ink (npm) — React for CLI, terminal UI rendering
- AI SDK (Vercel) — Unified LLM client for TypeScript
- tree-sitter — Incremental parser, 130+ languages (WASM bindings) — v0.2

---

## 13. FreeLLM Integration & Automatic Failover

### 13.1 The Problem: API Lock-In & Single Points of Failure

Every AI coding tool today requires at least one paid API key:

| Tool | Required | Monthly Cost |
|------|----------|-------------|
| Cursor | OpenAI/Anthropic key | $20-$200 |
| Claude Code | Anthropic key | $20-$100 |
| GitHub Copilot | Microsoft account | $10-$39 |

Hack Club provides free access via `ai.hackclub.com`, but it's restricted (no coding agents) and centralized (one proxy, one outage = everyone down). Free tiers from Google, Groq, Cerebras, etc. exist but require managing 10+ separate API keys with no unified interface.

### 13.2 FreeLLMAPI: The Universal Free Backend

[FreeLLMAPI](https://github.com/freellmapi/freellmapi) is a self-hosted proxy that aggregates 28+ free AI providers behind a single OpenAI-compatible endpoint.

**Provider registry (5 classes, 28+ platforms):**

| Provider Class | Platforms |
|---|---|
| `GoogleProvider` | Google Gemini (native API) |
| `OpenAICompatProvider` | Groq, Cerebras, NVIDIA, Mistral, OpenRouter, GitHub, HuggingFace, Zhipu, Ollama, Kilo, Pollinations, LLM7, nimbl, OVH, Agnes, Lepton, SambaNova, Vercel, OpenAI (keyless) |
| `CohereProvider` | Cohere (v2 API) |
| `CloudflareProvider` | Cloudflare Workers AI (account_id:token format) |
| `AIHordeProvider` | AI Horde (community-powered, queue-based) |

**Keyless providers (work immediately, no registration):**

| Provider | Models | Notes |
|----------|--------|-------|
| Pollinations | OpenAI, DeepSeek, Gemini, Mistral, Llama, Qwen | No key needed |
| LLM7 | Default, Fast, Pro | No key needed |
| Kilo Gateway | Auto, Step 3.7, Nemotron, Poolside, North, Kat Coder | No key needed |
| AI Horde | Community-generated | Queue-based, variable quality |
| nimbl Zen | MiMo V2.5 Free | No key needed — **NOTE: This "nimbl" is a third-party provider coincidentally sharing our name, not NIMBL itself** |

**Free-tier providers (register, no credit card):**

| Provider | Free Models | How to Get Key |
|----------|------------|----------------|
| Google | Gemini 2.5 Flash, Gemini 2.0 Flash | [aistudio.google.com](https://aistudio.google.com) |
| Groq | Llama 3.3 70B, Llama 4 Scout | [console.groq.com](https://console.groq.com) |
| Cerebras | Qwen3 235B, GPT-OSS 120B | [cloud.cerebras.ai](https://cloud.cerebras.ai) |
| Mistral | Codestral, Mistral Large 3 | [console.mistral.ai](https://console.mistral.ai) |
| Cloudflare | 10+ models via Workers AI | [dash.cloudflare.com](https://dash.cloudflare.com) |
| GitHub | GPT-4.1, GPT-4o | [github.com/settings/tokens](https://github.com/settings/tokens) |
| NVIDIA | DeepSeek V4 Flash | [build.nvidia.com](https://build.nvidia.com) |
| HuggingFace | DeepSeek V3 | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) |
| Cohere | Command-A | [dashboard.cohere.com](https://dashboard.cohere.com) |
| Z.ai | GLM-4.5 Flash | [zhipuai.cn](https://zhipuai.cn) |
| + 18 more | Agnes, Lepton, SambaNova, OVH, etc. | Various free tiers |

FreeLLMAPI stores keys encrypted (AES-256-GCM) in SQLite and routes requests automatically.

### 13.3 Intelligent Routing: Bandit Engine

FreeLLMAPI doesn't just fail over randomly — it uses **Thompson sampling** (multi-armed bandit) to pick the best provider for each request:

```
User request → "groq/llama-3.3-70b-versatile"
    ↓
┌─────────────────────────────────────────┐
│  1. Resolve model → find all platforms  │
│     that serve this model               │
│                                         │
│  2. Score each candidate:               │
│     score = α·reliability +             │
│             β·speed +                   │
│             γ·intelligence              │
│                                         │
│  3. Apply constraints:                  │
│     - Context window headroom           │
│     - Rate limit budget remaining       │
│     - Key health status                 │
│                                         │
│  4. Thompson sample → pick winner       │
│                                         │
│  5. Sticky session? → reuse same model  │
│     (SHA1 of first message, 30min TTL)  │
└─────────────────────────────────────────┘
```

**Routing strategies:** `priority`, `balanced`, `smartest`, `fastest`, `reliable`, `custom`

### 13.4 Built-In FreeLLM Engine for NIMBL

Instead of requiring FreeLLMAPI as a separate Docker container, NIMBL ships with its own lightweight provider aggregator in TypeScript:

```
nimbl/
├── src/
│   └── integrations/
│       └── providers/
│           ├── base.ts          # Abstract provider interface
│           ├── google.ts        # Google AI Studio (free tier)
│           ├── groq.ts          # Groq (free tier)
│           ├── cerebras.ts      # Cerebras (free tier)
│           ├── github.ts        # GitHub Models (free tier)
│           ├── cloudflare.ts    # Cloudflare Workers AI
│           ├── mistral.ts       # Mistral (free tier)
│           ├── nvidia.ts        # NVIDIA (free tier)
│           ├── huggingface.ts   # HuggingFace (free tier)
│           ├── openrouter.ts    # OpenRouter (free models)
│           ├── ollama.ts        # Ollama (local)
│           └── ... (19+ providers)
└── failover.ts          # Failover + health checking
```

**Key difference from FreeLLMAPI:** NIMBL runs as a single `bunx nimbl` — no Docker, no Python, no SQLite. The provider logic is lightweight TypeScript with in-memory rate tracking.

**Access levels:**

| Level | Setup | Models Available |
|-------|-------|-----------------|
| **Zero-config** | Just run `bunx nimbl`, no keys | ~15 models (Pollinations, LLM7, Kilo, Ollama local) |
| **Free registration** | Register at 5-10 providers (no credit card) | ~50 models |
| **Full setup** | Register at all 19 providers | 92+ models |

**This makes NIMBL the first open-source AI coding CLI built in TypeScript that:**
1. Works immediately with keyless providers (zero setup)
2. Scales to 92+ models via free API key registration
3. Uses intelligent routing (bandit engine, not random failover)
4. Survives rate limits via multi-account key pooling
5. Survives provider outages via automatic failover
6. Works with any OpenAI-compatible endpoint
7. Runs fully offline (Ollama)
8. Anyone can self-host and extend
9. Adapts opencode's battle-tested TUI components (Ink)
10. Ships as a single `bunx nimbl` command — no install, no config

---

## 14. V0.1 Build Plan — First Working Prototype

### 14.1 Goal

A minimal TUI app that:
- Launches via `bun run src/index.ts` (or `bunx nimbl`)
- Shows the NIMBL ASCII logo
- Uses **opencode's TUI package as a workspace dependency** for all chat UI (message rendering, input, streaming display, keyboard navigation, markdown)
- Connects to one provider (FreeLLMAPI auto router or OpenRouter) — hardcoded defaults, no config file needed
- Accepts text prompts, streams AI responses in the terminal
- Has the black/forest-green theme active via opencode's theming system (`#0a0a0a` + `#06402b`)
- NIMBL branding (logo, colors) layered on opencode's battle-tested TUI components

**Strategy:** Don't build a chat UI from scratch. opencode's TUI already has production-hardened components for chat rendering, streaming, markdown, input handling, and keyboard navigation. Import them as a workspace dependency (`@opencode-ai/tui`). Only build: entry point, provider config, AI SDK wiring, theme file, and NIMBL logo.

### 14.2 Build Order (file-by-file)

**Global rules for all files in this build:**
- Only `src/index.ts`, `src/config.ts`, `src/core/`, `themes/`, and `src/tui/logo.tsx` are written from scratch
- All chat UI components (messages, input, layout) are imported from `@opencode-ai/tui`
- opencode branding (logos, colors, strings) must be replaced with NIMBL branding
- V0.1 exception: importing `@opencode-ai/tui` is allowed and expected (see Section 15.4)

Each step produces a runnable state. `bun run src/index.ts` should work after each phase.

**Phase A — Project Skeleton**

| Step | File | What It Does | Done When |
|------|------|-------------|-----------|
| A1 | `package.json` | Pin deps (Section 8.4 versions). No workspace deps needed — just AI SDK + TypeScript. `bun install` succeeds. | `bun install` runs with zero errors |
| A2 | `tsconfig.json` | TypeScript config from Section 9.1. Add `"paths": { "@/*": ["./src/*"] }` for clean imports. | `bun run typecheck` passes on empty src/ |
| A3 | `.gitignore` | node_modules, dist, .env, *.log | Not tracked by git |
| A4 | `AGENTS.md` | Section 14.2.5 template. Tells AI agents about NIMBL structure. | File exists |

**Phase B — Core Logic + REPL Loop**

| Step | File | What It Does | Done When |
|------|------|-------------|-----------|
| B1 | `src/core/provider-defaults.ts` | Hardcoded defaults: `{ primary: "freellmapi/auto", fallback: "openrouter/deepseek-v4-pro" }`. | Import resolves |
| B2 | `src/config.ts` | Reads `.env` and CLI args. Returns typed config with hardcoded fallback. | `bun test config` passes |
| B3 | `src/core/api.ts` | Uses `@ai-sdk/openai` and `generateText`. Exports `sendChat()` — takes text, returns `{ text, usage }`. | `bun test api` with mock passes |
| B4 | `src/index.ts` | Entry point. Prints ANSI Shadow NIMBL logo. Enters REPL loop: readline prompt → `sendChat()` → print response + token stats → loop. Ctrl+C or `/quit` to exit. | `bun run src/index.ts` launches, accepts prompts, prints responses |

**Phase C — Polish**

| Step | File | What It Does | Done When |
|------|------|-------------|-----------|
| C1 | `bun run typecheck && bun test` | All tests pass, no type errors. | Zero errors |
| C2 | `bun run src/index.ts --provider openrouter --model deepseek-v4-pro` | Works with custom provider. | Verified |

**V0.1 output:**
```
███╗   ██╗ ██╗ ███╗   ███╗ ██████╗  ██╗
████╗  ██║ ██║ ████╗ ████║ ██╔══██╗ ██║
██╔██╗ ██║ ██║ ██╔████╔██║ ██████╔╝ ██║
██║╚██╗██║ ██║ ██║╚██╔╝██║ ██╔══██╗ ██║
██║ ╚████║ ██║ ██║ ╚═╝ ██║ ██████╔╝ ███████╗
╚═╝  ╚═══╝ ╚═╝ ╚═╝     ╚═╝ ╚═════╝  ╚══════╝

Token-efficient AI coding that teaches.
Learn more. Use fewer tokens.

nimbl> Write a function that reverses a string

Here's a function that reverses a string in TypeScript:
[... response ...]

⚡ 847 tokens · ~$0.03 saved (vs GPT-4o)

nimbl>
```

V0.1 is a REPL. No TUI, no opencode import, no Effect framework. TUI lookalike comes in v0.2 via opencode TUI integration (once Effect layers are figured out). The REPL proves the backend works — FreeLLMAPI + OpenRouter + token savings display.

### 14.2.5 AGENTS.md Template

Save as `AGENTS.md` at the project root. This tells AI coding assistants (like opencode) how to work on NIMBL:

```markdown
# NIMBL — Build Instructions

## Project
- Name: NIMBL (name: nimbl, displayName: NIMBL)
- Language: TypeScript, target ESNext
- Runtime: Bun (primary), Node.js compatible
- Package manager: bun

## Build
- `bun install` — install dependencies
- `bun run src/index.ts` — start the TUI
- `bun run typecheck` — type-check (tsc --noEmit)
- `bun test` — run all tests

## Architecture
- `src/index.ts` — entry point, ANSI Shadow logo, readline REPL loop
- `src/config.ts` — config resolution (.env, CLI args, hardcoded defaults)
- `src/core/api.ts` — `sendChat()` wraps AI SDK `generateText` + `estimateSavings()`
- `src/core/provider-defaults.ts` — hardcoded fallback config
- `src/core/types.ts` — Message/chat data model (for future use)
- `tests/` — vitest test files

## Design
- REPL: green ANSI escape codes for prompt (`\x1b[32mnimbl>\x1b[0m`), response headers, and stats
- Colors: forest green `#06402b` accent, `#0a0a0a` backgrounds (for overview docs)
- No TUI framework, no opencode imports — pure Node.js REPL

## Skills
Use these opencode skills when working on NIMBL:
- tui-design — for v0.2 TUI layouts (not needed for v0.1 REPL)
- tdd — write tests before implementation
- systematic-debugging — root-cause analysis for bugs

## V0.1 Scope
- Code Mode only (REPL: prompt → AI response → token stats)
- No TUI framework (opencode TUI in v0.2)
- Single provider: FreeLLMAPI auto router (primary) or OpenRouter (fallback via --provider flag)
- No file watching, no RAG, no learning system, no desktop/web yet
- Post-v0.1: desktop (Electron), web (Solid.js), multi-provider failover
```

### 14.2.6 Message & Chat Data Model

Define in `src/core/types.ts`:

```typescript
export type Role = "user" | "assistant" | "system"

export interface Message {
  id: string          // crypto.randomUUID()
  role: Role
  content: string     // raw markdown text
  timestamp: number   // Date.now()
}

export interface ChatState {
  messages: Message[]
  isStreaming: boolean
  error: string | null
}
```

Used by: `src/core/api.ts` (B3). opencode TUI handles message rendering via its own internal components — NIMBL's Message type is the interface between the config and the AI SDK call in `api.ts`.

### 14.2.7 REPL Code

**`src/core/api.ts`** (B3) — wraps the AI SDK:

```typescript
import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"

export interface ChatResult {
  text: string
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
}

export async function sendChat(
  text: string,
  config: { provider: string; model: string; apiKey: string }
): Promise<ChatResult> {
  const client = createOpenAI({
    baseURL: providerToBaseURL(config.provider),
    apiKey: config.apiKey,
  })

  const result = await generateText({
    model: client(config.model),
    prompt: text,
  })

  return {
    text: result.text,
    usage: {
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.promptTokens + result.usage.completionTokens,
    },
  }
}

function providerToBaseURL(p: string) {
  switch (p) {
    case "freellmapi": return "http://localhost:3001/v1"
    case "openrouter": return "https://openrouter.ai/api/v1"
    default: return "https://api.openai.com/v1"
  }
}

// Reference GPT-4o pricing for savings estimate
const REF_COST = { input: 2.50, output: 10.00 } // per 1M tokens

export function estimateSavings(prompt: number, completion: number) {
  return ((prompt / 1_000_000) * REF_COST.input
        + (completion / 1_000_000) * REF_COST.output).toFixed(2)
}
```

**`src/index.ts`** (B4) — REPL entry point:

```typescript
#!/usr/bin/env bun
import * as readline from "node:readline"
import { sendChat, estimateSavings } from "@/core/api"
import { resolveConfig } from "@/config"

const LOGO = `  ███╗   ██╗ ██╗ ███╗   ███╗ ██████╗  ██╗
  ████╗  ██║ ██║ ████╗ ████║ ██╔══██╗ ██║
  ██╔██╗ ██║ ██║ ██╔████╔██║ ██████╔╝ ██║
  ██║╚██╗██║ ██║ ██║╚██╔╝██║ ██╔══██╗ ██║
  ██║ ╚████║ ██║ ██║ ╚═╝ ██║ ██████╔╝ ███████╗
  ╚═╝  ╚═══╝ ╚═╝ ╚═╝     ╚═╝ ╚═════╝  ╚══════╝

  Token-efficient AI coding that teaches.
  Learn more. Use fewer tokens.`

console.log(LOGO + "\n")

const config = resolveConfig(process.argv)
const provider = config.provider === "freellmapi" ? "FreeLLM API" : "OpenRouter"

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
rl.setPrompt(`\x1b[32mnimbl>\x1b[0m `)  // green prompt
rl.prompt()

rl.on("line", async (input) => {
  const text = input.trim()
  if (!text) { rl.prompt(); return }
  if (text === "/quit" || text === "/exit") { console.log("Goodbye!"); process.exit(0) }

  try {
    process.stdout.write("\n")
    const result = await sendChat(text, config)
    console.log(result.text)
    const saved = estimateSavings(result.usage.promptTokens, result.usage.completionTokens)
    console.log(`\n\x1b[32m⚡ ${result.usage.totalTokens} tokens · ~$${saved} saved (vs GPT-4o)\x1b[0m`)
  } catch (err) {
    console.log(`\x1b[31mError: ${err instanceof Error ? err.message : err}\x1b[0m`)
  }

  console.log("")
  rl.prompt()
})

rl.on("close", () => { console.log("\nGoodbye!"); process.exit(0) })
```

### 14.2.8 Error Handling

| Scenario | Behavior |
|---|---|
| Provider unreachable | `sendChat()` throws → caught in REPL loop → prints red error, returns to prompt |
| API key missing | `resolveConfig()` falls back to FreeLLMAPI auto (no key needed) |
| Model errors | `generateText()` throws → caught → prints red error |
| Rate limited (429) | AI SDK handles retries internally |
| Ctrl+C | `process.exit(0)` — no state to save in v0.1 |

### 14.2.9 Startup Flow

```
1. bun run src/index.ts
2. ANSI Shadow NIMBL logo prints to stdout in forest green
3. resolveConfig() → hardcoded defaults if no args
4. REPL loop starts: nimbl> prompt
5. User types → sendChat() → generates response → prints output
6. Token stats printed after each response
7. /quit or Ctrl+C → exit
```

### 14.3 v0.1 Success Criteria

- [ ] `bun run src/index.ts` prints ANSI Shadow NIMBL logo + launches REPL with `nimbl>` prompt
- [ ] `bun run src/index.ts --provider openrouter --model deepseek-v4-pro` works
- [ ] `bun run src/index.ts` (no args) falls back to FreeLLMAPI auto router
- [ ] Typing a prompt and pressing Enter returns a response from the AI
- [ ] After each response, token count + estimated savings printed (`⚡ 847 tokens · ~$0.03 saved`)
- [ ] `/quit` or `/exit` or Ctrl+C exits cleanly
- [ ] `bun run typecheck` passes with zero errors
- [ ] `bun test` passes with zero failures

### 14.4 What NOT to Build in v0.1

- Learning system (skill tree, quizzes, spaced repetition) → v0.2
- File watcher / codebase indexing / RAG → v0.2
- Desktop app (Electron) → post-v0.1
- Web mode → post-v0.1
- Multi-provider failover → v0.2
- Config file system (nimbl.json / .env parsing) → v0.2 (hardcoded defaults for v0.1)
- Logo design (SVG icons, wordmark, favicons) → v0.2 (use ASCII art only for v0.1 — see `docs/LOGO_DESIGN.md` for concepts)
- TUI framework (opencode TUI, Ink, @opentui/solid) → v0.2. V0.1 is a pure Node.js readline REPL.
- Custom message rendering, input handling, keybinds, markdown → v0.2
- Assist/Learn/Review modes → v0.2 (Code Mode only for v0.1)
- Hack Club integration → v0.2
- Token budget management → v0.2

v0.1 is **Code Mode only** — REPL chat: ANSI Shadow logo → `nimbl>` prompt → AI response → token stats. Ships fast. TUI lookalike in v0.2.

---

## 15. opencode-to-NIMBL File Mapping

### 15.1 V0.1 Strategy: Pure REPL, No TUI Framework

V0.1 is a standalone Node.js REPL — no opencode TUI, no Solid.js, no Effect framework. The only deps are `@ai-sdk/openai` + `ai` (Vercel AI SDK). opencode TUI integration is deferred to v0.2 once the Effect dependency layers are understood.

### 15.2 What NIMBL Builds (Custom code)

| File | Why It's Custom |
|---|---|
| `src/index.ts` | REPL entry point — prints ANSI Shadow logo, readline loop, calls `sendChat()` |
| `src/config.ts` | Config with hardcoded FreeLLMAPI + OpenRouter fallback |
| `src/core/api.ts` | Wraps AI SDK's `generateText`, exports `sendChat()` + `estimateSavings()` |
| `src/core/provider-defaults.ts` | Hardcoded fallback config constants |
| `src/core/types.ts` | Message/chat data model (for future use) |

### 15.3 Files to Study From opencode (For v0.2+)

| opencode Source | What to Learn |
|---|---|
| `packages/tui/src/` | How opencode's TUI is structured — for v0.2 TUI integration |
| `packages/core/src/provider/*` | How opencode abstracts AI providers — for v0.2 multi-provider |
| `packages/ui/src/theme/` | Theme system — for v0.2 desktop/web theming |

### 15.4 Import Discipline Rule

**V0.1:** Only two external packages: `@ai-sdk/openai` (AI SDK provider) and `ai` (Vercel AI SDK core). No `@opencode-ai/` imports of any kind. Everything else is NIMBL's own code under `@/core/`.

| Correct (V0.1) | Wrong (V0.1 forbids) |
|---|---|
| `import { createOpenAI } from "@ai-sdk/openai"` | `import { run } from "@opencode-ai/tui"` |
| `import { generateText } from "ai"` | `import { ChatScreen } from "@opencode-ai/tui"` |
| `import { sendChat } from "@/core/api"` | `import { streamText } from "@opencode-ai/llm"` |

---

## 16. Branding Replacement Guide

### 16.1 What to Replace

Every user-visible string and asset must say "NIMBL" / "nimbl", never "opencode".

| Category | opencode Reference | NIMBL Replacement |
|---|---|---|
| TUI ASCII logo | opencode's logo in `packages/tui/` | ASCII art from Section 7.2 mockup (already designed) |
| npm package name | `opencode-ai` | `nimbl` |
| npm display name | "opencode" | "nimbl" |
| Help text | "opencode [project]" | "nimbl [--mode code] [--provider id] [--model id]" |
| Theme name | "OpenCode" | "NIMBL" |
| Theme ID | `opencode` | `nimbl` |

**Post-v0.1 branding** (desktop/web — deferred): window title "NIMBL", SVG wordmark, favicon, app icon, provider icon.

### 16.2 Strings to Search & Replace

In any file copied or created for NIMBL v0.1, search for these strings and replace:

| Find | Replace With |
|---|---|
| `opencode` (lowercase, as identifier) | `nimbl` |
| `OpenCode` (PascalCase) | `Nimbl` |
| `OPencode` / `OPENCODE` | `NIMBL` |
| `opencode-ai` | `nimbl` (package scope) |
| `@opencode-ai/` | `nimbl/` (or keep as external dep if using opencode packages directly) |
| `anomalyco/opencode` | `jeremy341/nimbl` |
| `opencode.ai` | `nimbl.dev` (or appropriate domain) |

### 16.3 TUI Logo (ANSI Shadow ASCII Art)

This is the logo from Section 7.2. ANSI Shadow font (FIGlet). Printed at startup:

```
  ███╗   ██╗ ██╗ ███╗   ███╗ ██████╗  ██╗
  ████╗  ██║ ██║ ████╗ ████║ ██╔══██╗ ██║
  ██╔██╗ ██║ ██║ ██╔████╔██║ ██████╔╝ ██║
  ██║╚██╗██║ ██║ ██║╚██╔╝██║ ██╔══██╗ ██║
  ██║ ╚████║ ██║ ██║ ╚═╝ ██║ ██████╔╝ ███████╗
  ╚═╝  ╚═══╝ ╚═╝ ╚═╝     ╚═╝ ╚═════╝  ╚══════╝
```

Render in forest green (`#06402b`) on black background (`#0a0a0a`). Below the logo:

```
Token-efficient AI coding that teaches.
Learn more. Use fewer tokens.
```

In off-white (`#e0e0e0`), smaller text.

### 16.5 V0.1 Branding Checklist

- [ ] `package.json`: `"name": "nimbl"`, `"displayName": "NIMBL"`  
- [ ] `AGENTS.md`: mentions NIMBL, not opencode
- [ ] Theme file: `id: "nimbl"`, green colors
- [ ] ASCII logo: rendered in green on black
- [ ] Provider icon SVG: green "N" (or diamond) on black
- [ ] No opencode logos, names, or blue/orange/cyan/purple colors appear anywhere — it's all NIMBL + forest green
- [ ] CLI help text: references `nimbl`, not opencode
- [ ] No opencode logos, names, or blue color anywhere

---

*Report compiled July 19, 2026. Updated July 25, 2026. NIMBL — Learn more. Use fewer tokens.*

**Language:** TypeScript + Bun
**UI:** Black (#0a0a0a) primary, Forest Green (#06402b) accent only
**Theme:** Adapted from opencode theme → `themes/nimbl.json`
**Reference:** [opencode](https://github.com/anomalyco/opencode) — `C:\Users\jerem\Documents\GITHUB\opencode`

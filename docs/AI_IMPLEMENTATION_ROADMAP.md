# NIMBL AI Implementation Roadmap

Last reconciled: 2026-07-28

This is the canonical implementation roadmap for AI coding agents working on NIMBL. It reconciles the original product audit with the current code after the P0 hardening pass.

## How To Use This File

1. Work in phase order unless the user explicitly reprioritizes.
2. Change an item to `[~]` while implementing it and `[x]` only after its acceptance criteria and verification pass.
3. Use test-driven development at public seams. Add one failing behavioral test before each implementation slice.
4. Prefer the smallest correct change. Do not implement later architecture speculatively.
5. Preserve existing session data or provide an explicit migration.
6. Never advertise a planned feature as implemented.
7. Run `bun test`, `bun run typecheck`, and `bun run build` before completing a phase.
8. Update this roadmap and relevant user documentation in the same change.

Status legend:

- `[x]` implemented and verified
- `[~]` partially implemented
- `[ ]` missing
- `[?]` requires a product decision

Priority legend:

- P0: data loss, security, or release correctness
- P1: core NIMBL product value
- P2: important usability or ecosystem work
- P3: optional OpenCode parity or later platform work

## Verified Baseline

These items were completed before this roadmap was created. Do not reimplement them.

- [x] Canonical project path resolution catches symlink and junction escapes.
- [x] `.env` variants are blocked in context reads, attachments, file tools, patches, and snapshots.
- [x] Agent tools use centralized allow/ask/deny permission evaluation.
- [x] Inline prompt commands honor Build mode and bash permissions.
- [x] Exact-target `always` permissions persist in project settings.
- [x] Shell commands support cancellation, a timeout, and bounded captured output.
- [x] Transient pre-output agent failures retry up to three times with exponential backoff and TUI feedback.
- [x] Non-Build modes do not expose modification tools.
- [x] New-file undo restores nonexistence rather than writing an empty file.
- [x] Multi-file patches are recorded as one undo transaction.
- [x] Conversation trimming is labeled accurately and does not claim to restore files.
- [x] Direct `runAgent()` tests cover retry, read approval, protected writes, and mode tool exposure.
- [x] Core product claims describe lexical retrieval, GPT-4o reference cost, local export, and lossy compaction accurately; remaining stale legacy documentation is tracked below.
- [x] Clickable completed Thought parts expand and collapse Markdown reasoning.
- [x] Streaming reasoning, tool parts, session persistence, multiline paste, slash commands, and the primary OpenTUI entry are operational.

## Phase 0: Release Hardening (Complete)

All identified phase-0 release blockers are implemented and verified. Reopen an item if a regression is found.

### P0-01 Preserve Corrupt Session Stores

- [x] Distinguish `missing`, `valid`, and `invalid` session-store load results.
- [x] Never replace an invalid `.nimbl/sessions.json` before preserving it.
- [x] Preserve invalid bytes as a timestamped backup before any recovery write.
- [x] Show a clear recovery error with the backup path.
- [x] Validate required store, session, and message structure instead of trusting a cast.
- [x] Test malformed JSON, unsupported versions, invalid session arrays, backup creation, and non-overwrite behavior.

Primary files:

- `src/core/sessions.ts`
- `src/tui-opencode.tsx`
- `tests/sessions.test.ts`

Acceptance criteria:

- Starting NIMBL with malformed session JSON does not alter that file.
- Recovery requires an explicit user action or writes only after preserving a backup.
- Valid version-1 stores and absent stores retain current behavior.

### P0-02 Fix Ctrl+C State Fallthrough

- [x] Select exactly one action when closing a dialog, rejecting approval, cancelling a question, aborting a run, clearing a draft, copying selection, or exiting.
- [x] Arm process exit only when Ctrl+C had no higher-priority action.
- [x] Test action priority together with first and second idle exit presses.

Primary files:

- `src/tui-opencode.tsx`
- `src/core/exit-guard.ts`
- `src/core/ctrl-c.ts`
- `tests/exit-guard.test.ts`

Acceptance criteria:

- Clearing a draft cannot arm or trigger process exit.
- One Ctrl+C performs at most one action.

### P0-03 Resolve Legacy Entry Defects

- [x] Remove the unsupported readline and Ink frontends.
- [x] Remove legacy-only package scripts and dependencies.
- [x] Remove the inert legacy `/export` and nonexistent `/tui` references with their frontends.
- [x] Make OpenTUI the sole supported packaged entry.
- [x] Add a packaging test that enforces the supported entrypoint decision.

Primary files:

- `package.json`
- `build.ts`
- `tests/entrypoints.test.ts`
- `README.md`

Acceptance criteria:

- Every documented entry point starts without a runtime reference error.
- Unsupported entry points are visibly deprecated or removed.

### P0-04 Complete Security Boundary Tests

- [x] Test read and write attempts through symlinked files and directories.
- [x] Test traversal against write, edit, patch, snapshot, glob, grep, and skill.
- [x] Protect project metadata beyond `.env`, including `.git`, NIMBL stores, common credential files, and private-key formats.
- [x] Limit the project-skill exception to canonical `.nimbl/skills/<name>/SKILL.md` files.
- [x] Document that shell approval is not a filesystem sandbox.
- [x] Test abort timing, retry limits, retry-after-activity suppression, and malformed streams.

Primary files:

- `src/core/project-path.ts`
- `src/core/agent.ts`
- `src/core/shell.ts`
- `tests/agent-run.test.ts`
- `tests/prompt-context.test.ts`

Acceptance criteria:

- Every local tool has allow, ask, deny, protected-path, and escape coverage.
- Documentation does not imply that approved shell commands are confined to the project.

## Phase 1: Durable Sessions And Accounting (Complete)

This phase is the foundation for compaction, background agents, benchmarks, and trustworthy token reporting.

### P1-01 Versioned Session Storage

- [x] Add runtime schema validation and version-1 to version-2 migration.
- [x] Add bounded lock ownership and revision-based compare-and-swap writes.
- [x] Prevent concurrent NIMBL processes from silently losing updates.
- [x] Add three-generation backup rotation, unique temporary files, stale-lock recovery, and corrupt-file fingerprints.
- [x] Add active-session retention limits and bounded archival storage.
- [x] Document plaintext retention for reasoning, tools, inline output, usage, snapshots, and secrets.
- [x] Preserve existing session `/export`, `/clear`, and `/delete` controls under the migrated schema.

Acceptance criteria:

- Concurrent writers cannot silently overwrite each other.
- Invalid data produces a recoverable error rather than an empty store.
- Migrations are fixture-tested from every supported version.

### P1-02 Canonical Usage Records

- [x] Persist usage per assistant request instead of mutating aggregate counters.
- [x] Store input, output, total, cache-read, cache-write, reasoning, and text token fields when providers report them.
- [x] Store provider/model on the assistant message and request IDs, attempts, finish reason, latency, and successful completion state in usage.
- [x] Derive total from input plus output when providers omit it.
- [x] Keep input-context occupancy, latest request usage, and cumulative session usage separate.
- [x] Retain retry count and available successful aggregate usage; providers do not expose billable usage for failed pre-response attempts consistently.
- [x] Migrate existing aggregate totals into an explicit legacy baseline without inventing input/output splits.

Primary files:

- `src/core/agent.ts`
- `src/core/api.ts`
- `src/core/sessions.ts`
- `src/tui-opencode.tsx`
- `src/tui-opencode-ui/sidebar.tsx`

Acceptance criteria:

- The UI never labels cumulative usage as current context occupancy.
- Per-request totals sum to the displayed session aggregate.

### P1-03 Provider And Model Metadata

- [x] Add tools, reasoning, image, streaming, structured-output, tokenizer, context-window, and maximum-output metadata.
- [x] Add optional dated pricing records with input/output/cache/reasoning rate fields and source metadata.
- [x] Validate model compatibility before exposing request tools.
- [x] Require an explicit context-window override for unknown custom models.
- [x] Separate estimated provider cost from GPT-4o reference cost.
- [x] Add cached provider health checks with discovered model IDs.
- [x] Validate automatic route health and retain the active provider as the fallback when a candidate is unavailable.

Acceptance criteria:

- Routing never selects an unavailable or incompatible provider silently.
- Pricing displays its source date and is clearly estimated.

### P1-04 Model-Aware Token Counting

- [x] Add exact `o200k_base` and `cl100k_base` adapters plus conservative Anthropic, Gemini, Llama, Mistral, and unknown-family adapters.
- [x] Count system instructions, JSON tool schemas, history, summaries, attachments, project context, and output reservation.
- [x] Label every count as exact, family estimate, or character estimate.
- [x] Add tokenizer and complete-budget fixtures; broader multilingual calibration remains benchmark work.

Acceptance criteria:

- Known models use their tokenizer family.
- Unknown models show that the count is approximate.

### P1-05 Complete Request Budgeting

- [x] Define allocations for system instructions, tools, history, summary, attachments, project instructions, retrieval, protocol overhead, safety, and output.
- [x] Enforce the output reservation with `maxOutputTokens`.
- [x] Drop low-priority retrieval and then oldest history deterministically when over budget.
- [x] Reject impossible requests before sending and recheck projected messages before every tool-loop step.
- [x] Persist and display the complete breakdown in `/context`.

Acceptance criteria:

- The complete preflight request fits the selected model window.
- Oversized history or attachments cannot bypass retrieval budgeting.

### P1-06 Automatic Structured Compaction

- [x] Trigger compaction when active history crosses the configured model occupancy threshold.
- [x] Preserve decisions, constraints, modified files, unresolved tasks, errors, and learning state in structured fields.
- [x] Retain a recent turn-safe tail for active model history.
- [x] Exclude archived tool output and attachment expansions from active history while preserving their raw messages.
- [x] Preserve deduplicated archived messages in session storage.
- [x] Add repeated-compaction, structure, archive, threshold, and usage-preservation tests.

Acceptance criteria:

- Long sessions continue without provider context errors.
- Compaction does not silently discard active decisions or unresolved tasks.

## Phase 2: Retrieval And Token Efficiency

Implement these in order so every new mechanism can be benchmarked against the previous baseline.

### P2-01 Harden The Lexical Baseline

- [x] Respect root/nested `.gitignore`, binary detection, file-size limits, hard exclusions, and protected canonical paths.
- [x] Support an explicit index extension allowlist.
- [x] Build a process-local incremental index instead of rescanning on every uncached query.
- [x] Add opt-in filesystem watching and generation-based invalidation with lifecycle cleanup.
- [x] Rank lexical results by term frequency, proximity, symbol names, and path relevance.
- [x] Record candidates, selected excerpts, exclusion counts, rationale, generation, cache state, and estimated tokens.
- [x] Add retrieval fixtures for ignores, safety exclusions, invalidation, watcher updates, structural preference, and extension configuration.

### P2-02 Parser-Backed Structural Chunks

- [x] Integrate Babel's maintained parser for TypeScript, TSX, JavaScript, JSX, and JSON-compatible source.
- [x] Extract top-level symbol boundaries for functions, classes, interfaces, type aliases, enums, variables, imports, and JSON properties.
- [x] Produce syntactically coherent declaration chunks and preserve signatures and imports.
- [x] Preserve full selected declarations; cross-file reference expansion remains P2-03 graph work.
- [x] Fall back to lexical excerpts for Markdown, Python, Go, Rust, unsupported extensions, and parse failures.
- [x] Test structural signatures, imports, JSON units, parse fallback, and measured declaration reduction.

Acceptance criteria:

- Documentation may say “parser-backed structural chunks” for the supported parser set. Do not claim universal AST compression or a percentage reduction until benchmarked.

### P2-03 Dependency And Symbol Graph

- [x] Build stable file and symbol identities.
- [x] Track imports, exports, references, inheritance, tests, and call relationships where supported.
- [x] Incrementally update graph edges on file changes.
- [x] Expand retrieval from seed results under a strict token budget.
- [x] Explain graph-derived selections in the UI and benchmark logs.

### P2-04 Hybrid Semantic Retrieval

- [x] Define local and hosted embedding adapters.
- [x] Chunk and embed parser-derived units.
- [x] Persist a versioned vector index with content hashes.
- [x] Combine lexical, semantic, and graph scores.
- [x] Add reranking, diversity, and duplicate suppression.
- [x] Provide an offline mode that does not require hosted embeddings.
- [x] Measure retrieval quality and latency before making savings claims.

### P2-05 Provider Prompt Caching

- [x] Create stable cacheable prompt prefixes.
- [x] Add provider-specific cache-control metadata.
- [x] Track cache writes, reads, misses, token counts, latency, and cost.
- [x] Separate the local retrieval cache from provider prompt caching in all terminology.
- [x] Add cold/warm tests and fallback behavior for unsupported providers.

## Phase 3: Measurement And Claims

### P3-01 Reproducible Benchmark Harness

- [x] Create a frozen task corpus and repository fixtures.
- [x] Record model, provider, version, configuration, git revision, cache state, and random seed.
- [x] Capture every request step, selected context, token category, latency, retries, and cost.
- [x] Store raw machine-readable JSONL or equivalent results.
- [x] Define correctness and quality grading.
- [x] Run multiple samples and report variance.
- [x] Add a documented reproduction command.

### P3-02 Retrieval Ablations

- [ ] Compare no retrieval, lexical, structural, graph, semantic, hybrid, and prompt-cache configurations.
- [ ] Measure task quality, retrieval precision/recall, tokens, latency, and cost.
- [ ] Prevent a lower-token result from being called better when quality regresses.

### P3-03 Publish Defensible Claims

- [ ] Define the baseline and equivalent-quality requirement.
- [ ] Publish raw results and methodology with every savings claim.
- [ ] Version claims by model, provider, corpus, and date.
- [ ] Keep unsupported figures out of README and package metadata.

Acceptance criteria:

- “10–50x,” “5K–30K,” cache savings, and AST reduction figures remain absent unless reproduced by committed data.

## Phase 4: Agent Architecture

### P4-01 Configurable Agents

- [x] Define versioned agent configuration for prompt, model, tools, permissions, visibility, step limits, and sampling options.
- [x] Preserve Build, Plan, Explain, and Learn as built-in defaults.
- [x] Validate configurations and show effective permissions before execution.

### P4-02 Foreground Subagents

- [x] Add a task/delegation tool.
- [x] Create child sessions with parent links and bounded depth.
- [x] Define permission inheritance and escalation rules.
- [x] Add child cancellation, result handoff, and transcript drill-down.
- [x] Prevent recursive delegation loops with depth/step guards; child tasks have no artificial aggregate token cap.

### P4-03 Background Work And Concurrency

- [ ] Add per-session run ownership instead of one global runner.
- [ ] Add a background task registry with status, cancellation, and result delivery.
- [ ] Serialize approvals safely across sessions.
- [ ] Coordinate session storage and filesystem snapshots under concurrency.
- [ ] Add process and token budgets per task.

### P4-04 Snapshot And Workspace Isolation

- [x] Decide between Git checkpoints and richer filesystem snapshots.
- [x] Cover renames, permissions, binary files, directories, deletions, and atomic restore failure.
- [x] Decide whether approved shell changes should be checkpointed.
- [x] Add Git worktree creation, branch handling, dirty-tree safeguards, cleanup, and session binding.

## Phase 5: Teaching System

### P5-01 Learning Evidence Model

- [ ] Replace request-success confidence with evidence from user attempts and assessments.
- [ ] Store encounters, hints consumed, independent success, errors, confidence, and timestamps.
- [ ] Add learning-data export, reset, delete, and retention controls.

### P5-02 Skill Taxonomy And Prerequisites

- [ ] Define stable skill IDs, descriptions, prerequisite edges, mastery criteria, and curriculum versions.
- [ ] Distinguish instructional `SKILL.md` files from learner competencies.
- [ ] Map project tasks and assessments to skills.

### P5-03 Goals And Teaching Preferences

- [ ] Add learner goals, teaching intensity, preferred interaction style, and privacy controls.
- [ ] Link session recommendations and assessments to active goals.

### P5-04 Assessments And Quizzes

- [ ] Separate clarification questions from scored learning questions.
- [ ] Add answer keys or rubrics, scoring, retries, explanations, and persisted evidence.
- [ ] Support freeform answers and multiple-choice assessments.
- [ ] Test that incorrect answers cannot increase mastery.

### P5-05 Enforced Learn-Mode Progression

- [ ] Implement checkpoint, hint ladder, practice, assessment, and solution stages.
- [ ] Allow an explicit user override to request the full answer.
- [ ] Remove prompt conflicts that suppress Learn-mode quizzes.
- [ ] Add behavioral tests rather than only prompt-string assertions.

### P5-06 Misconceptions And Retention

- [ ] Represent misconceptions with evidence, severity, status, and recurrence.
- [ ] Correct and reassess misconceptions before increasing mastery.
- [ ] Add a spaced-repetition scheduler such as FSRS or a documented alternative.
- [ ] Track due reviews, recall outcomes, decay, and relearning.

### P5-07 Skill Tree UI

- [ ] Show skills, prerequisites, evidence, confidence, goals, due reviews, and misconceptions.
- [ ] Avoid presenting exposure counts as mastery.

Dependency rule: implement P5-07 only after P5-01 through P5-06 produce trustworthy data.

## Phase 6: Core TUI Completion

### P6-01 Thought Controls

- [ ] Add a selection guard before toggling Thought expansion.
- [ ] Implement global or per-session Thought visibility.
- [ ] Persist the chosen visibility and expansion policy.
- [ ] Add `/thinking` only if it is implemented; otherwise remove it from documentation.

### P6-02 Prompt Workflow

- [ ] Add per-session drafts.
- [ ] Add previous/next prompt history.
- [ ] Add stash/list/pop behavior.
- [ ] Add a queued-prompt policy while a run is active.
- [ ] Add `$EDITOR` or `$VISUAL` integration.
- [ ] Decide whether a first-class shell composer mode is required.
- [ ] Add model or response variants only after provider capability metadata exists.

### P6-03 Attachments And Autocomplete

- [ ] Add `@file` autocomplete and a project file browser.
- [ ] Support quoted paths and spaces.
- [ ] Show removable attachment chips before submission.
- [ ] Remove the unsupported directory attachment affordance or implement directories safely.
- [ ] Add line ranges and editor context.
- [ ] Add images, PDFs, and binary attachments only after model capability validation.
- [ ] Extend autocomplete to agents, models, providers, project commands, MCP resources, and plugins as those systems become real.

### P6-04 Permissions And Questions

- [ ] Rename “always” to explain its exact-target scope.
- [ ] Show the matching permission rule and decision rationale.
- [ ] Add a policy review/edit/remove dialog.
- [ ] Represent multi-path patch permissions structurally instead of comma-joined text.
- [ ] Add custom answers, multi-select, multi-question forms, validation, and typed cancellation.
- [ ] Decide whether questions should require a separate approval by default.

### P6-05 Sessions And Recovery UI

- [ ] Display parent/child relationships and branch breadcrumbs.
- [ ] Add return-to-parent and child activity navigation.
- [ ] Show running, failed, interrupted, and unread state in the session picker.
- [ ] Recover persisted running tool/reasoning parts as interrupted after restart.
- [ ] Add resume/retry for interrupted turns.
- [ ] Preserve per-session drafts and queued prompts.

### P6-06 Transcript Navigation And Metadata

- [ ] Add transcript timestamps and metadata visibility controls.
- [x] Persist per-message usage, latency, cache, retry, and finish metadata.
- [ ] Add PageUp/PageDown, half-page, top/bottom, and next/previous message commands.
- [ ] Add an unread/new-output marker when detached from the bottom.
- [ ] Add keyboard focus for Thought, tools, diffs, and sidebar sections.

### P6-07 Tool Cards And Diff Viewer

- [ ] Correctly distinguish rejected tool calls from execution failures.
- [ ] Add copy, open-file, retry, and jump-to-diff actions.
- [ ] Add a fullscreen repository diff route.
- [ ] Add file/hunk navigation, folding, search, reviewed state, and source switching.
- [ ] Present multi-file patches as navigable files rather than one clipped block.

### P6-08 Clipboard, Export, And Notifications

- [ ] Add native clipboard fallback when OSC 52 is unavailable.
- [ ] Add copy actions for code, paths, tool output, diffs, and reasoning.
- [ ] Export reasoning, tools, diffs, attachments, metadata, usage, and hierarchy according to explicit options.
- [ ] Add JSON and stdout export modes plus destination selection.
- [ ] Add secret scanning or redaction before exports.
- [ ] Add optional completion, permission, question, and failure notifications.

### P6-09 Themes And Discoverability

- [ ] Make `settings.theme` reactive or remove the inert setting.
- [ ] Add a theme picker and live preview if multiple themes remain supported.
- [ ] Respect `NO_COLOR` and terminal capabilities.
- [ ] Add complete keybinding configuration, conflict validation, and contextual help.
- [ ] Add leader-key and which-key behavior only if the command count justifies it.

### P6-10 Sidebar And Status Surfaces

- [ ] Add keyboard focus and navigation for sidebar sections.
- [ ] Open files and diffs from modified-file rows.
- [ ] Show session hierarchy, run state, diagnostics, active agents, and workspace metadata as those systems become available.
- [ ] Add explicit close behavior for the narrow-screen overlay.
- [ ] Persist collapse and visibility preferences.
- [ ] Keep modified-file counts authoritative rather than inferring unsupported shell changes.

## Phase 7: Ecosystem And Platform

Implement only after core sessions, permissions, and provider capabilities are durable.

### P7-01 MCP

- [ ] Add stdio and HTTP/SSE transports, lifecycle, timeouts, status, resources, prompts, and tools.
- [ ] Route MCP tools through NIMBL permissions.
- [ ] Add MCP OAuth only after secure credentials exist.

### P7-02 LSP

- [ ] Discover and manage language servers.
- [ ] Expose diagnostics, symbols, hover, references, and definitions to retrieval and tools.
- [ ] Add status, restart, and failure UI.

### P7-03 Secure Authentication

- [ ] Add provider login/logout and a secure OS credential store.
- [ ] Add OAuth refresh and expiry handling.
- [ ] Avoid exposing secrets in command-line arguments, logs, exports, or sessions.

### P7-04 Plugin Runtime

- [ ] Define a versioned plugin API and compatibility contract.
- [ ] Add isolated loading, activation, failure handling, and permission boundaries.
- [ ] Add commands, tools, provider adapters, timeline renderers, composer slots, and sidebar slots incrementally.
- [ ] Remove inert plugin settings until this runtime exists, or label them as unsupported everywhere.

### P7-05 Remote Sharing

- [?] Confirm that hosted sharing is a real product requirement.
- [ ] If approved, define redaction, encryption, authentication, access control, expiry, revocation, retention, and abuse controls before implementation.
- [ ] Keep local Markdown export distinct from remote sharing in commands and data models.

### P7-06 Workspace And Worktree UI

- [ ] Add workspace list/create/switch/move/recovery flows after worktree core exists.
- [ ] Show branch, dirty state, workspace path, and cleanup state.

## Optional OpenCode Parity

These are not required for NIMBL's core teaching and token-efficiency value unless product requirements change.

- [ ] Audio cues and desktop notifications.
- [ ] Quick session slots and server-synchronized session search.
- [ ] Organization/account control plane.
- [ ] Public hosted session URLs.
- [ ] Plugin marketplace and installation UI.
- [ ] Advanced terminal protocols, suspend/resume behavior, and configurable mouse modes.
- [ ] Exact OpenCode modal-stack and keymap parity.

## Cross-Cutting Definition Of Done

Every roadmap item must satisfy all applicable requirements:

- [ ] Behavioral tests cover success, denial, failure, cancellation, and persistence.
- [ ] Paths and secrets follow the shared safety policy.
- [ ] Permissions are evaluated before side effects.
- [ ] Abort signals propagate through all async work.
- [ ] Session schema changes include migration tests.
- [ ] Token and cost labels distinguish estimates, provider reports, reference values, and actual billing.
- [ ] UI works at the supported minimum terminal size and in wide layouts.
- [ ] Documentation describes current behavior, not planned behavior.
- [ ] `bun test` passes.
- [ ] `bun run typecheck` passes.
- [ ] `bun run build` passes.

## Recommended Next Work Package

Implement these next, in order:

1. `P2-01` harden and index the lexical retrieval baseline.
2. `P2-02` parser-backed structural chunks.
3. `P2-03` dependency and symbol graph.
4. `P2-04` hybrid semantic retrieval.

The retrieval, agent, and workspace foundations are now implemented. Remaining roadmap items are deliberate product extensions (for example MCP/plugins/LSP, richer hosted sharing, and advanced teaching UX), not prerequisites for the local coding-agent core.

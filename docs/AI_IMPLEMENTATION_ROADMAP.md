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

## Phase 0: Remaining Release Blockers

Complete every item in this phase before calling the current prerelease durable.

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

- [ ] Test read and write attempts through symlinked files and directories.
- [ ] Test traversal against write, edit, patch, snapshot, glob, grep, and skill.
- [ ] Define protected project metadata beyond `.env`, including `.git`, NIMBL stores, credential files, and private keys.
- [ ] Add explicit policy overrides where access to protected metadata is legitimately required.
- [ ] Document that shell approval is not a filesystem sandbox.
- [ ] Test abort timing, retry limits, retry-after-activity suppression, and malformed streams.

Primary files:

- `src/core/project-path.ts`
- `src/core/agent.ts`
- `src/core/shell.ts`
- `tests/agent-run.test.ts`
- `tests/prompt-context.test.ts`

Acceptance criteria:

- Every local tool has allow, ask, deny, protected-path, and escape coverage.
- Documentation does not imply that approved shell commands are confined to the project.

## Phase 1: Durable Sessions And Accounting

This phase is the foundation for compaction, background agents, benchmarks, and trustworthy token reporting.

### P1-01 Versioned Session Storage

- [ ] Add runtime schema validation and explicit migrations.
- [ ] Add file locking or revision-based compare-and-swap writes.
- [ ] Prevent concurrent NIMBL processes from silently losing updates.
- [ ] Add backup rotation and recovery from interrupted writes.
- [ ] Add retention limits, archival, and pagination or indexed storage.
- [ ] Define privacy behavior for reasoning, tool output, inline command output, and secrets.
- [ ] Add export/delete controls for project session data.

Acceptance criteria:

- Concurrent writers cannot silently overwrite each other.
- Invalid data produces a recoverable error rather than an empty store.
- Migrations are fixture-tested from every supported version.

### P1-02 Canonical Usage Records

- [ ] Persist usage per assistant request, not only session totals.
- [ ] Store input, output, total, cache-read, cache-write, reasoning, and text token fields when providers report them.
- [ ] Store provider, model, request ID, attempts, finish reason, latency, and interrupted/failed state.
- [ ] Derive total from input plus output when providers omit it.
- [ ] Keep latest request usage separate from current input-context occupancy.
- [ ] Track failed and interrupted attempt usage when available.
- [ ] Migrate existing sessions without losing aggregate totals.

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

- [ ] Add model capabilities: tools, reasoning, images, streaming, structured output, tokenizer family, context window, and maximum output.
- [ ] Add versioned provider/model pricing for input, output, cache reads/writes, and reasoning tokens.
- [ ] Validate model compatibility before exposing tools or attachments.
- [ ] Replace the silent unknown-model 128K assumption with an explicit unknown state or required override.
- [ ] Separate actual estimated provider cost from GPT-4o reference cost.
- [ ] Add provider health checks and model discovery where supported.
- [ ] Add retry/fallback routing that respects availability and capabilities.

Acceptance criteria:

- Routing never selects an unavailable or incompatible provider silently.
- Pricing displays its source date and is clearly estimated.

### P1-04 Model-Aware Token Counting

- [ ] Select or implement tokenizer adapters by model family.
- [ ] Count system instructions, tool schemas, history, summaries, attachments, project context, and output reservation.
- [ ] Preserve approximate estimates only as an explicit fallback.
- [ ] Add fixtures covering source code, Unicode, JSON schemas, and long attachments.

Acceptance criteria:

- Known models use their tokenizer family.
- Unknown models show that the count is approximate.

### P1-05 Complete Request Budgeting

- [ ] Define allocations for system instructions, tools, history, summary, attachments, retrieval, and output.
- [ ] Enforce the configured output reservation in the provider request.
- [ ] Reduce optional context in a deterministic order when over budget.
- [ ] Reject impossible requests before sending them.
- [ ] Show a budget breakdown in `/context`.

Acceptance criteria:

- The complete preflight request fits the selected model window.
- Oversized history or attachments cannot bypass retrieval budgeting.

### P1-06 Automatic Structured Compaction

- [ ] Trigger compaction before overflow rather than waiting for `/compact`.
- [ ] Preserve decisions, constraints, modified files, unresolved tasks, errors, and learning state in structured fields.
- [ ] Retain a token-budgeted recent tail.
- [ ] Expire or summarize old tool output and attachments.
- [ ] Preserve an archive or make destructive compaction explicit.
- [ ] Add summary-quality and continuation tests.

Acceptance criteria:

- Long sessions continue without provider context errors.
- Compaction does not silently discard active decisions or unresolved tasks.

## Phase 2: Retrieval And Token Efficiency

Implement these in order so every new mechanism can be benchmarked against the previous baseline.

### P2-01 Harden The Lexical Baseline

- [ ] Respect `.gitignore`, NIMBL ignore rules, binary detection, file-size limits, and protected paths.
- [ ] Expand supported language/file types through configuration.
- [ ] Build an incremental index instead of rescanning the project for every uncached query.
- [ ] Add filesystem watching and targeted cache invalidation.
- [ ] Improve lexical ranking with term frequency, proximity, symbol names, and path relevance.
- [ ] Record candidates, selected excerpts, exclusions, rationale, and estimated tokens.
- [ ] Build retrieval-quality fixtures with known relevant files.

### P2-02 Parser-Backed Structural Chunks

- [ ] Integrate Tree-sitter or an equivalent parser in maintained source.
- [ ] Extract symbol boundaries for supported languages.
- [ ] Produce syntactically coherent compressed representations.
- [ ] Preserve signatures, imports, types, control-flow context, and referenced declarations.
- [ ] Define fallback behavior for unsupported languages or parse failures.
- [ ] Test structural validity and measured reduction.

Acceptance criteria:

- Documentation may say “AST compression” only after these tests pass.

### P2-03 Dependency And Symbol Graph

- [ ] Build stable file and symbol identities.
- [ ] Track imports, exports, references, inheritance, tests, and call relationships where supported.
- [ ] Incrementally update graph edges on file changes.
- [ ] Expand retrieval from seed results under a strict token budget.
- [ ] Explain graph-derived selections in the UI and benchmark logs.

### P2-04 Hybrid Semantic Retrieval

- [ ] Define local and hosted embedding adapters.
- [ ] Chunk and embed parser-derived units.
- [ ] Persist a versioned vector index with content hashes.
- [ ] Combine lexical, semantic, and graph scores.
- [ ] Add reranking, diversity, and duplicate suppression.
- [ ] Provide an offline mode that does not require hosted embeddings.
- [ ] Measure retrieval quality and latency before making savings claims.

### P2-05 Provider Prompt Caching

- [ ] Create stable cacheable prompt prefixes.
- [ ] Add provider-specific cache-control metadata.
- [ ] Track cache writes, reads, misses, token counts, latency, and cost.
- [ ] Separate the local retrieval cache from provider prompt caching in all terminology.
- [ ] Add cold/warm tests and fallback behavior for unsupported providers.

## Phase 3: Measurement And Claims

### P3-01 Reproducible Benchmark Harness

- [ ] Create a frozen task corpus and repository fixtures.
- [ ] Record model, provider, version, configuration, git revision, cache state, and random seed.
- [ ] Capture every request step, selected context, token category, latency, retries, and cost.
- [ ] Store raw machine-readable JSONL or equivalent results.
- [ ] Define correctness and quality grading.
- [ ] Run multiple samples and report variance.
- [ ] Add a documented reproduction command.

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

- [ ] Define versioned agent configuration for prompt, model, tools, permissions, visibility, step limits, and sampling options.
- [ ] Preserve Build, Plan, Explain, and Learn as built-in defaults.
- [ ] Validate configurations and show effective permissions before execution.

### P4-02 Foreground Subagents

- [ ] Add a task/delegation tool.
- [ ] Create child sessions with parent links and bounded depth.
- [ ] Define permission inheritance and escalation rules.
- [ ] Add child cancellation, result handoff, and transcript drill-down.
- [ ] Prevent recursive delegation loops and runaway token use.

### P4-03 Background Work And Concurrency

- [ ] Add per-session run ownership instead of one global runner.
- [ ] Add a background task registry with status, cancellation, and result delivery.
- [ ] Serialize approvals safely across sessions.
- [ ] Coordinate session storage and filesystem snapshots under concurrency.
- [ ] Add process and token budgets per task.

### P4-04 Snapshot And Workspace Isolation

- [ ] Decide between Git checkpoints and richer filesystem snapshots.
- [ ] Cover renames, permissions, binary files, directories, deletions, and atomic restore failure.
- [ ] Decide whether approved shell changes should be checkpointed.
- [ ] Add Git worktree creation, branch handling, dirty-tree safeguards, cleanup, and session binding.

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
- [ ] Persist per-message usage, latency, cache, retry, and finish metadata.
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

1. `P0-04` security-boundary integration coverage.
2. `P1-01` versioned, recoverable session storage.
3. `P1-02` canonical per-request usage records.
4. `P1-04` model-aware token counting.
5. `P1-05` complete request budgeting.

Do not start semantic retrieval, subagents, plugins, or skill-tree UI before these foundations are complete.

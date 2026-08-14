# NIMBL backend status

This file records the backend contract implemented from `RESEARCH_REPORT.md`,
`AI_IMPLEMENTATION_ROADMAP.md`, `OPENCODE_PARITY_AUDIT.md`, `AGENTS.md`, and the
project README. The TUI is a client of `src/core/backend.ts`; it does not own
session, context, learning, task, or provider state.

## Implemented backend surfaces

| Area | Implementation | Guarantees |
| --- | --- | --- |
| Agent execution | `agent.ts`, `agent-config.ts`, `tasks.ts` | Build/Plan/Explain/Learn, configurable agents, permission-gated tools, retries, aborts, bounded steps, repeated-call (doom-loop) stop, foreground/background task records, and child delegation without an artificial aggregate token cap (provider context/output limits still apply) |
| File and shell tools | `agent.ts`, `project-path.ts`, `shell.ts`, `skills.ts` | read/glob/grep/write/edit/patch/bash/web fetch/web search/skills/questions/todos, project-bound paths, protected secrets, bounded output/timeouts, approval before side effects |
| Skills | `skills.ts` | project, global (OS config `nimbl/skills/`), and configured `skills.paths` discovery; frontmatter name/description; canonical-path security; available-skill guidance injected into the agent system prompt; skill tool returns content, base directory, and related files |
| Context efficiency | `context.ts`, `dependency-graph.ts`, `structural-context.ts`, `embeddings.ts`, `vector-index.ts`, `hybrid-retrieval.ts`, `token-compression.ts` | lexical + structural + graph + offline/hosted semantic retrieval, MMR, ignore-aware indexing, declaration-preserving compression, explicit token estimates and rationale |
| Request accounting | `request-budget.ts`, `tokenizers.ts`, `prompt-cache.ts` | model-specific context windows/tokenizers, system/tools/history/summary/attachments/retrieval/output/safety categories, automatic compaction, stable provider cache prefixes and cache read/write usage |
| Sessions | `sessions.ts`, `session-actions.ts`, `session-lifecycle.ts`, `backend.ts` | versioned atomic CAS storage, lock/recovery/backups, retention, search, title/summary, parent/child/fork/pin metadata, drafts/history/stash/queue, run states, todo persistence, compaction, file undo/redo |
| Snapshots/workspaces | `filesystem-snapshot.ts`, `git-checkpoints.ts`, `workspace.ts` | binary/directory/mode snapshots, protected-path validation, restore staging, Git checkpoints, dirty-tree safeguards, worktree create/list/remove/prune |
| Permissions/questions | `permissions.ts`, `settings.ts` | allow/ask/deny by tool and wildcard target, matching rule/rationale, exact policy edits/removal, multi-path checks, freeform or multiple-choice question contract |
| Providers/auth | `providers.ts`, `routing.ts`, `provider-health.ts`, `credentials.ts`, `auth.ts` | capability/context/pricing metadata, health/discovery, scored local/fast/cost/privacy routing with rationale, env/session/saved credential resolution, OAuth PKCE challenge primitives, logout/expiry metadata |
| Teaching memory | `learning.ts` | evidence-based concepts, confidence, skills/prerequisites, goals, misconceptions, assessments/quizzes, retries, due-review scheduler, export/reset/delete/retention preference, prompt-free persistence |
| Prompt workflow | `prompt-context.ts`, `session-actions.ts`, `frecency.ts`, `editor.ts` | quoted `@file` paths, line ranges, attachment chips/details, command expansion, drafts/history/stash/pop, queued prompts, frecency-ranked file completion, external-editor draft editing |
| Export/attention | `export.ts`, `notifications.ts` | Markdown/JSON/stdout-or-file export, tools/reasoning/diffs/usage/hierarchy options, secret redaction, unread completion/permission/question/failure events |
| Measurement | `benchmark.ts` | reproducible metadata, lexical/structural/graph/semantic/hybrid/no-retrieval/prompt-cache ablations, variance, quality-regression guard, defensible-claim eligibility |
| Headless CLI | `cli-commands.ts` | `nimbl run <prompt>` and `nimbl --print <prompt>` non-interactive agent runs honoring permissions, plus session/providers/models/agent/stats/export/config/doctor commands |
| Configuration | `config-schema.ts`, `settings.ts`, `global-config.ts` | project config locations, defaults, keybinding conflict diagnostics, provider allow/deny, prompt/notification/workspace/learning controls |

## Deliberately out of scope

MCP, plugins, and LSP are not implemented because the product direction
explicitly excludes them. Hosted remote sharing, GitHub/GitLab API workflows,
and a provider-specific OAuth exchange still require external service adapters;
the local export, redaction, auth registry, and PKCE primitives are available
without introducing those dependencies.

## Verification

The backend and existing OpenTUI pass strict TypeScript checking, the complete
Vitest suite, the Bun build, and the renderer smoke test. A live Windows PTY
screenshot is an environment-level operation and is not represented as a code
verification claim.

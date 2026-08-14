# NIMBL — Full Bug Hunt & Resilience Report

**Date:** 2026-08-14
**Method:** Full test suite + typecheck + build + renderer smoke · new integration/stress/resilience suites · deep read of every core module and the TUI · parallel code analysis agent.
**Verification baseline:** `bun run typecheck` clean · **250 tests / 649 expect() pass (37 files)** · `bun run build` clean · `NIMBL_TEST_RENDERER=1` smoke exit 0.

---

## 0. Executive Summary — the two reported symptoms

The reported "**stops mid-session**" and "**can't reopen it**" symptoms were traced to three real, connected root causes:

1. **Permanent save stop after a CAS conflict (CRITICAL, FIXED).** `persistenceBlocked` (TUI) and `blocked` (backend) were set to `true` on the first `SessionStoreConflictError` and **never reset**. After one concurrent-writer conflict, every subsequent `persistNow()` silently returned — the session stopped persisting, and a crash/restart lost everything typed or run since. **This is the "can't reopen" / "data gone" bug.**
2. **Main sessions never set `runState` during a run, and `recoverInterruptedRuns` was dead code (HIGH, FIXED).** A crash mid-run left no trace; on restart nothing was marked interrupted and the session could look "stuck running" via child-only state. Now the main session gets `runState: "running"`, resets to `idle`/`interrupted` on completion/abort, and stale `running`/`queued` states are recovered to `interrupted` at startup.
3. **Multi-turn context loss: `history()` dropped tool outputs (HIGH, FIXED).** Only `message.text` was fed back on later turns, so file contents/search results/shell output the model produced via tools were invisible on turn 2+. Now tool parts are serialized back (`[read path]`, `[shell]`, etc.), attachment/command blocks are stripped from replay, and oversized tool outputs are capped.

The full bug inventory below includes everything found, with severity and fix status.

---

## 1. CRITICAL — data loss / permanent freezes

### 1.1 Save persistence permanently disabled after one conflict — FIXED
- **Files:** `src/tui-opencode.tsx:693`, `src/core/backend.ts:161`
- **Bug:** On a `SessionStoreConflictError`, `persistenceBlocked = true` (TUI) and `this.blocked = true` (backend). Nothing ever cleared them except the one-time `adoptPersistedState` at startup. All later saves silently no-op → session progress is lost on exit/restart.
- **Fix:** `persistNow` now recovers: reloads the store, adopts the on-disk revision, merges sessions the other writer created, clears `persistenceBlocked`, and resumes saving. Only if the recovery itself fails does it pause with a "restart NIMBL" notice.
- **Regression test:** `tests/resilience.test.ts` (conflict → adopt → save succeeds).

### 1.2 Shell tool can hang forever on abort/timeout (Windows) — FIXED
- **File:** `src/core/shell.ts:28-58`
- **Bug:** `child.kill()` on Windows kills only `powershell.exe`; a grandchild holding the stdout/stderr pipe keeps `readBounded` from ever reaching EOF, so `Promise.all` never settles → the `bash` tool never returns → the TUI stays stuck "running" even after Esc.
- **Fix:** `readBounded` now races each `reader.read()` against the direct child's `exited` promise and cancels the reader once the child exits, guaranteeing settlement.
- **Note:** killing the process *tree* (`taskkill /T /F`) is a follow-up for stubborn daemons.

### 1.3 Aborting the parent leaves orphaned subagents running — FIXED
- **Files:** `src/tui-opencode.tsx:1325-1357`, `src/core/tasks.ts`
- **Bug:** `abortRun()` aborted only the parent controller. Child agents bound their own per-task controller and kept running tools (bash, writes) after Esc; their pending approval/question promises re-appeared at the top of the dock, hijacking input.
- **Fix:** `cancelSessionTaskTree` walks parent→child task ids and cancels every running/queued task; `drainInteractions` clears the children's pending prompts.
- **Regression test:** none added (needs live TUI), verified by code path.

### 1.4 Doom-loop approval inverted — approving killed the run — FIXED
- **File:** `src/core/agent.ts:666-673`
- **Bug:** The moment the user approved the doom-loop "continue" dialog, the fingerprint was marked allowed and the **very next identical call** hit the `else` branch and threw — approval granted zero continuation. Also, `repeatedToolCalls`/`allowedRepeatedCalls` were never reset per attempt, so a 429/5xx retry that replayed the same tools could spuriously hard-stop or trigger the modal.
- **Fix:** Approval now genuinely allows continuation; rejection still throws. Counters are cleared at the top of each attempt.
- **Regression tests:** `tests/agent-run.test.ts` ("continues past an approved repeated tool call", "stops when the user does not approve").

### 1.5 Filesystem snapshot restore is non-transactional — NOT FIXED (documented)
- **File:** `src/core/filesystem-snapshot.ts:8`
- **Bug:** The restore loop renames each target aside and immediately deletes its backup mid-loop; a failure on a later entry leaves earlier files already reverted with no rollback path.
- **Severity:** CRITICAL (data loss) but low usage (internal feature). Recommend: stage all renames, keep backups until every entry succeeds, roll back on failure.

---

## 2. HIGH — wrong behavior / context loss

### 2.1 `history()` dropped tool outputs on later turns — FIXED
- **File:** `src/tui-opencode.tsx:924-987` (now via `assistantHistoryText`)
- **Bug:** Only `message.text` was fed back; tool results (read contents, grep matches, shell output, search results) were lost from turn 2 onward — the model "forgot" what it had already learned.
- **Fix:** Serialize completed tool parts (`[read path]\n<output>`, `[shell]`, `[webfetch]`, `[grep]`…) with a 6 KB cap; exclude reasoning and running/failed tools.
- **Regression tests:** `tests/resilience.test.ts` (`assistantHistoryText` feeds tool outputs / truncates).

### 2.2 Attachments/command blocks re-sent verbatim every turn — FIXED
- **File:** `src/tui-opencode.tsx:history()`
- **Bug:** `agentText` embeds full `Attached file:` / `User-requested command output` blocks (24 KB × up to 8); replaying them on every subsequent turn burned context.
- **Fix:** `history()` strips the blocks (splits at the marker) and feeds only the plain prompt; attachments are re-expanded fresh each turn by `preparePromptContext`.

### 2.3 Stale `runState: running` never recovered; main session never set running — FIXED
- **Files:** `src/core/backend.ts:262`, `src/tui-opencode.tsx:1044/1055/1135/1300`
- **Bug:** `recoverInterruptedRuns` was dead code, and the main session's `runState` was never updated during a run (only children were).
- **Fix:** Startup now calls `recoverInterruptedRuns`; `send()` sets `running` and resets to `idle`/`interrupted`.

### 2.4 Reasoning-token cost double-counted — FIXED
- **File:** `src/core/pricing.ts:108-118`
- **Bug:** OpenAI-style usage already includes reasoning tokens in `outputTokens`; charging `outputTokens × output` **plus** `reasoningTokens × reasoning` billed reasoning twice (~2× on the reasoning portion).
- **Fix:** `ordinaryOutput = max(0, outputTokens - reasoningTokens)`, charged at output; reasoning at `reasoning ?? output`.

### 2.5 Watch-triggered full re-index on every save + dirty race — FIXED
- **File:** `src/core/context.ts:107-131`
- **Bug:** The recursive watcher watched `.nimbl/`, so every `persistNow()` invalidated the index → every agent run (and every subagent) re-scanned + re-parsed + rebuilt graph/vectors. Also, `invalidate()` during an in-flight `build()` was discarded when `build()` blindly set `dirty=false`.
- **Fix:** Watcher ignores `/.nimbl|/.git|/node_modules|/dist`; `rebuild()` re-runs once if invalidated mid-build.

### 2.6 `read`/`grep` read unbounded files into memory — FIXED (read)
- **File:** `src/core/agent.ts:352` (read), `394` (grep)
- **Bug:** `readFileSync().split("\n")` loads entire files before clipping; grep reads every matched file with no size guard → memory blow-up / freezes on 100+ MB artifacts.
- **Fix:** read now `statSync`s first and refuses files > 8× the 48 KB cap. **grep still reads fully — recommend a size guard there too (follow-up).**

### 2.7 Session retention silently archives & drops data — NOT FIXED (documented)
- **File:** `src/core/sessions.ts:399-412,492`
- **Bug:** `applySessionRetention` runs on **every** save; past 50 unpinned sessions the 51st is archived regardless of age, and once `archived` exceeds 100 the oldest archived sessions are **dropped forever** (no backup).
- **Recommend:** only retain when count actually exceeds thresholds; move overflow into session-store backups instead of dropping; surface a notice.

---

## 3. MEDIUM — navigation / queue / skills / regex

### 3.1 `@file` regex fails on trailing punctuation — FIXED
- **File:** `src/core/prompt-context.ts:37`
- **Bug:** `(?=\s|$)` meant `@src/a.ts,` / `@src/a.ts?` never attached.
- **Fix:** boundary now also accepts `, ; : ! ? ) ] }` (deliberately not `.`, which is part of paths).
- **Regression test:** `tests/prompt-context.test.ts` ("attaches @file references followed by trailing punctuation").

### 3.2 Remote-synced skills never discoverable — FIXED
- **File:** `src/core/skills.ts`
- **Bug:** Remote skills cached under `remoteSkillsCacheDir()` (per-slug subdirs) were loadable but invisible to `discoverSkills`/`<available_skills>`/`/skills`.
- **Fix:** `discoverSkills` descends per-slug roots; `canonicalSkillFile` searches them; `remoteSkillsCacheDir()` added to `skillDirectories`.

### 3.3 Draft navigation loses the live draft — FIXED
- **File:** `src/core/session-actions.ts:33-46`, `src/tui-opencode.tsx:2146`
- **Bug:** "next" past the newest history entry returned `""`, and the unsaved live draft was unrecoverable (not in history).
- **Fix:** `setDraft` records the previous live draft at the history tail; the TUI's `onHistory` records the live draft before navigating so "next" past the newest returns to it.
- **Regression test:** `tests/prompt-flow.test.ts`.

### 3.4 Stash dialog pops the wrong stash — FIXED
- **File:** `src/tui-opencode.tsx:2335`
- **Bug:** Selecting an old stash called `popDraft` (removes the most recent) while restoring the selected entry's text — stash #3 selection deleted stash #5.
- **Fix:** removes the stash by `entry.id` and restores its text.

### 3.5 Queued prompts keep running after abort — FIXED
- **File:** `src/tui-opencode.tsx:904-920`
- **Bug:** `drainQueued` fired the next prompt even when the run was aborted; Esc should stop the queue.
- **Fix:** `drainQueued(sessionID, aborted)` clears the queue and marks the session interrupted when aborted.

### 3.6 `finishAssistant` marked aborted running tools as `completed` — FIXED
- **File:** `src/core/transcript.ts:59-73`
- **Bug:** On error/abort a tool still `running` (killed shell, rejected write) was flipped to `completed`, falsely claiming success.
- **Fix:** `finishAssistant(message, completed, failed)` marks running tools `failed` when the turn errored; error paths pass `true`.
- **Regression test:** `tests/transcript.test.ts`.

### 3.7 Concurrent-writer lock window / 30 s staleness — NOT FIXED (documented)
- **File:** `src/core/sessions.ts:422-450`
- 250 ms lock timeout makes a second instance abort almost immediately; the 30 s mtime staleness lets a slow (>30 s) save be preempted by another writer. Recommend raising the timeout and refreshing the lock mtime during saves.

### 3.8 `grep` has no timeout and is ReDoS-able — NOT FIXED (documented)
- **File:** `src/core/agent.ts:380-407` — a pathological regex on a large file blocks the TUI; add a time/line budget and abort checks in the scan loop.

---

## 4. LOW — robustness / polish

| # | File | Bug | Status |
|---|---|---|---|
| 4.1 | `src/core/project-path.ts:36` | `.nimbl` protected only as first segment; nested `sub/.nimbl/…` not blocked | FIXED (`segments.includes`) |
| 4.2 | `src/core/context.ts:68` | `defaultIndexes` global map never invalidates (stale for CLI callers) | documented |
| 4.3 | `src/core/providers.ts:319-327` | live models.dev catalog wholesale-replaces curated list; no merge | documented |
| 4.4 | `src/core/agent.ts:202-213` | `retryAfterMs` can't read SDK `Headers` instances (plain-record lookup fails) | documented |
| 4.5 | `src/core/ctrl-c.ts` | Ctrl+C prioritizes abort over draft-clear while running (consistent, note) | documented |
| 4.6 | `src/core/terminal-win32.ts:73` | 100 ms interval lives for the whole session (unref'd) | documented |
| 4.7 | `src/core/backend.ts:217-227` | `backend.delegate` is dead/broken API (never persists child transcript) — TUI bypasses it | documented (remove or fix) |

---

## 5. Verified NOT-bugs (investigated, root cause elsewhere)

- **Abort during retry backoff** — the TUI correctly rejects with "Interrupted by user." once the abort is delivered during `wait()`; the earlier "hang" was a test-timing artifact (abort fired before streaming began, so the 429 error surfaced instead). No code bug.
- **Tool-loop context guard** — `prepareStep` throws a clear "Tool-loop context reached …" above the window; the initial budget-fit check also throws earlier with "Request requires … Reduce attachments". Both correct.
- **Long-context runs** — 30 × 2 KB messages fit the budget path correctly; auto-compaction thresholds (82%, keep 8) engage as designed.
- **200 sequential single-process saves** — no self-conflict; CAS revision tracking stays in sync.
- **Truncated mid-stream failure** — retry intentionally stops after any emitted activity (opencode behavior); the partial turn is now preserved with an error marker rather than claimed complete (see 3.6).

---

## 6. New test coverage added (this pass)

| File | What it proves |
|---|---|
| `tests/resilience.test.ts` (9) | CAS reject/actual-revision; backend blocked→adopt→save; runState recovery; queue drain→idle; stale-undo refusal; abort; `assistantHistoryText` tool-output replay + truncation |
| `tests/stress.test.ts` (4) | 200 sequential saves; long-context run; tool-loop guard; abort-during-backoff |
| `tests/agent-run.test.ts` (+2) | doom-loop approve-then-continue; doom-loop reject-stops |
| `tests/transcript.test.ts` (+1) | finishAssistant marks running tools failed on error |
| `tests/prompt-context.test.ts` (+1) | @file trailing-punctuation attachment |
| `tests/prompt-flow.test.ts` (+1) | draft "next" returns to live draft |

**Totals:** 233 → **250 tests**, 609 → **649 expect() calls**, all green.

---

## 7. Recommended next work (ranked) — ALL COMPLETED 2026-08-14

1. **Kill process trees on shell timeout/abort** — DONE (`src/core/shell.ts`). `taskkill /T /F` on win32, process-group SIGKILL (with pid fallback) on POSIX, so daemonizing grandchildren can no longer hang the run.
2. **Retention overflow → backup, not drop** — DONE (`src/core/sessions.ts`). `applySessionRetention` now always caps `archived` at 100 and exposes the overflow via a transient `archivedOverflow` field; `backupArchivedOverflow` writes it to a dated `.nimbl/sessions.archived-<ts>.json` on every save. Old sessions are never silently lost. (Also fixed a latent bug where the cap was skipped entirely when nothing new was archived.)
3. **Transactional filesystem snapshot restore with rollback** — DONE (`src/core/filesystem-snapshot.ts`). Three phases: stage → install keeping all backups → delete backups; on failure, newly installed targets are removed and every backup is renamed back.
4. **Size-guard grep + regex time/line budget** — DONE (`src/core/agent.ts`). `grep` now `statSync`s each file and skips > 48 KB, checks `abortSignal` per file, and throws after a 10 s search budget; `read` keeps its earlier > 8× cap guard.
5. **retryAfterMs Headers-aware parsing** — DONE (`src/core/agent.ts`). Reads `Headers`-instance headers via `.get("retry-after")` (AI SDK errors) as well as plain records.
6. **Merge live models.dev catalog with the static catalog** — DONE (`src/core/providers.ts`). `applyLiveCatalog` overlays live metadata onto matching static models (preserving curated context/output when the feed omits them) and appends new models; static models the feed omits are no longer dropped.
7. **Remove or fix backend.delegate** — DONE (`src/core/backend.ts`). `delegate` now persists the child's user/assistant messages, streams run events into the child transcript via `reduceAssistantEvents`, and records `running`/`idle`/`failed` run states so child sessions are reopenable.

**Regression tests added:** retention overflow backup (dated file written, cap enforced), retryAfterMs on `Headers` instances, catalog merge (feed-omitted static models survive). Totals: **250 → 254 tests, 649 → 656 expect()**, all green; typecheck clean; build clean; renderer smoke exit 0.

---

## 8. First-Release Readiness

See `RELEASE_READINESS.md` for the full scored rating.

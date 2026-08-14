# NIMBL — First-Release Readiness Rating

**Date:** 2026-08-14
**Basis:** full audit (see `BUG_REPORT.md`), 254 passing tests, typecheck/build/smoke green.

---

## Overall rating: **7.5 / 10 — "Beta-ready; minor gaps before 1.0"**

NIMBL is **safe to release as a beta** (e.g. `0.9.x` / v0.1) and close to a confident v1.0. The reported "stops mid-session / can't reopen" data-loss bugs are fixed, all 7 ranked recommendations are implemented, and the test suite is healthy. The remaining gaps are scope-completeness and hard multi-user platform work, not correctness.

---

## Dimension scores

| Dimension | Score | Notes |
|---|---|---|
| **Correctness / data safety** | 8.5/10 | CAS+lock persistence, conflict auto-recovery, retention backup, transactional snapshot restore, protected-path blocking, interrupt-aware tools. No known data-loss paths remain. |
| **Test coverage** | 8.0/10 | 254 tests / 656 assertions incl. resilience, stress, retrieval, permissions, TUI smoke. Missing: E2E against a live provider and multi-process lock contention tests. |
| **Stability / hangs** | 8.0/10 | Process-tree kills, abort-aware waits, doom-loop/retry counters, watcher decoupling. No known hang paths. |
| **Core agent UX** | 7.5/10 | Streaming, tools, permissions, subagents, thinking/time indicators, multi-turn history now includes tool output. |
| **Feature completeness (TUI)** | 6.5/10 | OpenCode parity is strong (themes, dialogs, subagent nav, retry banner) but deliberately lacks MCP/plugins/LSP/server/web/desktop. |
| **Providers** | 7.0/10 | 18 providers + live models.dev merge; no OAuth flows (API keys only) and no per-family reasoning variants. |
| **Security** | 8.5/10 | Env/credential protection, external_directory gating, shell-not-sandboxed (documented), key redaction. |
| **Documentation** | 8.0/10 | AGENTS.md, README, RESEARCH_REPORT, parity/analysis/bug docs. |
| **Performance** | 7.5/10 | 60fps TUI, budgeted retrieval, watcher fix removed per-save re-index; large-file read/grep guarded. |
| **Packaging** | 6.0/10 | Single Bun bundle; no install script, no auto-update, no per-OS binaries, `private: true`. |

---

## Blocker checklist (must-fix before v1.0)

- [x] Save can never silently stop (conflict recovery) — **fixed**
- [x] Sessions reopen after a crash (runState recovery) — **fixed**
- [x] Multi-turn tool context retained — **fixed**
- [x] No permanent hangs on abort/timeout — **fixed**
- [x] Archived sessions never dropped — **fixed**
- [ ] Live E2E smoke against at least one provider on all 4 modes + delegation
- [ ] Multi-process concurrent-writer test (two TUI instances, both saving)
- [ ] `nimbl run` headless against a real key
- [ ] Decide publish/install story (npm bin, install script, auto-update)

## Recommend release path

1. **Now:** tag `v0.1.0-beta` / publish `opencode-ai`-style to npm as a beta (single Bun bundle works via `bunx`).
2. **Before v1.0:** add the four missing E2E/ops items above; run the benchmark once on the released tag and commit raw JSONL.
3. **v1.0:** all of the above + a documented install path (`bunx nimbl` / curl script) and the 3 highest-value parity gaps (per-model reasoning variants, reject-cascade, textarea undo/redo).

---

*End of rating.*

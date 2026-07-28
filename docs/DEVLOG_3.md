# NIMBL - Devlog #3: The Part After the UI Worked

Devlog #2 was about getting pixels on a terminal without Bun exploding. This one is about what happened after the app stopped looking like a prototype: making it safe around real projects, useful across conversations, and less wasteful with context.

## The UI: More OpenCode Than I Pretended

The first NIMBL chat screen was heavily inspired by OpenCode. In a few places, "inspired" is too polite: I read its TUI source and adapted interaction and presentation code. The left-border treatment, prompt behavior, dialogs, autocomplete patterns, and parts of the component structure came from that work.

That is allowed under OpenCode's MIT license, but allowed is not invisible. NIMBL includes attribution in `src/tui-opencode-ui/OPENCODE_ATTRIBUTION.md` and should credit it in the README. The point was to get a capable keyboard-first UI quickly, then build NIMBL's own behavior behind it.

The app now has a transcript, persistent prompt, modes, autocomplete, dialogs, provider/model controls, message actions, paste handling, and token/cost status. Hex colors avoid the Windows native crash. The Bun/Solid import fix is kept as an install-time patch, so a clean install does not revive the mysterious "Cell" crash.

## The Backend Got Serious

The early version could call a model. It could not safely act like a coding companion. File operations reject project or symlink escapes, `.env` files, Git metadata, NIMBL state, credentials, and private keys. Commands have allowlists, timeouts, bounded output, abort support, and explicit permissions. Build mode gets write tools; other modes do not. Transient failures retry, but partial streams never repeat and duplicate work.

Sessions moved to a versioned store with atomic writes, revisions, locks, backups, corruption recovery, retention, archives, and undo/redo snapshots. The app can continue or fork conversations, compact old turns, and record usage.

Models declare context windows, output limits, capabilities, tokenizer families, and dated pricing. NIMBL checks provider health, can route sensitive prompts locally, calculates configured-model cost, and labels the GPT-4o comparison as a reference estimate.

## Context Is Now Deliberate

Dumping a whole repository into a prompt is expensive and bad. NIMBL uses an incremental local index that respects nested `.gitignore` rules, binary detection, size limits, extension allowlists, hard exclusions, and protected paths. It watches the project and invalidates stale selections instead of rescanning every request.

Ranking is lexical, not magic semantic search: term frequency, proximity, symbol names, and path relevance. It records considered, excluded, and selected files, plus rationale, cache state, index generation, and token cost.

For TypeScript, TSX, JavaScript, JSX, and JSON, NIMBL uses Babel's parser to select coherent declarations or JSON property units instead of arbitrary line fragments. Exports and imports stay intact. Markdown, Python, Go, Rust, malformed files, and unsupported formats use bounded lexical excerpts. This is parser-backed structural retrieval, not universal AST compression or dependency-graph traversal.

## Where It Stands

The project has 110 passing tests across the agent, permissions, sessions, providers, budgets, context, structural extraction, tokenizers, and TUI smoke coverage. `bun run typecheck`, `bun run build`, and a frozen-lockfile install pass too.

There is still plenty to learn, especially frontend work. But "I copied the hard parts of a good TUI" is better than pretending I designed every interaction from scratch. The next step is proving NIMBL saves useful tokens on reproducible tasks without making answers worse.

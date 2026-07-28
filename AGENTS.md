# NIMBL — AI Agent Instructions

**Token-efficient AI coding companion that teaches. Learn more. Use fewer tokens.**

This document helps AI coding assistants (opencode, Claude Code, GitHub Copilot, etc.) work on NIMBL effectively.

---

## Project Overview

### Identity
- **Name:** NIMBL (lowercase `nimbl` for npm)
- **Display Name:** NIMBL
- **Language:** TypeScript (ESNext)
- **Runtime:** Bun 1.3.14+ (primary), Node.js compatible
- **Package Manager:** bun
- **Type Safety:** Strict mode enabled

### Problem Statement
NIMBL aims to reduce unnecessary context while teaching developers. The current prerelease uses lexical project-context selection, bounded excerpts, limited conversation history, and pedagogical modes. Semantic retrieval, graph traversal, AST compression, provider prompt caching, and comparative token benchmarks are planned rather than implemented.

### Differentiator
Every existing AI coding tool is a **code generator**. NIMBL is a **learning companion** that:
- Explains code as it suggests changes
- Asks questions (Socratic method) instead of just solving
- Records lightweight concept encounters over time
- Can use supported local or hosted providers
- Ships as a single CLI command

---

## Architecture

### Directory Structure

```
NIMBL/
├── src/
│   ├── tui-opencode.tsx      # Sole supported OpenTUI entry
│   ├── tui-opencode-ui/      # TUI components
│   ├── config.ts             # Config resolution (.env, CLI args, defaults)
│   └── core/
│       ├── agent.ts          # Streaming agent and tools
│       ├── providers.ts      # Provider/model catalog
│       ├── sessions.ts       # Versioned CAS session storage, usage, backups
│       └── context.ts        # Local context selection
├── tests/
│   ├── config.test.ts        # Configuration tests
│   └── api.test.ts           # API and cost calculation tests
├── docs/
│   ├── RESEARCH_REPORT.md    # Comprehensive design document
│   └── LOGO_DESIGN.md        # Branding guidelines
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript strict mode
├── vitest.config.ts          # Test runner configuration
├── .gitignore                # Git exclusions
├── README.md                 # User-facing documentation
└── AGENTS.md                 # This file
```

### Code Organization Principles

1. **Minimal but complete** — Only essential files for v0.1
2. **Type-safe** — Strict TypeScript enables safe refactoring
3. **Testable** — Config and API layers fully covered by tests
4. **Provider-agnostic** — Works with any OpenAI-compatible endpoint
5. **No hardcoded secrets** — All keys via .env

---

## Build & Development

### Scripts

```bash
# Install dependencies
bun install

# Start the supported OpenTUI application
bun run nimbl

# Type checking (strict mode)
bun run typecheck

# Run tests (vitest)
bun test

# Build for distribution (future)
bun run build
```

### Development Environment

**Required:**
- Bun 1.3.14+
- Node.js 18+ (for npm install of global package)

**Recommended:**
- Editor: VS Code with TypeScript support
- Plugin: Prettier (formatting)

---

## Key Files & Their Responsibilities

### `src/tui-opencode.tsx` — OpenTUI TUI

**Responsibilities:**
- Full TUI with home screen (logo + input) and chat view (message list + prompt)
- OpenCode-inspired session layout with left-border message cards
- Slash autocomplete dropdown (Arrow Up/Down, Enter, Escape, mouse support)
- Status bar showing provider, model, token count, and GPT-4o reference cost
- Handle slash commands: `/quit`, `/clear`, `/help`, `/model`, `/provider`, `/stats`, `/status`, `/export`
- Provider/model switching at runtime (reactive signals)
- Conversation export to timestamped markdown file
- Animated loading spinner (10-frame braille sequence)
- Global error handler (writes to `nimbl-error.log`)

**Design:**
- All 6-digit hex colors (no RGBA — crashes Bun FFI)
- `customBorderChars` spread from `EmptyBorder` for all 12 properties
- `scrollbox` JSX component (registered in catalogue, not a named export)
- No `opentui-spinner` — custom `LoadingDots` via `setInterval`
- Commands stored as `SLASH_COMMANDS` array dispatched via `CMD_MAP`

### `src/config.ts` — Configuration Resolution

**Responsibilities:**
- Resolve provider from CLI flags or env var defaults
- Resolve model from CLI flags or defaults
- Resolve API key from CLI flag, env var, or error
- Return typed `ResolvedConfig` object

**Design:**
- Priority: CLI flag > env var > default
- Throws error if API key missing (fail fast)
- No side effects (pure function)

**Env vars:**
- `FREELLMAPI_KEY` — For FreeLLMAPI provider
- `OPENROUTER_KEY` — For OpenRouter provider
- `NIMBL_PROVIDER` — Optional default (rarely needed)
- `NIMBL_MODEL` — Optional default (rarely needed)

### `src/core/api.ts` — AI Integration

**Responsibilities:**
- Wrap Vercel AI SDK (`generateText`)
- Handle provider-specific base URLs
- Map provider name to OpenAI-compatible endpoint
- Return structured `ChatResult` with token counts
- Calculate hypothetical GPT-4o reference cost

**Design:**
- No provider SDK imports — only openai-compatible via Vercel SDK
- Error messages include provider name for debugging
- `estimateReferenceCost()` applies a GPT-4o reference baseline; it is not actual savings

**Modifying this file:**
- Always validate input (empty text, missing config)
- Update `providerToBaseURL()` when adding providers
- Keep `REF_COST` values accurate (currently GPT-4o pricing)

### `src/core/providers.ts` — Provider Config

**Responsibilities:**
- Define the supported provider catalog
- Store model IDs, context windows, protocols, and API endpoints

**Modifying this file:**
- Never hardcode real API keys — use empty strings
- Keys come from env vars at runtime
- Update model names if providers change defaults

### `src/core/types.ts` — Type Definitions

**Responsibilities:**
- Define `Message`, `ChatRequest`, `ChatResponse` types
- Define `EstimatedSavings` type (future use)

**Design:**
- Minimal — only types actually used
- Extensible for v0.2+ features (context budget, skill tree)

### Tests

#### `tests/config.test.ts`

**Covers:**
- Default provider selection (freellmapi)
- Provider switching via CLI flag
- Model override via CLI flag
- API key resolution (env var > default)
- API key override via CLI flag
- Error on missing API key

**Running:**
```bash
FREELLMAPI_KEY=test-key bun test
```

#### `tests/api.test.ts`

**Covers:**
- Token cost calculation accuracy
- Scaling with input/output tokens
- Weight difference (output > input)
- Zero-token edge case

**Running:**
```bash
bun test
```

---

## Development Workflow

### Adding a Feature

1. **Write tests first** (TDD approach)
   ```bash
   vim tests/my-feature.test.ts
   bun test  # Should fail
   ```

2. **Implement** the feature in `src/`

3. **Verify tests pass**
   ```bash
   bun test
   bun run typecheck
   ```

4. **Commit with message**
   ```bash
   git add .
   git commit -m "feat: add X feature"
   ```

### Fixing a Bug

1. **Create a failing test** that reproduces the bug
2. **Fix the code** to make the test pass
3. **Verify** no other tests broke
4. **Commit**

### Code Style

- **Formatting:** Prettier (configure in `package.json`)
- **Linting:** TSLint via `tsc --noEmit`
- **Comments:** Only on complex logic, not obvious code
- **Naming:** camelCase for functions/variables, PascalCase for types/interfaces

---

## Provider Integration Details

### OpenRouter

**Setup:**
```bash
export OPENROUTER_KEY="sk-or-v1-..."
```

**CLI Usage:**
```bash
nimbl --provider openrouter --model deepseek/deepseek-chat
```

**Models:**
- `deepseek/deepseek-chat` (default)
- `google/gemini-2.0-flash`
- `meta-llama/llama-3.1-70b`
- [Full list](https://openrouter.ai/docs#models)

### FreeLLMAPI

**Setup (local):**
```bash
# Requires FreeLLMAPI server running locally
docker run -p 3001:3001 freellmapi/server
export FREELLMAPI_KEY="any-key"
```

**Or use managed FreeLLMAPI:**
```bash
export FREELLMAPI_KEY="freellmapi-..."
```

**CLI Usage:**
```bash
nimbl  # Uses freellmapi by default
```

### Adding a New Provider

1. Add a `ProviderDefinition` entry to `providers.ts`:
   ```typescript
   compatible("newprovider", "New Provider", "Description", "NEWPROVIDER_KEY",
     "https://api.newprovider.com/v1",
     [{ id: "default-model", name: "Default Model", contextWindow: 128_000 }])
   ```

2. Update README with setup instructions.
3. Add provider and configuration tests.

---

## Testing Strategy

### Unit Tests (Current)

- `config.test.ts` — Config resolution logic
- `api.test.ts` — Cost calculation accuracy

### Integration Tests (Future)

- End-to-end OpenTUI interaction
- Provider connectivity
- Error recovery

### Running Tests

```bash
# All tests
bun test

# Specific file
bun test tests/config.test.ts

# Watch mode
bun test --watch
```

---

## Security & Secrets

### Never Commit

- `.env` files
- API keys (test or production)
- Bearer tokens
- Private configuration

### Best Practices

1. Use `.env` locally for development
2. Document required env vars in README
3. Throw early if keys are missing
4. Log errors without leaking secrets

### Runtime Boundary

- File tools resolve canonical paths and block project escapes, `.env` files, `.git`, NIMBL state, common credential files, and private-key formats.
- Project skills are an explicit narrow exception limited to canonical `.nimbl/skills/<name>/SKILL.md` files.
- Approved shell commands are not sandboxed. They execute with the current user's operating-system permissions and may access paths and networks outside the project.
- Session transcripts, reasoning, tool output, usage, and snapshots are stored as project-local plaintext in `.nimbl`; features that persist new sensitive fields must document retention and deletion behavior.

---

## Performance Considerations

### Token Usage

NIMBL records provider-reported token usage. No task-level target or competitor reduction factor is considered validated until a reproducible benchmark corpus and raw results are committed.

**Current controls:**
1. Lexical project-file selection
2. Ignore-aware incremental index and parser-backed TypeScript/JavaScript/JSON chunks
3. Model-aware request budgeting and bounded tool output
4. Automatic structured compaction with archived raw turns
5. No automatic project-wide file dump

### Latency

Target: **<5s from prompt to response**
- Config load: ~10ms
- API call: ~2-4s (network)
- Token calculation: <1ms

---

## Common Tasks

### Updating Dependencies

```bash
# Check for outdated packages
bun outdated

# Update package.json and install
bun install
```

### Updating TypeScript

```bash
# TypeScript is in devDependencies
# Update in package.json, then:
bun install
bun run typecheck
```

### Debugging

```bash
# Run the supported application
bun run nimbl

# Debug specific config
bun run nimbl --provider openrouter --model test
```

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/my-feature

# Commit changes
git add .
git commit -m "feat: describe what you did"

# Push and create PR
git push origin feature/my-feature
```

---

## Future Features (V0.2+)

### Short Term

- Additional OpenTUI integration coverage
- Context budget visualization
- Learning state persistence (SQLite)
- Skill tree display

### Medium Term

- Autonomous agent mode (Code Mode)
- Multi-turn conversation state
- Markdown rendering in terminal
- File operations (read/write/diff)

### Long Term

- Desktop app (Electron reusing TUI)
- Web interface
- IDE plugins (VS Code, JetBrains)
- Offline support (local Ollama)

---

## Resources

- **Research Report:** [docs/RESEARCH_REPORT.md](./docs/RESEARCH_REPORT.md)
- **Logo Design:** [docs/LOGO_DESIGN.md](./docs/LOGO_DESIGN.md)
- **Vercel AI SDK:** https://sdk.vercel.ai
- **OpenRouter Docs:** https://openrouter.ai/docs
- **Bun Docs:** https://bun.sh/docs

---

## Questions?

If you're building on NIMBL and have questions:

1. Check the RESEARCH_REPORT.md for context
2. Review existing tests for patterns
3. Open an issue on GitHub
4. Ask in Hack Club community channels

**Happy coding! 🚀**

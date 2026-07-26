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
Existing AI coding tools (Cursor, Claude Code) consume 100K-1M tokens per task. NIMBL uses 10-50x fewer tokens through:
1. Intelligent context management (semantic search + graph traversal)
2. AST compression techniques
3. Prompt caching
4. Pedagogical design (teach instead of generate)

### Differentiator
Every existing AI coding tool is a **code generator**. NIMBL is a **learning companion** that:
- Explains code as it suggests changes
- Asks questions (Socratic method) instead of just solving
- Tracks skill progress over time
- Works offline and with any provider
- Ships as a single CLI command

---

## Architecture

### Directory Structure

```
NIMBL/
├── src/
│   ├── index.ts              # Entry point, REPL loop, branding
│   ├── config.ts             # Config resolution (.env, CLI args, defaults)
│   └── core/
│       ├── api.ts            # AI SDK wrapper + cost estimation
│       ├── types.ts          # Type definitions
│       └── provider-defaults.ts # Provider config (FreeLLMAPI, OpenRouter)
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

# Start NIMBL (requires FREELLMAPI_KEY or OPENROUTER_KEY env var)
bun run src/index.ts

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

### `src/index.ts` — CLI Entry Point

**Responsibilities:**
- Print NIMBL ASCII logo (ANSI Shadow font, green accent)
- Parse CLI arguments
- Initialize readline REPL
- Capture user input
- Call `sendChat()` with config
- Display token count and cost savings
- Handle `/quit` command and Ctrl+C

**Design:**
- Green ANSI codes for prompts and stats (`\x1b[32m...\x1b[0m`)
- Streaming output support (future)
- Error handling with colored error messages

**Modifying this file:**
- Keep branding and UX (logo, colors, prompts)
- Don't hardcode API calls — delegate to `api.ts`
- Don't store secrets — use `config.ts`

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
- Calculate cost savings vs GPT-4o reference

**Design:**
- No provider SDK imports — only openai-compatible via Vercel SDK
- Error messages include provider name for debugging
- `estimateSavings()` uses GPT-4o as reference baseline

**Modifying this file:**
- Always validate input (empty text, missing config)
- Update `providerToBaseURL()` when adding providers
- Keep `REF_COST` values accurate (currently GPT-4o pricing)

### `src/core/provider-defaults.ts` — Provider Config

**Responsibilities:**
- Define hardcoded defaults for each provider
- Store model IDs and API endpoints

**Current Providers:**
1. **FreeLLMAPI** — Auto-router, defaults to `http://localhost:3001/v1`
2. **OpenRouter** — DeepSeek Chat, endpoints at `https://openrouter.ai/api/v1`

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

1. Add entry to `provider-defaults.ts`:
   ```typescript
   export const DEFAULTS = {
     // ...
     newprovider: {
       provider: "newprovider",
       model: "default-model",
       baseURL: "https://api.newprovider.com/v1",
       apiKey: "",
     },
   }
   ```

2. Add case in `api.ts` providerToBaseURL():
   ```typescript
   case "newprovider": return "https://api.newprovider.com/v1"
   ```

3. Add env var handling in `config.ts`:
   ```typescript
   provider === "newprovider"
     ? process.env.NEWPROVIDER_KEY || ""
     : ...
   ```

4. Update README with setup instructions
5. Add tests for the new provider

---

## Testing Strategy

### Unit Tests (Current)

- `config.test.ts` — Config resolution logic
- `api.test.ts` — Cost calculation accuracy

### Integration Tests (Future)

- End-to-end REPL interaction
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

---

## Performance Considerations

### Token Usage

NIMBL targets **5K-30K tokens per task**:
- Prompt: ~2K-10K tokens (context window)
- Response: ~3K-20K tokens (streaming)
- Total: ~5K-30K (vs Cursor's 100K-500K)

**How:**
1. Semantic search retrieves only relevant code (~1K tokens)
2. AST compression reduces size 64-70%
3. Prompt caching saves 90% on repeated context
4. No large project maps or file dumps

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
# Run with console logs
bun run src/index.ts

# Debug specific config
bun run src/index.ts --provider openrouter --model test
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

- TUI integration (opencode's Ink components)
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


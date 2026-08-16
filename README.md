# NIMBL — Token-Efficient AI Coding Companion

**Learn more. Use fewer tokens.**

NIMBL is a CLI-based AI coding companion built in TypeScript that helps you code while teaching you along the way. The current prerelease uses local lexical context selection and explicit context budgets; comparative token savings have not yet been benchmarked.

## Features

-  **Context-Conscious** — Selects focused excerpts locally instead of sending project-wide dumps
-  **Learning-Focused** — Explain and Learn modes encourage questions, hints, and practice
-  **Multi-Provider** — Works with the providers in NIMBL's configured provider catalog
-  **Lightweight CLI** — No bloat, keyboard-driven, terminal-native
-  **Black & Green Theme** — Inspired by `btop` and `lazygit`
-  **Budget-Conscious** — Works with free tier models (Groq, Google, Mistral, etc.)

## Quick Start

### Installation

NIMBL is currently a source-distributed prerelease:

```bash
git clone https://github.com/jeremy341/NIMBL
cd NIMBL
bun install
bun run nimbl
```

No API key is required to open NIMBL. In the TUI, run `/provider`, choose a hosted provider, paste its key, and then choose one of that provider's models. NIMBL validates the credential through model discovery before saving it. Reopen `/provider` to reconnect or disconnect a saved credential.

### Set API Keys

```bash
# OpenRouter (recommended)
export OPENROUTER_KEY="your-key-here"

# Or FreeLLMAPI
export FREELLMAPI_KEY="your-key-here"
```

Get free API keys from:
- **OpenRouter**: https://openrouter.ai
- **Google AI Studio**: https://aistudio.google.com (free tier)
- **Groq**: https://console.groq.com (free tier)
- **Mistral**: https://console.mistral.ai (free tier)

### Launch

```bash
bun run nimbl
```

For a source checkout that should expose the `nimbl` command globally, run `bun link` once and then launch `nimbl` from any project directory.

Or with custom provider/model:

```bash
nimbl --provider openrouter --model deepseek/deepseek-chat
```

### Usage

Launch `nimbl`, choose a provider and model, then use the OpenTUI prompt. Tab cycles Build, Plan, Explain, and Learn modes. Slash autocomplete exposes the active command set. `@file` and `!`command`` references expand before the model sees the prompt; `@build`, `@plan`, `@explain`, and `@learn` delegate the prompt to a child session running that agent mode.

**Commands:**

- `/provider`, `/model` — Authenticate a provider, discover its models, and select one
- `/subagents` — Inspect, open, navigate, or cancel delegated child sessions
- `/diff` — Open tracked changes in the native unified/split diff viewer
- Click a user message — Copy, fork, resend, inspect changes, or safely revert that turn
- `/workspace` or `/worktrees` — Create, inspect, remove, and prune Git worktrees
- `/share`, `/unshare` — Create or remove a hosted redacted session link
- `/editor` — Open the current draft in `$VISUAL`, `$EDITOR`, or `settings.prompt.editor`
- `/quit` or `/exit` — Exit NIMBL (`Ctrl+C` twice also exits)

While a run is active, a submitted prompt is queued (or replaces the queue, per `settings.prompt.queue`) and runs after the current turn instead of being dropped. Ctrl+Up / Ctrl+Down navigate your previous prompt submissions.

Headless use:

```bash
nimbl run "explain this codebase" --provider openrouter --agent plan
nimbl --print "summarize README.md"
```

## Architecture

```
src/
├── tui-opencode.tsx         # Supported OpenTUI entry
├── tui-opencode-ui/         # Transcript, prompt, dialogs, sidebar
├── config.ts                # Config resolution (.env, CLI args)
└── core/                    # Agent, providers, sessions, tools, context

tests/                       # Unit, integration, and TUI smoke tests
```

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Bun (cross-platform)
- **AI:** Vercel AI SDK + OpenAI-compatible providers
- **Testing:** Vitest
- **Package:** source prerelease; npm publication is planned

## Development

### Prerequisites

- Bun 1.3.14+
- Node.js 18+ (for npm install)

### Setup

```bash
git clone https://github.com/jeremy341/NIMBL
cd NIMBL
bun install
```

### Run

```bash
bun run nimbl
```

### Test

```bash
bun test
```

### Type Check

```bash
bun run typecheck
```

## Token Accounting

NIMBL persists provider-reported usage per assistant request, including cache and reasoning details when available. It shows GPT-4o reference cost separately from estimated provider cost; provider cost is available only for models with dated catalog pricing.

Request budgeting uses exact OpenAI-family tokenizers and clearly labeled conservative estimates for other model families. It budgets system instructions, tools, history, summaries, attachments, project instructions, retrieval, output, protocol overhead, and safety margin, then automatically archives older turns into a structured summary near model limits. Context retrieval uses an ignore-aware lexical index, parser-backed structural chunks, dependency graphs, local/hosted semantic fusion, and model-aware token compression. Provider prompt caching, cache accounting, and reproducible retrieval ablations are implemented; comparative quality claims remain gated on benchmark results.

## Roadmap

The current prerelease includes the OpenTUI coding interface, streaming tools, permissions, persistent sessions, context visualization, and lightweight learning-state persistence.

Remaining work is tracked in the [AI Implementation Roadmap](./docs/AI_IMPLEMENTATION_ROADMAP.md). It separates release blockers, token infrastructure, retrieval, benchmarks, agents, teaching, TUI completion, and ecosystem work with acceptance criteria for AI coding agents.

## Environment Variables

```bash
# Provider Configuration
FREELLMAPI_KEY=          # FreeLLMAPI auto-router key
OPENROUTER_KEY=          # OpenRouter API key

# Optional Runtime Configuration
NIMBL_PROVIDER=openrouter  # Default: freellmapi
NIMBL_MODEL=               # Model override
NIMBL_SHARE_URL=           # Optional compatible hosted-sharing service base URL
```

## Providers

NIMBL currently uses a static provider catalog covering hosted services such as OpenRouter, OpenAI, Anthropic, Google AI Studio, Groq, Mistral, GitHub Models, and others. Hosted services require their corresponding credentials.

Ollama, LM Studio, and FreeLLM API are supported as local connectors, but their servers and models must be installed and running separately. Use `/provider` in the TUI to inspect the current catalog.

### Saved Provider Keys

Entering a key through the provider dialog saves it for future NIMBL runs, including when NIMBL is launched from another directory. Keys are stored as plaintext in `%APPDATA%\nimbl\config.json` on Windows and `~/.config/nimbl/config.json` on other platforms. Command-line keys take priority over environment variables, and environment variables take priority over saved keys.

## Security Boundary

NIMBL file tools are confined to canonical project paths and block environment files, repository internals, NIMBL state, common credential files, and private-key formats. Project skills are the narrow exception: the skill tool may read only the canonical `.nimbl/skills/<name>/SKILL.md` file it resolves, plus global skills in the OS config `nimbl/skills/` directory and any `skills.paths` directories.

Approved shell commands are not sandboxed. They run with the current user's permissions and can access files, processes, and networks outside the project. Review shell approvals as carefully as commands entered directly in a terminal.

Session data is project-local and stored in plaintext under `.nimbl/`. It can include prompts, reasoning, tool output, attachment expansions, request usage, approved file snapshots, parent/child session links, and hosted-share deletion tokens. `/share` sends a redacted transcript only to the explicitly configured `NIMBL_SHARE_URL`; NIMBL has no implicit sharing endpoint. Use `/unshare`, `/delete`, `/clear`, and `/export` deliberately, and do not put secrets into prompts or approved command output.

Saved provider keys are also plaintext. Protect the operating-system account that owns the global NIMBL config file and remove its `providerKeys` entries if a credential is revoked.

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License — See LICENSE file for details

## Support

- GitHub Issues: [Bug reports & feature requests](https://github.com/jeremy341/NIMBL/issues)
- Documentation: [Full research report](./docs/RESEARCH_REPORT.md)
- Roadmap: [AI implementation roadmap](./docs/AI_IMPLEMENTATION_ROADMAP.md)

---

**Made with  for Hack Club members and budget-conscious developers.**

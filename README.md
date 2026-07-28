# NIMBL — Token-Efficient AI Coding Companion

**Learn more. Use fewer tokens.**

NIMBL is a CLI-based AI coding companion built in TypeScript that helps you code while teaching you along the way. The current prerelease uses local lexical context selection and explicit context budgets; comparative token savings have not yet been benchmarked.

## Features

- ⚡ **Context-Conscious** — Selects focused excerpts locally instead of sending project-wide dumps
- 🎓 **Learning-Focused** — Explain and Learn modes encourage questions, hints, and practice
- 🔄 **Multi-Provider** — Works with the providers in NIMBL's configured provider catalog
- 🚀 **Lightweight CLI** — No bloat, keyboard-driven, terminal-native
- 🎨 **Black & Green Theme** — Inspired by `btop` and `lazygit`
- 💰 **Budget-Conscious** — Works with free tier models (Groq, Google, Mistral, etc.)

## Quick Start

### Installation

NIMBL is currently a source-distributed prerelease:

```bash
git clone https://github.com/jeremy341/NIMBL
cd NIMBL
bun install
bun run nimbl
```

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
nimbl
```

Or with custom provider/model:

```bash
nimbl --provider openrouter --model deepseek/deepseek-chat
```

### Usage

Launch `nimbl`, choose a provider and model, then use the OpenTUI prompt. Tab cycles Build, Plan, Explain, and Learn modes. Slash autocomplete exposes the active command set.

**Commands:**

- `/quit` or `/exit` — Exit NIMBL
- `Ctrl+C` — Exit NIMBL

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

NIMBL reports provider token usage and a hypothetical GPT-4o reference cost. It does not currently calculate actual provider billing or validated savings against competing products.

Current context reduction uses lexical file selection, bounded excerpts, and a limited conversation history. Semantic retrieval, dependency graphs, AST compression, provider prompt caching, and reproducible comparative benchmarks remain planned work.

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
```

## Providers

NIMBL currently uses a static provider catalog covering hosted services such as OpenRouter, OpenAI, Anthropic, Google AI Studio, Groq, Mistral, GitHub Models, and others. Hosted services require their corresponding credentials.

Ollama, LM Studio, and FreeLLM API are supported as local connectors, but their servers and models must be installed and running separately. Use `/provider` in the TUI to inspect the current catalog.

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

**Made with ❤️ for Hack Club members and budget-conscious developers.**

# NIMBL — Token-Efficient AI Coding Companion

**Learn more. Use fewer tokens.**

NIMBL is a CLI-based AI coding companion built in TypeScript that helps you code while teaching you along the way. It uses **10-50x fewer tokens** than existing tools like Cursor or Claude Code through intelligent context management and pedagogical design.

## Features

- ⚡ **Token-Efficient** — 5K-30K tokens per task vs 100K-500K for Cursor
- 🎓 **Learning-Focused** — Explains code, asks questions, tracks skill growth
- 🔄 **Multi-Provider** — Works with OpenRouter, FreeLLMAPI, and any OpenAI-compatible API
- 🚀 **Lightweight CLI** — No bloat, keyboard-driven, terminal-native
- 🎨 **Black & Green Theme** — Inspired by `btop` and `lazygit`
- 💰 **Budget-Conscious** — Works with free tier models (Groq, Google, Mistral, etc.)

## Quick Start

### Installation

```bash
npm install -g nimbl
# or
bunx nimbl
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

```
nimbl> Write a function that reverses a string

Here's a function that reverses a string in TypeScript:

function reverseString(str: string): string {
  return str.split('').reverse().join('');
}

⚡ 847 tokens · ~$0.0034 (vs GPT-4o)

nimbl>
```

**Commands:**

- `/quit` or `/exit` — Exit NIMBL
- `Ctrl+C` — Exit NIMBL

## Architecture

```
src/
├── index.ts                 # REPL entry point, CLI logo
├── config.ts                # Config resolution (.env, CLI args)
├── core/
│   ├── api.ts               # AI SDK wrapper + cost estimation
│   ├── types.ts             # Type definitions
│   └── provider-defaults.ts # Provider configuration
└── tests/
    ├── config.test.ts       # Config tests
    └── api.test.ts          # API tests
```

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Bun (cross-platform)
- **AI:** Vercel AI SDK + OpenAI-compatible providers
- **Testing:** Vitest
- **Package:** npm (`nimbl`) or `bunx`

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
FREELLMAPI_KEY=test-key bun run src/index.ts
```

### Test

```bash
bun test
```

### Type Check

```bash
bun run typecheck
```

## Cost Comparison

| Tool | Tokens per Task | Cost per Task |
|------|----------------|---------------|
| Cursor | 100K-500K | $0.50-$2.50 |
| Claude Code | 200K-1M | $3.00-$15.00 |
| GitHub Copilot | 50K-200K | $0.25-$1.00 |
| **NIMBL** | **5K-30K** | **$0.01-$0.15** |

Token savings achieved through:
1. **Context budgeting** — Aggressive truncation via AST compression
2. **Semantic search** — Only relevant code included
3. **Prompt caching** — Reuse static sections across requests
4. **Pedagogical design** — Questions > code generation

## Roadmap

### V0.1 (Current)
- ✅ REPL CLI with OpenRouter/FreeLLMAPI support
- ✅ Token cost estimation
- ✅ Multi-provider support
- ✅ Configuration system

### V0.2 (Planned)
- TUI integration via opencode (Ink-based)
- Context budget visualization
- Skill tree UI
- Learning state persistence

### V0.3+ (Future)
- Autonomous agent mode (Code Mode)
- Desktop app (Electron)
- Web interface
- IDE plugins (VS Code, JetBrains)

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

### Zero Setup (Keyless)

Works immediately with limited models:
- Pollinations API
- LLM7B
- Kilo

### Free Registration Required

~50 models available with free tier:
- Google AI Studio
- Groq
- Mistral
- Cerebras
- GitHub Models
- HuggingFace
- Cloudflare Workers AI

### Paid (Optional)

Full model access:
- OpenRouter ($5 free credits)
- OpenAI ($5 free trial)
- Anthropic

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

---

**Made with ❤️ for Hack Club members and budget-conscious developers.**


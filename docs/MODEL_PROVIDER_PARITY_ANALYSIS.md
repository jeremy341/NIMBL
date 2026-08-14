# NIMBL × opencode — Model & Provider Tab Analysis (OpenCode Go / Zen)

Date: 2026-08-14
Scope: read-only analysis. No code changed. *(Follow-up implementation landed — see "Implementation status" below.)*
References: local opencode clone `C:\Users\jerem\Documents\GITHUB\opencode` (packages/core/src + packages/schema/src), the live models.dev catalog (`~/.cache/opencode/models.json`, fetched from `https://models.dev/api.json`), and live provider endpoints (`https://opencode.ai/zen/v1/models` and `https://opencode.ai/zen/go/v1/models`) authenticated with the saved OpenCode Zen credential.

---

## Implementation status (follow-up)

All recommended fixes from §6 were implemented:

- **opencode-go endpoint/env fixed**: `baseURL` → `https://opencode.ai/zen/go/v1`, `envKey` → `OPENCODE_API_KEY`, with `OPENCODE_GO_API_KEY` kept as a `fallbackEnvKey`.
- **opencode-zen** keeps `/zen/v1`, env `OPENCODE_API_KEY` + legacy `OPENCODE_ZEN_API_KEY` fallback.
- **Static catalogs refreshed** from the live models.dev set (opencode-go now lists `deepseek-v4-flash`, `deepseek-v4-pro`, `kimi-k2.7-code`, `glm-5.3`, etc.; `minimax-m2.5` marked `deprecated`).
- **Live catalog overlay**: `applyLiveCatalog()` + `warmCatalog()` (pricing.ts) replace the static model list with live models.dev entries at startup — context windows, output limits, cost, capabilities, `status`, and `free` are now live-derived (verified: opencode-go 25 models/19 active; opencode-zen 91/62; `deepseek-v4-flash` 1M context).
- **Pricing alias** for `opencode-go` resolves directly (models.dev has an `opencode-go` key) and now benefits from live models.
- **TUI model dialog**: filters `deprecated`, disables `-nano` on opencode, shows live `Free` footer, and adds a "Popular providers" section when no provider is connected.
- **Default model** for opencode-go now skips deprecated (`kimi-k2.7-code` instead of `minimax-m2.5`).

See `src/core/providers.ts`, `src/core/pricing.ts`, `src/tui-opencode.tsx`, and `tests/provider-catalog.test.ts`.

---

## 1. TL;DR — what's actually wrong

The NIMBL **Model tab is driven by a hardcoded static catalog** (`src/core/providers.ts`), while opencode drives its provider/model list **dynamically** from two live sources: **models.dev** (the global catalog) and the **OpenCode Console `/api/config`** (per-account entitlement). The result:

| Aspect | NIMBL | opencode | Verdict |
|---|---|---|---|
| opencode-go model count (static list) | **3** (minimax-m2.5, glm-5.1, deepseek-v4-pro) | 25 (live) | **stale / wrong** |
| `deepseek-v4-flash` for opencode-go | **missing** | present (Go and Zen) | **bug** |
| opencode-go base URL | `https://opencode.ai/zen/v1` | `https://opencode.ai/zen/go/v1` | **wrong endpoint** |
| opencode-go env key | `OPENCODE_GO_API_KEY` | `OPENCODE_API_KEY` | **inconsistent** |
| model metadata (context, cost, caps) | static `defineModel` guess | live per-model cost/limit/caps | **stale** |
| deprecated models | shown | filtered out (`status: deprecated` → disabled) | **stale** |
| free-model tier | hardcoded `free` flag | `cost.input === 0` | **stale** |

---

## 2. How opencode handles OpenCode Go / Zen (the reference behavior)

### 2.1 Two live sources, merged into one catalog

1. **models.dev** — `packages/core/src/models-dev.ts`
   - Fetches `https://models.dev/api.json` (User-Agent `opencode/<version>`), caches to `~/.cache/opencode/models.json`, TTL 5 min, hourly background refresh (line 249–252).
   - Provides the full provider+model catalog: `id`, `name`, `api`, `env`, `npm`, and per-model `id`, `name`, `cost`, `limit`, `tool_call`, `reasoning`, `modalities`, `status`, `variants`, `release_date`.
   - The models.dev entry for `opencode-go` (verified in the cached catalog):
     - `api: https://opencode.ai/zen/go/v1`
     - `env: OPENCODE_API_KEY`
     - `npm: @ai-sdk/openai-compatible`
     - **25 models** including `deepseek-v4-flash`, `deepseek-v4-pro`, `kimi-k3`, `kimi-k2.7-code`, `qwen3.7-max`, `glm-5.3`, `mimo-v2.5`, `gpt-5.6-luna`, `grok-4.5`, etc.
   - The models.dev entry for `opencode` (Zen):
     - `api: https://opencode.ai/zen/v1`
     - `env: OPENCODE_API_KEY`
     - `npm: @ai-sdk/openai-compatible`
     - **91 models** (models.dev, including deprecated) — free tier (`deepseek-v4-flash-free`, `nemotron-3-ultra-free`, …) and paid (`claude-opus-5`, `gpt-5.6-*`, `deepseek-v4-pro`, `deepseek-v4-flash`, `grok-4.6`, `gemini-3.6-flash`, …). The live `/zen/v1/models` returns **45 currently-active** ids.

2. **OpenCode Console `/api/config`** — `packages/core/src/plugin/provider/opencode.ts`
   - When connected (OAuth device flow or API key), fetches `https://console.opencode.ai/api/config` with the bearer token (line 190–212).
   - The returned `ConfigV1.Info.provider` map **overrides** the catalog per account: renames providers, points `api`, applies headers/body, and **defines which models the account can actually use** (`model.enabled = config.status !== "deprecated"`, line 159).
   - So opencode shows exactly the models the logged-in account is entitled to — including Go-specific models — with live cost/limit/capability data.

### 2.2 How the TUI renders it (model/provider dialogs)

- `component/dialog-model.tsx`: builds options from the live catalog; groups **Favorites → Recent → provider-sorted**, plus **"Popular providers"** (first 6) when disconnected; marks `Free` when `cost.input === 0`; filters **deprecated** models (`deprecated → disabled`, line 71); appends `(Favorite)` descriptions; sorts by release date.
- `component/dialog-provider.tsx`: `providerOptions(list)` sorts by `PROVIDER_PRIORITY` (`opencode` 0, `opencode-go` 1, `openai` 2, `github-copilot` 3, `anthropic` 4, `google` 5, else 99), categories `Popular` / `Providers`, description hints `(Recommended)` / `(API key)` / `Low cost subscription for everyone`, and `✓` gutter when connected+onboarded.
- Provider connection uses OAuth (device code) or API-key; per-account entitlement drives the visible models.

### 2.3 Key reference values (models.dev, live)

| model | opencode-go id | context | output | input $/1M | output $/1M | cache_read | tool_call | reasoning | status |
|---|---|---|---|---|---|---|---|---|---|
| `deepseek-v4-flash` | `deepseek-v4-flash` | 1,000,000 | 384,000 | 0.07 | 0.14 | 0.0014 | yes | yes | active |
| `deepseek-v4-pro` | `deepseek-v4-pro` | 1,000,000 | 384,000 | 0.435 | 0.87 | 0.003625 | yes | yes | active |
| `deepseek-v4-flash-free` | (Zen) | 200,000 | 128,000 | 0 | 0 | 0 | yes | yes | active |
| `minimax-m2.5` | `minimax-m2.5` | 204,800 | 65,536 | 0.3 | 1.2 | 0.03 | yes | yes | **deprecated** |
| `glm-5.1` | `glm-5.1` | 202,752 | 32,768 | 1.4 | 4.4 | 0.26 | yes | yes | active |

The Go provider's deprecated set includes `qwen3.5-plus`, `glm-5`, `mimo-v2-pro`, `kimi-k2.5`, `minimax-m2.5`, `mimo-v2-omni` (from the catalog).

---

## 3. What NIMBL currently does

### 3.1 Static catalog (`src/core/providers.ts`)

```ts
compatible("opencode-zen", "OpenCode Zen", "OpenCode-tested coding models", "OPENCODE_ZEN_API_KEY", "https://opencode.ai/zen/v1", [
  { id: "deepseek-v4-flash-free", name: "DeepSeek V4 Flash Free", free: true, contextWindow: 128_000 },
  { id: "nemotron-3-ultra-free", name: "Nemotron 3 Ultra Free", free: true, contextWindow: 128_000 },
  { id: "minimax-m2.5", name: "MiniMax M2.5", contextWindow: 128_000 },
]),
compatible("opencode-go", "OpenCode Go", "OpenCode Go subscription", "OPENCODE_GO_API_KEY", "https://opencode.ai/zen/v1", [
  { id: "minimax-m2.5", name: "MiniMax M2.5", contextWindow: 128_000 },
  { id: "glm-5.1", name: "GLM 5.1", contextWindow: 128_000 },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", contextWindow: 128_000 },
]),
```

Problems:
- **Wrong base URL** for opencode-go: `/zen/v1` instead of `/zen/go/v1`. Discovery and health checks hit the Zen endpoint, so the *Go* model set is never returned. (NIMBL's `discoverProviderModels`/`checkProviderHealth` build the URL from `baseURL`.)
- **Wrong env key**: `OPENCODE_GO_API_KEY` vs opencode's `OPENCODE_API_KEY`.
- **Stale model list**: 3 models vs the live 25; missing `deepseek-v4-flash` entirely; includes `minimax-m2.5` which is **deprecated** on Go; `glm-5.1` is fine but with wrong context (202,752 not 128,000).
- **Stale context windows**: opencode-zen models hardcoded to 128,000, but live `deepseek-v4-flash-free` is 200,000 and `deepseek-v4-pro`/`deepseek-v4-flash` are 1,000,000.
- **Hardcoded `free` flag** instead of deriving from live cost (`cost.input === 0`).
- **`PROVIDER_PRIORITY`** (tui-opencode.tsx) puts opencode-zen at 0 and opencode-go at 1 — that part matches opencode's ordering, but the provider *description* `Low cost subscription for everyone` matches opencode's hint.

### 3.2 The TUI model dialog (`tui-opencode.tsx` `modelOptions`)

- Lists `provider.models` (static) + runtime `discoveredModels[provider.id]` from `/models` discovery.
- **Discovery is gated on a successful `/models` fetch.** With the wrong Go base URL, Go discovery returns the Zen model set, so even the "discovered from provider" rows are the wrong set. When the provider is rate-limited (the 429 case), discovery fails and only the 3 stale static rows show.
- Categories/Favorites/Recents exist, but there's no "Popular providers" section and no deprecated filtering.
- `Free` footer only shows for `model.free === true` static flag.

### 3.3 Pricing (`src/core/pricing.ts`)

- NIMBL **already fetches models.dev** (`loadCatalog`, 2h TTL, cached to `%LOCALAPPDATA%\nimbl\models.dev.json`) and resolves cost via `catalogPrice` with alias `opencode-zen → ["opencode", "opencode-zen"]` (line 67).
- **But** it only maps `opencode-zen` → `opencode`; there is **no alias for `opencode-go`**. models.dev has a distinct `opencode-go` key, so `catalogProvider(data, "opencode-go")` looks up `data["opencode-go"]` directly (line 67) — which exists. So Go pricing *would* resolve if the model id is in the catalog, but the static model list never includes the actually-usable Go models, and the wrong base URL prevents discovery from adding them.
- Context window used for budgeting comes from `resolveModel` (static), so even when pricing is live, the tokenizer/context budget uses stale values (e.g., 128k instead of 200k/1M).

### 3.4 Health / discovery (`provider-health.ts`, `credentials.ts`)

- `checkProviderHealth` hits `${baseURL}/${health.path}` = `/zen/v1/models` for both Zen and Go. For Go this returns the Zen set → health "healthy" but wrong discovery.
- `discoverProviderModels` same wrong-path issue.

---

## 4. Concrete symptom: "doesn't show deepseek v4 flash for opencode go"

Root cause chain:
1. NIMBL's opencode-go static list has only `minimax-m2.5`, `glm-5.1`, `deepseek-v4-pro`.
2. `deepseek-v4-flash` exists in the live Go catalog and the live `/zen/go/v1/models` response, but NIMBL never reaches that endpoint because `baseURL` is `/zen/v1`.
3. Even the fallback "discovered from provider" rows use the Zen endpoint, so they show the 45 Zen models, not the 25 Go models.
4. `catalogPrice` could resolve Go pricing from models.dev, but the model never appears in the list to be priced.

Verified live:
- `/zen/v1/models` → 45 models (Zen set), includes `deepseek-v4-flash`.
- `/zen/go/v1/models` → 25 models (Go set), includes `deepseek-v4-flash`, `deepseek-v4-pro`, `kimi-k3`, `glm-5.3`, etc.

---

## 5. Full difference matrix

| # | Surface | NIMBL current | opencode behavior | Impact |
|---|---|---|---|---|
| 5.1 | opencode-go baseURL | `https://opencode.ai/zen/v1` | `https://opencode.ai/zen/go/v1` | Wrong endpoint; discovery/health hit Zen |
| 5.2 | opencode-go env key | `OPENCODE_GO_API_KEY` | `OPENCODE_API_KEY` | Key config mismatch |
| 5.3 | opencode-go models | 3 static | 25 live | Missing `deepseek-v4-flash`, `kimi-k3`, `glm-5.3`, etc. |
| 5.4 | opencode-zen models | 3 static | 91 in models.dev (45 active live) | Missing `claude-opus-5`, `gpt-5.6-*`, `gemini-3.6-flash`, `deepseek-v4-pro`, `deepseek-v4-flash`, `grok-4.6`, etc. |
| 5.5 | model metadata (context) | static 128k | live 200k/1M per model | Wrong budget/tokenizer |
| 5.6 | cost | live models.dev for Zen only | live for all | Go models unpriced in list |
| 5.7 | free flag | hardcoded `free` | `cost.input === 0` | Stale free tier |
| 5.8 | deprecated models | shown | filtered/disabled | Stale list shows retired models |
| 5.9 | discovery source | `/models` only | models.dev + console `/api/config` | Per-account entitlement not honored |
| 5.10 | Popular providers section | absent | present (first 6) | Minor UX |
| 5.11 | Auth | API key only (PKCE primitives) | OAuth device flow + API key | Go entitlements need account auth |
| 5.12 | pricing alias | `opencode-zen → opencode` | — | Go alias needed for parity |

---

## 6. Recommended fixes (for the future, not applied here)

1. **Fix the opencode-go provider definition**: baseURL → `https://opencode.ai/zen/go/v1`, env key → `OPENCODE_API_KEY` (keep `OPENCODE_GO_API_KEY` as a fallback if desired).
2. **Refresh the static catalogs** to the current models.dev values (25 Go / current Zen), or better:
3. **Make the model list dynamic like opencode**: fetch `models.dev/api.json` (NIMBL's `pricing.ts` already fetches it — reuse that catalog to populate the model list, not just pricing). Derive `free`, context, cost, capabilities, and `status` from the catalog; drop `deprecated`.
4. **Add the `opencode-go` pricing alias** in `catalogProvider`.
5. **Optionally map NIMBL's `opencode-zen`/`opencode-go` IDs to the single models.dev `opencode`/`opencode-go` keys** and reuse live discovery so a fresh `/models` fetch backfills the list when offline/static.
6. **Filter deprecated models** in `modelOptions` and derive the `Free` footer from `cost.input === 0` (or the live catalog) rather than the static flag.
7. **Match opencode's dialog layout**: add the "Popular providers" section and per-account entitlement via console `/api/config` when a key is saved (out of scope for a simple fix).

---

## 7. Verification method

- models.dev catalog read from the opencode cache at `C:\Users\jerem\.cache\opencode\models.json` (providers `opencode`, `opencode-go`).
- Live endpoints queried with the saved OpenCode Zen credential:
  - `GET https://opencode.ai/zen/v1/models` → 45 ids
  - `GET https://opencode.ai/zen/go/v1/models` → 25 ids
- NIMBL source read: `src/core/providers.ts`, `src/core/pricing.ts`, `src/core/provider-health.ts`, `src/core/credentials.ts`, `src/tui-opencode.tsx` (`modelOptions`, `providerOptions`, `PROVIDER_PRIORITY`).
- opencode source read: `packages/core/src/models-dev.ts`, `packages/core/src/plugin/provider/opencode.ts`, `packages/core/src/v1/config/provider.ts`, `packages/schema/src/catalog.ts`, `packages/tui/src/component/dialog-model.tsx`, `dialog-provider.tsx`.

---

*This is an analysis document. No source files were changed.*

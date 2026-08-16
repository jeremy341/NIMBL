# NIMBL × opencode — Provider/Model Logic + Modal UI Analysis

Date: 2026-08-14
Scope: read-only. No code changed. *(Follow-up implementation landed — see "Implementation status" below.)*
References: NIMBL `src/core/{providers,routing,provider-health,credentials,pricing,config}.ts` + `src/tui-opencode.tsx` + `src/tui-opencode-ui/{dialogs,theme}.tsx`; opencode local clone `packages/core/src/{models-dev,provider,model,catalog}.ts`, `packages/core/src/plugin/provider/opencode.ts`, `packages/core/src/v1/config/provider.ts`, `packages/tui/src/{ui/dialog-select.tsx,component/dialog-model.tsx,component/dialog-provider.tsx}`.

This is two analyses: **(A) the provider/model logic** (how each provider is handled, OpenCode Go specifically) and **(B) the modal UI** (spacing, hover, connected badge, row rendering).

---

## Implementation status (follow-up)

Part D fixes implemented:

- **D1 — opencode-go**: `baseURL` → `https://opencode.ai/zen/go/v1`, `envKey` → `OPENCODE_API_KEY`, legacy `OPENCODE_GO_API_KEY` kept via `fallbackEnvKey`.
- **D2 — live model list**: new `applyLiveCatalog()` (providers.ts) + `warmCatalog()` (pricing.ts) overlay the static catalog with live models.dev data at startup. `free` is derived from `cost.input === 0`, context from live `limit.context`, deprecated models filtered, and `-nano` disabled on opencode. Verified live: opencode-go 25 models (19 active), opencode-zen 91 (62 active), `deepseek-v4-flash` at 1M context.
- **D3 — opencode-go pricing**: resolves from models.dev (`opencode-go` key) once models are live.
- **D4 — Popular providers**: the model dialog now shows a "Popular providers" section when no provider is connected; selecting one routes through the existing connect flow.
- **D6 — row renderer**: unchanged (already at parity).

Files: `src/core/providers.ts`, `src/core/pricing.ts`, `src/tui-opencode.tsx`, `tests/provider-catalog.test.ts`.

---

---

## PART A — Provider / model logic

### A1. How NIMBL models a provider today

`src/core/providers.ts` is a **single static array** `PROVIDERS` of `ProviderDefinition`:

```ts
interface ProviderDefinition {
  id, name, description, envKey, baseURL, protocol,
  models: ProviderModel[],   // static, hand-maintained
  headers?, local?, health, discovery
}
interface ProviderModel {
  id, name, free?, contextWindow, maxOutputTokens,
  tokenizer, capabilities, pricing?
}
```

Everything downstream is derived from this static array:
- `config.ts resolveConfig` → picks `provider`/`model`/`apiKey` from this list.
- `routing.ts rankProviders` → scores providers using the static models' `capabilities`, `free`, `pricing`.
- `provider-health.ts` / `credentials.ts discoverProviderModels` → hit `${baseURL}/${health.path}`.
- `pricing.ts catalogPrice` → **live** models.dev pricing, but only for models whose `id` matches the catalog.
- TUI `modelOptions`/`models()` → render the static list + any runtime-discovered ids.

### A2. How opencode models a provider

opencode **does not maintain a static model list**. The catalog is built from:

1. **models.dev** (`packages/core/src/models-dev.ts`): fetches `https://models.dev/api.json`, caches 5 min, hourly refresh. Each provider entry is `{ api, env, npm, id, name, models: { id -> { id, name, cost, limit, tool_call, reasoning, modalities, status, release_date, variants } } }`.
2. **OpenCode Console `/api/config`** (`plugin/provider/opencode.ts`): when authenticated, fetches `https://console.opencode.ai/api/config` with the bearer token; the returned `config.provider` map **overrides** catalog entries per account (name, api, headers/body, and per-model cost/limit/caps/status).
3. Per-model fields are merged into the catalog: `model.capabilities.tools/reasoning/input/output`, `model.limit.{context,input,output}`, `model.cost`, `model.status`, `model.enabled = status !== "deprecated"`, `model.variants`, `model.time.released`.

**Key difference:** NIMBL's model list is *data frozen at write-time*; opencode's is *live and account-scoped*.

### A3. OpenCode Go — the specific problem

From models.dev (verified) and live endpoints:

| | NIMBL opencode-go | models.dev opencode-go | opencode (Zen) |
|---|---|---|---|
| baseURL | `https://opencode.ai/zen/v1`  | `https://opencode.ai/zen/go/v1` | `https://opencode.ai/zen/v1` |
| env key | `OPENCODE_GO_API_KEY`  | `OPENCODE_API_KEY` | `OPENCODE_API_KEY` |
| model count | **3** (static) | **25** | **91** (45 active live) |
| `deepseek-v4-flash` | **missing** | present | present |
| `minimax-m2.5` | shown | **deprecated** (Go) | deprecated |
| `glm-5.1` | shown, ctx 128k | shown, ctx 202,752 | shown |

Consequences:
- Selecting opencode-go and connecting uses `/zen/v1` (Zen) for health + discovery, so the **Go model set is never returned**; NIMBL's fallback "discovered from provider" rows show the 45 Zen ids instead.
- `deepseek-v4-flash` (the flagship Go model) can never appear because it's neither in the static list nor discoverable through the wrong endpoint.
- The key prompt even points the user to `https://opencode.ai/go` (tui-opencode.tsx ~2293), which is correct — but the backend endpoint it dials is wrong.
- `minimax-m2.5` is deprecated on Go but NIMBL still lists it as a fresh option.
- `defaultModelFor("opencode-go")` returns `minimax-m2.5` (first static model) — a deprecated model as the default.

### A4. How each provider is handled (walk-through)

NIMBL handles every provider uniformly via the same 4 code paths; there is **no per-provider logic** like opencode's per-provider plugins:

1. **Credential** — `apiKey(providerID)` (tui-opencode.tsx:613): session key → `process.env[envKey]` → saved global key → `localFallbackKey` ("local" for local providers). 
   - Issue: `localFallbackKey` returns `"local"` for `ollama`/`lmstudio`/`freellmapi`, so they "work" without a key. Fine.
   - Issue: opencode-go's envKey is `OPENCODE_GO_API_KEY`, but opencode/Go both read `OPENCODE_API_KEY`. A user who set the documented `OPENCODE_API_KEY` env var (from opencode's README) won't be picked up by NIMBL's Go entry.
2. **Health/discovery** — `checkProviderHealth` + `discoverProviderModels` build `${baseURL}/${path}`. Wrong Go base → wrong set.
3. **Routing** — `rankProviders` scores on static `capabilities`/`free`/`pricing`. Because the static catalog has stale capabilities (e.g., no `deepseek-v4-flash` reasoning model to route to), routing quality is limited.
4. **Pricing** — `catalogPrice` fetches live models.dev. Alias map only covers `opencode-zen → ["opencode", "opencode-zen"]` (pricing.ts:67); `opencode-go` looks up `data["opencode-go"]` which exists, so Go pricing would work **if the model id were in the list**. But `resolveModel` still uses the static `contextWindow` for budgeting, so e.g. `deepseek-v4-pro`'s live 1M window is ignored in favor of the static 128k.

### A5. The TUI flow (provider → connect → model)

1. **Provider dialog** (`dialog === "provider"`): `providerOptions()` = all `PROVIDERS` sorted by `PROVIDER_PRIORITY` (opencode-zen 0, opencode-go 1, openai 2, github-models 3, anthropic 4, google 5), category `Popular`/`Providers`, `connected` boolean → renders a `✓` gutter (via `option.connected`). 
   - No "Other/custom provider" entry (opencode has one).
2. **Select a provider** → `selectProvider`: if no key → `dialog "connect"` (TextPromptDialog, secret, busy "Authenticating and discovering models..."). On submit `connectProvider` calls `discoverModels` then saves the key globally and opens the model dialog.
   - Issue: connect for opencode-go validates against the wrong endpoint.
   - Issue: the connect dialog's help text hardcodes only `opencode-zen` and `opencode-go`; other providers get the generic line.
3. **Model dialog** (`dialog === "model"`): `models()` memo → Favorites → Recent → everything else (provider category), `current` `●` marker, `Free` footer only for static `free` flag, `ctrl+f` favorite, `ctrl+a` connect-provider.
   - No "Popular providers" section when disconnected (opencode has it).
   - No deprecated filtering.
   - `flat` mode set — matching opencode's model dialog `flat`.

### A6. Logic comparison table

| Logic step | NIMBL | opencode |
|---|---|---|
| Catalog source | static array in code | models.dev (live) + console `/api/config` (per-account) |
| Provider identity | one array, no per-provider plugin | per-provider plugin (`plugin/provider/*.ts`) |
| Go endpoint | `/zen/v1` (wrong) | `/zen/go/v1` |
| Go env | `OPENCODE_GO_API_KEY` | `OPENCODE_API_KEY` |
| Model metadata | hand-authored | live cost/limit/caps/status/release |
| Deprecated models | shown | filtered (`status !== "deprecated"`) |
| Free tier | static `free` flag | `cost.input === 0` |
| Context window | static | live `limit.context` |
| Custom provider | none | "Other" + config-defined |
| OAuth | no (API key + PKCE primitives) | device-code OAuth + key |

---

## PART B — Modal UI (spacing, hover, connected badge)

### B1. The shared row renderer

Both use a `DialogSelect`-style list. Row structure (identical intent):

```
[● or ✓ or gutter]  Title + description          [footer]
```

**opencode (`dialog-select.tsx` Option, lines 731–790):**
- Row box: `paddingLeft={current() || option.gutter ? 1 : 3}`, `paddingRight={3}`, `gap={1}`.
- Active background: `actionFocused() ? theme.backgroundElement : (option.bg ?? theme.primary)`; inactive → `RGBA.fromInts(0,0,0,0)`.
- Current marker `●` shown **only when current && !gutter**.
- Gutter (e.g. `✓` for connected) shown when present.
- Title `paddingLeft={3}`; description inline muted; footer right-aligned muted.
- `selectedForeground(theme)` is contrast-computed for active text.

**NIMBL (`dialogs.tsx` SelectDialog, lines 365–404):**
- Row box: `paddingLeft={option.current || option.gutter || option.connected ? 1 : 3}`, `paddingRight={3}`, `gap={1}`.
- Active background: `active() ? theme.primary : undefined` (no action-focus distinction, no per-option `bg`).
- Current marker `●` shown **only when current && !gutter && !connected**.
- Gutter OR connected → `✓` (success) or the gutter string.
- Title `paddingLeft={3}`; description inline muted; footer right-aligned muted.
- Active text = `theme.selectedListItemText`; current-only = `theme.primaryForeground`.

**So the spacing/hover/connected layout is essentially a 1:1 port already.** Differences are subtle:

| # | Aspect | NIMBL | opencode | Note |
|---|---|---|---|---|
| B1.1 | Row left padding | 1 if current/gutter/connected else 3 | 1 if current/gutter else 3 | NIMBL also shifts for `connected` — fine, same visual result |
| B1.2 | Active bg | `theme.primary` | `theme.primary` (or `option.bg`/`backgroundElement` when action-focused) | NIMBL lacks `option.bg` and the action-focus muted state |
| B1.3 | Current `●` marker | hidden when connected/gutter | hidden when gutter | NIMBL additionally hides when `connected` — so a connected provider shows `✓` but no `●`; same in practice since `connected` implies the marker is replaced by `✓` |
| B1.4 | Connected badge | `✓` in `theme.success` (or `option.gutter`) | `✓` in `theme.success` via `gutter` fn | 1:1 |
| B1.5 | Hover/mouse | `onMouseMove`→mouse mode, `onMouseOver` follows only in mouse mode; row `onMouseDown` moves selection; `onMouseUp` selects | identical logic | 1:1 |
| B1.6 | Title/desc spacing | title `paddingLeft={3}`, desc inline `" "+desc` muted | identical | 1:1 |
| B1.7 | Footer alignment | right-aligned muted, `flat`+query shows category | identical | 1:1 |
| B1.8 | Active text color | `theme.selectedListItemText` | contrast `selectedForeground(theme)` | NIMBL uses explicit token (white); opencode computes contrast — NIMBL's token approach is fine for its dark theme |
| B1.9 | Details sub-rows | `paddingLeft/Right 3`, truncated middle to min(76, width-12) | identical | 1:1 |
| B1.10 | Category headers | `paddingLeft 3`, bold accent | identical | 1:1 |

### B2. Provider dialog specifics

| # | Aspect | NIMBL | opencode |
|---|---|---|---|
| B2.1 | Title | `"Connect a provider"` | `"Connect a provider"` — 1:1 |
| B2.2 | Row categories | `Popular` / `Providers` | `Popular` / `Providers` — 1:1 |
| B2.3 | Connected badge | `connected` → `✓` | `gutter: connected && onboarded() ? ✓` — close; NIMBL lacks the "onboarded" gate |
| B2.4 | Description hints | `(Recommended)`, `(API key)`, `Low cost subscription for everyone`, `(GitHub token)` | `(Recommended)` opencode, `(API key)` anthropic, `(ChatGPT Plus/Pro or API key)` openai, `Low cost subscription for everyone` opencode-go | NIMBL's openai hint is just `(API key)` (shorter); NIMBL adds `(GitHub token)` for github-models (opencode doesn't) |
| B2.5 | Footer | none per row | console org name for console-managed providers | NIMBL has no console-org concept |
| B2.6 | Custom provider | absent | `Other` → "Custom provider" | gap |
| B2.7 | Actions/footer hints | `ctrl+r reconnect`, `ctrl+d disconnect` | per-method auth (OAuth/API), nested "Select auth method" | NIMBL API-key only |
| B2.8 | Sort | `PROVIDER_PRIORITY` then name | same priority then name.lowercase then id | ~1:1 |

### B3. Model dialog specifics

| # | Aspect | NIMBL | opencode |
|---|---|---|---|
| B3.1 | Title | provider name when filtered, else `"Select model"` | provider name when filtered, else `"Select model"` — 1:1 |
| B3.2 | Sections | Favorites → Recent → rest | Favorites → Recent → rest → Popular providers (disconnected) | gap: no Popular-providers section |
| B3.3 | Free footer | static `model.free` | `cost.input === 0 && provider.id === "opencode"` | stale flag |
| B3.4 | Deprecated | shown | filtered | gap |
| B3.5 | `-nano` disabled | absent | `disabled: opencode && id.includes("-nano")` | gap |
| B3.6 | Favorite desc | `(Favorite)` | `(Favorite)` — 1:1 |
| B3.7 | Current `●` | `current: value === provider::model` | `current` from local.model | 1:1 |
| B3.8 | Actions | `ctrl+a connect provider`, `ctrl+f favorite` | `model.dialog.provider` (ctrl+a), `model.dialog.favorite` (ctrl+f) — 1:1 |
| B3.9 | Variants | absent | `DialogVariant` after select when variants exist | gap (opencode-only concept) |
| B3.10 | Release-date sort | none | `sortModelOptions` by release desc | minor |
| B3.11 | Search filter | substring/prefix | fuzzysort over title/category | NIMBL simpler |

### B4. Connect dialog (key entry)

| # | Aspect | NIMBL | opencode |
|---|---|---|---|
| B4.1 | Title | `"API key"` | provider-specific `ApiMethod` with `placeholder="API key"` |
| B4.2 | Description | generic "key saved globally…" + per-provider link (zen/go only) | provider-specific copy (`"OpenCode Zen gives you access…"`, `"OpenCode Go is a $10 per month subscription…"`) |
| B4.3 | Busy | `busyText="Authenticating and discovering models..."` + spinner | `busy` + `busyText ?? "Working..."` |
| B4.4 | Secret masking | custom `•` masking | OpenTUI textarea masking | equivalent |

---

## PART C — What "feels wrong" — root causes

1. **Stale static catalog + wrong Go endpoint** → Go shows 3 models, missing `deepseek-v4-flash`, defaulting to a deprecated model. This is the biggest "feels wrong."
2. **No live model metadata** → context windows (128k vs live 1M), capabilities, and free-tier flags are wrong, so budgeting and the `Free` footer lie.
3. **Deprecated models not filtered** → `minimax-m2.5` shows on Go; opencode hides it.
4. **No per-provider behavior** → every provider is an OpenAI-compatible "generic"; opencode has per-provider plugins, OAuth, console-org, and custom providers.
5. **Modal UI is largely correct** — spacing, hover-follows-mouse, `●` current marker, `✓` connected badge, footer alignment, and category headers match opencode. The UI *feel* issues come from **data** (few/old rows, wrong "Free" flags, missing Popular-providers section, missing deprecated filtering), not from row layout.

## PART D — Recommended fixes (documented only)

1. Fix `opencode-go` → `baseURL: https://opencode.ai/zen/go/v1`, env `OPENCODE_API_KEY` (fall back to `OPENCODE_GO_API_KEY`).
2. Derive the model list from live models.dev (NIMBL already fetches it in `pricing.ts`): populate `provider.models` from the catalog, set `free = cost.input === 0`, use live `limit.context`, filter `status === "deprecated"`, mark `-nano` disabled on opencode.
3. Add the `opencode-go` pricing alias (`catalogProvider`).
4. Add a "Popular providers" section in the model dialog when no provider is connected.
5. (Optional parity) Add a custom-provider "Other" row and the console `/api/config` per-account entitlement.
6. Keep the row renderer as-is — the modal spacing/hover/badge is already at parity.

---

*No source files were changed. Report generated from a read-only audit of both codebases and the live models.dev catalog.*

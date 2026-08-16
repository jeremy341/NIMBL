import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runAgent, type AgentEvent, type AgentRunOptions, type AgentRunResult } from "./agent"
import { benchmarkMetadata, benchmarkRunSeed, varianceSummary, type BenchmarkMetadata, type VarianceSummary } from "./benchmark"
import { createProjectContextIndex, type ProjectContextIndex } from "./context"
import { estimateReferenceCost } from "./api"
import { catalogPrice, estimateProviderCost } from "./pricing"
import { customProviderID, defaultModelFor, providerApiKey, resolveModel, type ProviderModel } from "./providers"
import { classifyTask } from "./task-classifier"

export type AgentBenchmarkMode = "none" | "lexical" | "hybrid" | "prompt-cache"

const MODE_OPTIONS: Record<AgentBenchmarkMode, { hybrid?: boolean; graph?: boolean; compression: "none" | "structural"; promptCache: boolean }> = {
  // No retrieval context at all — the baseline for "how many tokens does the
  // prompt itself cost". Exercises the full agent loop with an empty context.
  none: { graph: false, compression: "none", promptCache: false },
  // Lexical retrieval + structural compression (the current default).
  lexical: { graph: false, compression: "structural", promptCache: false },
  // Graph + lexical + structural compression.
  hybrid: { hybrid: true, graph: true, compression: "structural", promptCache: false },
  // Hybrid retrieval + prompt caching enabled (cache read/write token split).
  // Unlike `hybrid`, this opts into provider prompt caching, so the cache-aware
  // cost column is a real measured ablation rather than a duplicate run.
  "prompt-cache": { hybrid: true, graph: true, compression: "structural", promptCache: true },
}

export type AgentBenchmarkDifficulty = "easy" | "medium" | "hard"

export interface AgentBenchmarkVerifyCheck {
  type: "fileContains" | "fileAbsent" | "command" | "answerContains"
  /**
   * How the check is interpreted:
   * - `failToPass`: must fail on the unmodified fixture and pass on the solved run (golden test).
   * - `passToPass`: must pass both before and after (existing invariant must stay green).
   * - `plain`: no before/after contract, just graded on the run.
   */
  kind?: "failToPass" | "passToPass" | "plain"
  path?: string
  text?: string
  command?: string
}

export interface AgentBenchmarkTask {
  id: string
  /** The user prompt sent to the agent. */
  prompt: string
  /** Optional agent mode override (default build). */
  mode?: "build" | "plan" | "explain" | "learn"
  /** Tier/task-category tag, e.g. "retrieval" | "bug-fix" | "multi-file" | "test-writing" | "shell-loop" | "delegation" | "long-horizon". */
  tags?: string[]
  /** Difficulty bucket used for stratified reporting (SWE-bench Verified style). */
  difficulty?: AgentBenchmarkDifficulty
  /**
   * Ground-truth verifiers, all must pass for the task to count as solved.
   * - `fileContains`: a file (relative to the fixture root) must contain text
   * - `fileAbsent`: a file must not exist
   * - `command`: a shell command run in the fixture root that exits 0
   * - `answerContains`: the assistant's final text must contain a substring
   */
  verify: AgentBenchmarkVerifyCheck[]
}

export interface AgentBenchmarkRun {
  taskId: string
  mode: AgentBenchmarkMode
  seed: number
  /** All verifiers passed. */
  solved: boolean
  /** Number of verifiers that passed (out of total). */
  passedChecks: number
  totalChecks: number
  /** failToPass checks (must fail before / pass after). */
  passedBefore: boolean
  failedBefore: boolean
  inputTokens: number
  outputTokens: number
  totalTokens: number
  noCacheTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  referenceCostUsd: number
  providerCostUsd?: number
  latencyMs: number
  attempts: number
  toolSteps: number
  finishReason?: string
  /** Sprint C: task family chosen by the classifier (telemetry only). */
  family?: string
  /** Sprint C: effective per-run step budget (classified, ceiling-clamped). */
  maxToolSteps?: number
  retrievalTokens: number
  retrievalCandidates: number
  answer: string
  telemetry: Record<string, unknown>
  /** Optional task metadata joined into each run for stratified reporting. */
  difficulty?: AgentBenchmarkDifficulty
  tags?: string[]
}

export interface AgentBenchmarkSummary {
  taskId: string
  solved: boolean
  totalTokens: VarianceSummary
  inputTokens: VarianceSummary
  outputTokens: VarianceSummary
  cacheReadTokens: VarianceSummary
  referenceCostUsd: VarianceSummary
  latencyMs: VarianceSummary
  toolSteps: VarianceSummary
  samples: number
}

export function loadAgentBenchmarkTasks(corpusRoot: string): AgentBenchmarkTask[] {
  const file = join(corpusRoot, "agent-tasks.json")
  const raw = JSON.parse(readFileSync(file, "utf8")) as { tasks?: AgentBenchmarkTask[] }
  if (!Array.isArray(raw.tasks) || raw.tasks.length === 0) throw new Error(`Agent benchmark corpus ${file} must define a non-empty tasks array.`)
  return raw.tasks
}

export function gradeTask(root: string, task: AgentBenchmarkTask, answer: string): { passed: number; total: number; passedBefore: boolean; failedBefore: boolean } {
  let passed = 0
  let f2pCount = 0
  let f2pPassed = 0
  let p2pCount = 0
  let p2pPassed = 0
  for (const check of task.verify) {
    let ok = false
    if (check.type === "fileContains") {
      const file = join(root, check.path || "")
      ok = existsSync(file) && readFileSync(file, "utf8").includes(check.text || "")
    } else if (check.type === "fileAbsent") {
      ok = !existsSync(join(root, check.path || ""))
    } else if (check.type === "command") {
      const result = spawnSync(check.command || "", { cwd: root, shell: true, encoding: "utf8" })
      ok = result.status === 0
    } else if (check.type === "answerContains") {
      ok = answer.includes(check.text || "")
    }
    if (check.kind === "failToPass") {
      // F2P: the golden must have been red on the pristine fixture (verified by
      // `gradeTaskBaseline`), then green on the run. passedBefore reflects the
      // before-contract per kind, not an arbitrary aggregate of all checks.
      f2pCount++
      if (ok) f2pPassed++
    } else if (check.kind === "passToPass") {
      p2pCount++
      if (ok) p2pPassed++
    }
    if (ok) passed++
  }
  return {
    passed,
    total: task.verify.length,
    // All passToPass invariants held on the run (they also must hold on the
    // pristine fixture, which `gradeTaskBaseline` re-checks independently).
    passedBefore: p2pCount > 0 && p2pPassed === p2pCount,
    // The task declares at least one golden that must have been red before;
    // the authoritative before-state is gradeTaskBaseline.f2pInitiallyRed.
    failedBefore: f2pCount > 0,
  }
}

/**
 * Run every verifier against the pristine fixture to establish the before-state
 * contract. The first run always passes (nothing to grade), but we need the
 * result to verify F2P tests are actually red on the unmodified repo.
 */
export function gradeTaskBaseline(root: string, task: AgentBenchmarkTask): { failToPassCount: number; passToPassCount: number; f2pInitiallyRed: boolean } {
  let failToPassCount = 0
  let passToPassCount = 0
  let f2pRed = 0
  let f2pTotal = 0
  for (const check of task.verify) {
    if (check.kind === "failToPass") {
      f2pTotal++
      let ok = false
      if (check.type === "fileContains") {
        const file = join(root, check.path || "")
        ok = existsSync(file) && readFileSync(file, "utf8").includes(check.text || "")
      } else if (check.type === "fileAbsent") {
        ok = !existsSync(join(root, check.path || ""))
      } else if (check.type === "command") {
        const result = spawnSync(check.command || "", { cwd: root, shell: true, encoding: "utf8" })
        ok = result.status === 0
      } else if (check.type === "answerContains") {
        ok = false
      }
      if (!ok) f2pRed++
      failToPassCount++
    } else if (check.kind === "passToPass") {
      let ok = false
      if (check.type === "fileContains") {
        const file = join(root, check.path || "")
        ok = existsSync(file) && readFileSync(file, "utf8").includes(check.text || "")
      } else if (check.type === "fileAbsent") {
        ok = !existsSync(join(root, check.path || ""))
      } else if (check.type === "command") {
        const result = spawnSync(check.command || "", { cwd: root, shell: true, encoding: "utf8" })
        ok = result.status === 0
      } else if (check.type === "answerContains") {
        ok = false
      }
      if (ok) passToPassCount++
    }
  }
  return { failToPassCount, passToPassCount, f2pInitiallyRed: f2pRed === f2pTotal }
}

/** The synthetic agent used by benchmarks: deterministic, no live provider. */
export function createSyntheticAgent(options: {
  /** Fixed token accounting to report per call (input/output). */
  inputTokens?: number
  outputTokens?: number
  /** Tool calls to perform before answering (drive the real tool implementations). */
  tools?: Array<{ name: string; args: Record<string, unknown> }>
  /** Text answer produced after tool calls. */
  answer: string
}) {
  const inputTokens = options.inputTokens ?? 100
  const outputTokens = options.outputTokens ?? 50
  return (params: any) => {
    const fullStream: any = {
      async *[Symbol.asyncIterator]() {
        for (let index = 0; index < (options.tools ?? []).length; index++) {
          const tool = options.tools![index]!
          yield { type: "tool-call", toolName: tool.name, input: tool.args, toolCallId: `bench-tool-${index}` }
          const toolDef = params.tools?.[tool.name]
          let output = "ok"
          if (toolDef?.execute) {
            try {
              const result = await toolDef.execute(tool.args, {})
              output = typeof result === "string" ? result : JSON.stringify(result)
            } catch (error) {
              output = `Error: ${error instanceof Error ? error.message : String(error)}`
            }
          }
          yield { type: "tool-result", toolCallId: `bench-tool-${index}`, output }
        }
        yield { type: "text-delta", text: options.answer }
      },
    }
    return {
      fullStream,
      usage: Promise.resolve({
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        inputTokenDetails: { cacheReadTokens: 0, cacheWriteTokens: 0, noCacheTokens: inputTokens },
        outputTokenDetails: { textTokens: outputTokens, reasoningTokens: 0 },
      }),
    }
  }
}

const SYNTHETIC_AGENTS: Record<string, (task: AgentBenchmarkTask) => ReturnType<typeof createSyntheticAgent>> = {
  "read-config": (task) => createSyntheticAgent({
    answer: "The configured maximum retry count is 3.",
    tools: [{ name: "read", args: { path: "src/config.ts" } }],
  }),
  "theme-config": (task) => createSyntheticAgent({
    answer: "The theme is dark and the feature uses 3 retries.",
    tools: [{ name: "read", args: { path: "src/config.ts" } }, { name: "read", args: { path: "src/features/feature.ts" } }],
  }),
  "add-helper": (task) => createSyntheticAgent({
    answer: "compute([1,2,3]) returns 6.",
    tools: [{ name: "read", args: { path: "src/utils.ts" } }],
  }),
  "feature-summary": (task) => createSyntheticAgent({
    answer: "summarize maps each item; a two-item report contains 2 items.",
    tools: [{ name: "read", args: { path: "src/features/feature.ts" } }],
  }),
  "update-config": (task) => createSyntheticAgent({
    answer: "MAX_RETRIES is now 5.",
    tools: [
      { name: "edit", args: { path: "src/config.ts", oldText: "export const MAX_RETRIES = 3", newText: "export const MAX_RETRIES = 5" } },
    ],
  }),
  "run-tests": (task) => createSyntheticAgent({
    answer: "The feature test passes.",
    tools: [{ name: "bash", args: { command: "bun test ./tests/feature-check.ts" } }],
  }),
}

function defaultSyntheticAgent(task: AgentBenchmarkTask) {
  const factory = SYNTHETIC_AGENTS[task.id]
  return factory ? factory(task) : createSyntheticAgent({ answer: "Done.\n" + task.id })
}

export interface RunAgentBenchmarkOptions {
  corpusRoot: string
  tasks?: AgentBenchmarkTask[]
  taskIds?: string[]
  modes?: AgentBenchmarkMode[]
  seed?: number
  samples?: number
  provider?: string
  model?: string
  apiKey?: string
  /** When set, run against the real provider; otherwise use the synthetic agent. */
  live?: boolean
  /** Whole-run retries per (task, sample, mode) on transient provider failure (live only). */
  runRetries?: number
  /** Delay between whole-run retries in ms (live only). */
  runRetryWaitMs?: number
  /**
   * Max (task, sample, mode) runs in flight at once. Default 1 (deterministic).
   * Parallel runs share the per-mode context index (safe: no watcher, build
   * completes before runs start) and a shared 429 gate so backoffs coordinate.
   */
  concurrency?: number
  /**
   * Global cap on model API requests per minute across all workers (live only).
   * Each run issues roughly one request per tool step, so a naive concurrency of
   * N can burst N×steps/min and trip provider rate limits (a shared proxy like
   * netic caps at ~100 req/min across all clients). Defaults to 60 to stay
   * conservatively under the cap; transient 429s are retried by the run loop.
   */
  requestsPerMinute?: number
  /** Optional synthetic-agent factory override for tests. */
  synthetic?: (task: AgentBenchmarkTask, mode: AgentBenchmarkMode) => any
}
interface BenchmarkWorkItem {
  task: AgentBenchmarkTask
  mode: AgentBenchmarkMode
  runSeed: number
  sample: number
}

interface BenchmarkShared {
  fixtureRoot: string
  provider: string
  model: string
  apiKey: string
  live: boolean
  runRetries: number
  runRetryWaitMs: number
  modelDefinition: ProviderModel
  synthetic: (task: AgentBenchmarkTask, mode: AgentBenchmarkMode) => any
  indexByMode: Map<AgentBenchmarkMode, ProjectContextIndex | undefined>
  gradeTaskBaselineRef: Record<string, { failToPassCount: number; passToPassCount: number; f2pInitiallyRed: boolean }>
  gate: { waitIfOpen(): Promise<void>; trip(): void }
  limiter: { waitForToken(): Promise<void> }
  priceMemo: Map<string, ReturnType<typeof catalogPrice> | undefined>
}

type FailedRun = { ok: false; message: string }
type OkRun = { ok: true; text: string; usage: AgentRunResult["usage"]; attempts: number; latencyMs: number; finishReason?: string; family?: string; maxToolSteps?: number; budget: AgentRunResult["budget"]; retrieval: AgentRunResult["retrieval"] }

/** Run items through a bounded worker pool, preserving completion order only per-item. */
async function runWithConcurrency<T>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  const limit = Math.max(1, Math.min(concurrency, items.length))
  let next = 0
  const lanes = Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await worker(item)
    }
  })
  await Promise.all(lanes)
}

/** Shared circuit breaker: any worker that hits 429/5xx trips the gate, and all
 * workers wait for the cooldown so parallel retries don't re-throttle each other. */
function createRateGate(cooldownMs = 10_000): { waitIfOpen(): Promise<void>; trip(): void } {
  let openUntil = 0
  return {
    async waitIfOpen() {
      const remaining = openUntil - Date.now()
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
    },
    trip() {
      openUntil = Math.max(openUntil, Date.now() + cooldownMs)
    },
  }
}

/**
 * Token-bucket limiter shared by every live worker. Every model request (each
 * tool step issues one) awaits a token, so aggregate request rate never bursts
 * past `requestsPerMinute` regardless of concurrency. This is what keeps all the
 * parallel lanes under the provider's per-minute cap.
 */
function createRequestLimiter(requestsPerMinute: number): { waitForToken(): Promise<void> } {
  const intervalMs = 60_000 / Math.max(1, requestsPerMinute)
  let lastIssuedAt = 0
  return {
    async waitForToken() {
      const now = Date.now()
      const target = Math.max(lastIssuedAt + intervalMs, now)
      const delay = target - now
      lastIssuedAt = target
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    },
  }
}

export async function runAgentBenchmark(options: RunAgentBenchmarkOptions): Promise<AgentBenchmarkRun[]> {
  let tasks = options.tasks || loadAgentBenchmarkTasks(options.corpusRoot)
  if (options.taskIds?.length) tasks = tasks.filter((task) => options.taskIds!.includes(task.id))
  const fixtureRoot = join(options.corpusRoot, "fixture")
  if (!existsSync(fixtureRoot)) throw new Error(`Agent benchmark fixture ${fixtureRoot} does not exist.`)
  const modes: AgentBenchmarkMode[] = options.modes || ["hybrid"]
  const seed = options.seed ?? 20260728
  const samples = options.samples ?? 1
  const concurrency = options.concurrency ?? 1
  const customProvider = customProviderID()
  const provider = options.provider || process.env.NIMBL_PROVIDER || customProvider || "freellmapi"
  const model = options.model || process.env.NIMBL_MODEL || (customProvider ? process.env.NIMBL_CUSTOM_MODEL || "" : "") || defaultModelFor(provider)
  const apiKey = options.apiKey || (options.live ? providerApiKey(provider) : "")
  const runs: AgentBenchmarkRun[] = []
  const indexByMode = new Map<AgentBenchmarkMode, ProjectContextIndex | undefined>()
  const gradeTaskBaselineRef: Record<string, { failToPassCount: number; passToPassCount: number; f2pInitiallyRed: boolean }> = {}
  try {
    for (const mode of modes) {
      // `none` still gets a shared (graphless, cacheless) index so its runs do
      // not fall back to `selectProjectContextWithBudget`'s per-workspace default
      // index (which would leak one unclosed index per run).
      indexByMode.set(mode, createProjectContextIndex(fixtureRoot, MODE_OPTIONS[mode]))
    }
    for (const task of tasks) {
      const staleDirectory = join(tmpdir(), `nimbl-bench-baseline-${task.id}`)
      mkdirSync(staleDirectory, { recursive: true })
      cpSync(fixtureRoot, staleDirectory, { recursive: true })
      gradeTaskBaselineRef[task.id] = gradeTaskBaseline(staleDirectory, task)
    }
    const modelDefinition = resolveModel(provider, model, Number(process.env.NIMBL_CONTEXT_WINDOW) || undefined)
    const shared: BenchmarkShared = {
      fixtureRoot,
      provider,
      model,
      apiKey,
      live: Boolean(options.live),
      runRetries: options.runRetries ?? 3,
      runRetryWaitMs: options.runRetryWaitMs ?? 15_000,
      modelDefinition,
      synthetic: options.synthetic || defaultSyntheticAgent,
      indexByMode,
      gradeTaskBaselineRef,
      gate: createRateGate(),
      limiter: createRequestLimiter(options.requestsPerMinute ?? 60),
      priceMemo: new Map(),
    }
    const items: BenchmarkWorkItem[] = []
    for (const task of tasks) {
      for (let sample = 0; sample < samples; sample++) {
        const runSeed = benchmarkRunSeed(seed + sample, task.id)
        for (const mode of modes) items.push({ task, mode, runSeed, sample })
      }
    }
    await runWithConcurrency(items, concurrency, async (item) => {
      const run = await runBenchmarkItem(shared, item)
      runs.push(run)
    })
  } finally {
    for (const index of indexByMode.values()) index?.close()
  }
  return runs
}

/** Execute one (task, sample, mode) run in an isolated workspace and return its record. */
async function runBenchmarkItem(shared: BenchmarkShared, item: BenchmarkWorkItem): Promise<AgentBenchmarkRun> {
  const { task, mode, runSeed, sample } = item
  const { fixtureRoot, provider, model, apiKey, modelDefinition, indexByMode, gradeTaskBaselineRef } = shared
  const live = shared.live
  const started = Date.now()
  const maxRunAttempts = live ? shared.runRetries + 1 : 1
  const retryWaitMs = shared.runRetryWaitMs
  let workspace = ""
  let events: AgentEvent[] = []
  let subagentRuns: { id: string; prompt: string; agent?: string; childSteps: number; inputTokens: number; outputTokens: number; totalTokens: number; cacheReadTokens: number; cacheWriteTokens: number; latencyMs: number }[] = []
  let outcome: OkRun | FailedRun | undefined
  for (let runAttempt = 1; runAttempt <= maxRunAttempts; runAttempt++) {
    // Fresh copy per (task, sample, mode, attempt) so edits never leak.
    workspace = join(tmpdir(), `nimbl-bench-${task.id}-${runSeed}-${mode}${runAttempt > 1 ? `-r${runAttempt}` : ""}`)
    mkdirSync(workspace, { recursive: true })
    cpSync(fixtureRoot, workspace, { recursive: true })
    events = []
    subagentRuns = []
    const delegateTask: NonNullable<AgentRunOptions["delegateTask"]> = async (request) => {
      const childStart = Date.now()
      const childEvents: AgentEvent[] = []
      try {
        // Sprint C+: children whose prompt already enumerates the files to read
        // (explicit paths) get a tight retrieval limit — project-wide selection
        // would re-pay the parent's context cost on every child step. Research
        // children are capped at 8 tool steps: traces never exceed 6.
        const explicitPaths = (request.prompt.match(/[\w./-]+\.(tsx?|jsx?|json|md)\b/g) || []).filter((path) => path.includes("/")).length
        const child = await runAgent({
          root: workspace,
          provider,
          model,
          apiKey,
          mode: request.agent || task.mode || "build",
          messages: [{ role: "user", text: request.prompt }],
          contextWindow: modelDefinition.contextWindow,
          contextIndex: indexByMode.get(mode),
          retrievalLimit: explicitPaths >= 2 ? 2 : 4,
          compression: MODE_OPTIONS[mode].compression,
          promptCache: MODE_OPTIONS[mode].promptCache,
          permissions: { "*": "allow", doom_loop: "deny" },
          requestApproval: async () => "once",
          onEvent: (event) => childEvents.push(event),
          streamTextOverride: live ? undefined : shared.synthetic(task, mode),
          beforeRequest: live ? () => shared.limiter.waitForToken() : undefined,
          // Sprint C: a delegated child classifies its own prompt, but its budget
          // is capped by the parent task's per-class budget so a research child
          // can never out-spend the run that hired it. Research children never
          // need more than 8 turns (traces use 3-6).
          maxToolSteps: Math.min(8, classifyTask(request.prompt).maxToolSteps, classifyTask(task.prompt, task.tags).maxToolSteps),
          maxAttempts: live ? 5 : undefined,
          retryDelayMs: live ? 2_000 : undefined,
        })
        // Child sessions cost their own tokens; fold them into the run so
        // subagent overhead is not hidden (and show up in the raw log).
        events.push({ kind: "subagent", prompt: request.prompt } as unknown as AgentEvent)
        for (const event of childEvents) events.push({ ...event, kind: "subagent" as const, child: request.id } as unknown as AgentEvent)
        subagentRuns.push({
          id: request.id, prompt: request.prompt, agent: request.agent,
          childSteps: childEvents.filter((event) => event.kind === "tool" && event.state === "completed").length,
          inputTokens: child.usage.inputTokens, outputTokens: child.usage.outputTokens,
          totalTokens: child.usage.totalTokens, cacheReadTokens: child.usage.cacheReadTokens || 0,
          cacheWriteTokens: child.usage.cacheWriteTokens || 0, latencyMs: child.latencyMs,
        })
        return child.text
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`
      }
    }
    const agentOptions: AgentRunOptions = {
      root: workspace,
      provider,
      model,
      apiKey,
      mode: task.mode || "build",
      messages: [{ role: "user", text: task.prompt }],
      contextWindow: modelDefinition.contextWindow,
      contextIndex: indexByMode.get(mode),
      compression: MODE_OPTIONS[mode].compression,
      promptCache: MODE_OPTIONS[mode].promptCache,
      permissions: { "*": "allow", doom_loop: "deny" },
      requestApproval: async () => "once",
      onEvent: (event) => events.push(event),
      delegateTask,
      streamTextOverride: live ? undefined : shared.synthetic(task, mode),
      beforeRequest: live ? () => shared.limiter.waitForToken() : undefined,
      // Sprint C: no flat 8-step cap — the classifier picks the per-task family
      // budget from the cohort's ground-truth tags (single source of truth: the
      // same code path production uses).
      taskTags: task.tags,
      maxAttempts: live ? 5 : undefined,
      retryDelayMs: live ? 2_000 : undefined,
    }
    // Wait for any in-flight cooldown opened by another parallel worker before
    // issuing a request, so backoffs are shared rather than additive.
    await shared.gate.waitIfOpen()
    outcome = await runAgent(agentOptions).then((result): OkRun => ({ ok: true, text: result.text, usage: result.usage, attempts: result.attempts, latencyMs: result.latencyMs, finishReason: result.finishReason, family: result.family, maxToolSteps: result.maxToolSteps, budget: result.budget, retrieval: result.retrieval })).catch((error): FailedRun => ({ ok: false, message: error instanceof Error ? error.message : String(error) }))
    if (outcome.ok || runAttempt === maxRunAttempts) break
    // Transient provider outage (5xx/429/network). Trip the shared gate so other
    // parallel workers back off too, wait, then retry the whole run on a fresh
    // workspace so the sample isn't zeroed out.
    if (/5\d\d|429|401|rate limit|too many requests|overloaded|handling many requests|retry in a few seconds|ECONN|ETIMEDOUT|EAI_AGAIN|fetch failed/i.test(outcome.message)) {
      console.error(`[retry] ${task.id}/${mode} sample ${sample} attempt ${runAttempt} failed (${outcome.message.slice(0, 80)}); waiting ${retryWaitMs}ms`)
      shared.gate.trip()
      await new Promise((resolve) => setTimeout(resolve, retryWaitMs))
      continue
    }
    break
  }
  if (outcome === undefined) outcome = { ok: false, message: "run loop did not execute" }
  const finalOutcome: OkRun | FailedRun = outcome
  const failed = !finalOutcome.ok
  const answer = failed ? "" : finalOutcome.text
  const grade = gradeTask(workspace, task, answer)
  const retrievalTokens = !failed ? Number(finalOutcome.budget.retrieval || 0) : 0
  // Only fetch live pricing in live mode; synthetic runs must not hit
  // the network or mutate the shared catalog (which would pollute the
  // static provider pricing used by other modules). Memoize per (provider, model)
  // so parallel runs share a single catalog fetch.
  const price = !failed && live ? await (() => {
    const key = `${provider}|${model}`
    const memo = shared.priceMemo.get(key)
    if (memo) return memo
    const promise = catalogPrice(provider, model, modelDefinition).catch(() => undefined)
    shared.priceMemo.set(key, promise)
    return promise
  })() : undefined
  const providerCost = !failed && price ? estimateProviderCost(price, finalOutcome.usage).usd : undefined
  const subagentTokens = subagentRuns.reduce((sum, child) => sum + child.totalTokens, 0)
  const subagentInput = subagentRuns.reduce((sum, child) => sum + child.inputTokens, 0)
  const subagentOutput = subagentRuns.reduce((sum, child) => sum + child.outputTokens, 0)
  const subagentCache = subagentRuns.reduce((sum, child) => sum + child.cacheReadTokens + child.cacheWriteTokens, 0)
  const toolHistogram: Record<string, number> = {}
  const toolEvents = events.filter((event) => event.kind === "tool")
  for (const event of toolEvents) toolHistogram[event.tool] = (toolHistogram[event.tool] || 0) + 1
  return {
    taskId: task.id,
    mode,
    seed: runSeed,
    solved: !failed && grade.passed === grade.total,
    passedChecks: grade.passed,
    totalChecks: grade.total,
    passedBefore: grade.passedBefore,
    failedBefore: grade.failedBefore,
    inputTokens: failed ? 0 : finalOutcome.usage.inputTokens + subagentInput,
    outputTokens: failed ? 0 : finalOutcome.usage.outputTokens + subagentOutput,
    totalTokens: failed ? 0 : finalOutcome.usage.totalTokens + subagentTokens,
    noCacheTokens: failed ? 0 : (finalOutcome.usage.noCacheTokens || 0) + Math.max(0, subagentInput - subagentCache + subagentOutput),
    cacheReadTokens: failed ? 0 : (finalOutcome.usage.cacheReadTokens || 0) + subagentRuns.reduce((sum, child) => sum + child.cacheReadTokens, 0),
    cacheWriteTokens: failed ? 0 : (finalOutcome.usage.cacheWriteTokens || 0) + subagentRuns.reduce((sum, child) => sum + child.cacheWriteTokens, 0),
    referenceCostUsd: failed ? 0 : estimateReferenceCost(finalOutcome.usage.inputTokens + subagentInput, finalOutcome.usage.outputTokens + subagentOutput),
    providerCostUsd: providerCost,
    latencyMs: Date.now() - started,
    attempts: failed ? 0 : finalOutcome.attempts,
    toolSteps: toolEvents.length,
    finishReason: failed ? undefined : finalOutcome.finishReason,
    family: failed ? undefined : finalOutcome.family,
    maxToolSteps: failed ? undefined : finalOutcome.maxToolSteps,
    retrievalTokens,
    retrievalCandidates: !failed && Array.isArray(finalOutcome.retrieval?.candidates) ? finalOutcome.retrieval.candidates.length : 0,
    answer,
    difficulty: task.difficulty,
    tags: task.tags,
    telemetry: {
      failed,
      error: failed ? finalOutcome.message : undefined,
      subagentRuns,
      subagentTokens,
      toolHistogram,
      eventCount: events.length,
      rawEvents: events,
      baseline: gradeTaskBaselineRef[task.id] ?? undefined,
    },
  }
}

export function summarizeAgentBenchmarkRuns(runs: AgentBenchmarkRun[]): Record<string, AgentBenchmarkSummary> {
  const byTask = new Map<string, AgentBenchmarkRun[]>()
  for (const run of runs) {
    const bucket = byTask.get(run.taskId)
    if (bucket) bucket.push(run)
    else byTask.set(run.taskId, [run])
  }
  const summary: Record<string, AgentBenchmarkSummary> = {}
  for (const [taskId, taskRuns] of byTask) {
    summary[taskId] = {
      taskId,
      solved: taskRuns.every((run) => run.solved),
      totalTokens: varianceSummary(taskRuns.map((run) => run.totalTokens)),
      inputTokens: varianceSummary(taskRuns.map((run) => run.inputTokens)),
      outputTokens: varianceSummary(taskRuns.map((run) => run.outputTokens)),
      cacheReadTokens: varianceSummary(taskRuns.map((run) => run.cacheReadTokens)),
      referenceCostUsd: varianceSummary(taskRuns.map((run) => run.referenceCostUsd)),
      latencyMs: varianceSummary(taskRuns.map((run) => run.latencyMs)),
      toolSteps: varianceSummary(taskRuns.map((run) => run.toolSteps)),
      samples: taskRuns.length,
    }
  }
  return summary
}

/**
 * Cross-mode aggregation used to answer "does mode X use fewer tokens than the
 * baseline without regressing task quality?" Only lowers token usage when the
 * task still solves.
 */
export function summarizeAgentBenchmarkModes(runs: AgentBenchmarkRun[]): Record<AgentBenchmarkMode, { solved: number; total: number; totalTokens: VarianceSummary; cacheReadTokens: VarianceSummary; referenceCostUsd: VarianceSummary; latencyMs: VarianceSummary; toolSteps: VarianceSummary; runs: number }> {
  const byMode = new Map<AgentBenchmarkMode, AgentBenchmarkRun[]>()
  for (const run of runs) {
    const bucket = byMode.get(run.mode)
    if (bucket) bucket.push(run)
    else byMode.set(run.mode, [run])
  }
  const summary = {} as Record<AgentBenchmarkMode, { solved: number; total: number; totalTokens: VarianceSummary; cacheReadTokens: VarianceSummary; referenceCostUsd: VarianceSummary; latencyMs: VarianceSummary; toolSteps: VarianceSummary; runs: number }>
  for (const [mode, modeRuns] of byMode) {
    summary[mode] = {
      solved: modeRuns.filter((run) => run.solved).length,
      total: modeRuns.length,
      totalTokens: varianceSummary(modeRuns.map((run) => run.totalTokens)),
      cacheReadTokens: varianceSummary(modeRuns.map((run) => run.cacheReadTokens)),
      referenceCostUsd: varianceSummary(modeRuns.map((run) => run.referenceCostUsd)),
      latencyMs: varianceSummary(modeRuns.map((run) => run.latencyMs)),
      toolSteps: varianceSummary(modeRuns.map((run) => run.toolSteps)),
      runs: modeRuns.length,
    }
  }
  return summary
}

export interface AgentBenchmarkFamilySummary {
  family: string
  solved: number
  total: number
  totalTokens: VarianceSummary
  referenceCostUsd: VarianceSummary
  latencyMs: VarianceSummary
  toolSteps: VarianceSummary
  maxToolSteps: number
  runs: number
}

/**
 * Per-family aggregation (Sprint C). Family comes from the run record; older
 * records fall back to the cohort tags so historical runs stay comparable.
 * This is what lets the token claim be restated per category instead of as
 * one headline number.
 */
export function summarizeAgentBenchmarkFamilies(runs: AgentBenchmarkRun[]): Record<string, AgentBenchmarkFamilySummary> {
  const byFamily = new Map<string, AgentBenchmarkRun[]>()
  for (const run of runs) {
    const family = run.family ?? classifyTask("", run.tags).family
    const bucket = byFamily.get(family)
    if (bucket) bucket.push(run)
    else byFamily.set(family, [run])
  }
  const summary: Record<string, AgentBenchmarkFamilySummary> = {}
  for (const [family, familyRuns] of byFamily) {
    summary[family] = {
      family,
      solved: familyRuns.filter((run) => run.solved).length,
      total: familyRuns.length,
      totalTokens: varianceSummary(familyRuns.map((run) => run.totalTokens)),
      referenceCostUsd: varianceSummary(familyRuns.map((run) => run.referenceCostUsd)),
      latencyMs: varianceSummary(familyRuns.map((run) => run.latencyMs)),
      toolSteps: varianceSummary(familyRuns.map((run) => run.toolSteps)),
      maxToolSteps: Math.round(familyRuns.reduce((total, run) => total + (run.maxToolSteps ?? 0), 0) / familyRuns.length),
      runs: familyRuns.length,
    }
  }
  return summary
}

export { benchmarkMetadata }
export type { BenchmarkMetadata }

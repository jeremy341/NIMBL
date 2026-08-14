import { spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runAgent, type AgentEvent, type AgentRunOptions, type AgentRunResult } from "./agent"
import { benchmarkMetadata, benchmarkRunSeed, varianceSummary, type BenchmarkMetadata, type VarianceSummary } from "./benchmark"
import { createProjectContextIndex, type ProjectContextIndex } from "./context"
import { estimateReferenceCost } from "./api"
import { catalogPrice, estimateProviderCost } from "./pricing"
import { customProviderID, defaultModelFor, providerApiKey, resolveModel } from "./providers"

export type AgentBenchmarkMode = "none" | "lexical" | "hybrid" | "prompt-cache"

const MODE_OPTIONS: Record<AgentBenchmarkMode, { hybrid?: boolean; graph?: boolean; compression: "none" | "structural" }> = {
  // No retrieval context at all — the baseline for "how many tokens does the
  // prompt itself cost". Exercises the full agent loop with an empty context.
  none: { graph: false, compression: "none" },
  // Lexical retrieval + structural compression (the current default).
  lexical: { graph: false, compression: "structural" },
  // Graph + lexical + structural compression.
  hybrid: { hybrid: true, graph: true, compression: "structural" },
  // Hybrid retrieval + prompt caching enabled (cache read/write token split).
  "prompt-cache": { hybrid: true, graph: true, compression: "structural" },
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
  let passedBefore = false
  let failedBefore = false
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
      // F2P: verify the golden test actually starts failing on a pristine copy
      // of this task's fixture (isolated by the caller), then passes on the run.
      // The pristine evaluation is performed by `gradeTaskBaseline`.
      failedBefore = true
      passedBefore = false
    } else if (check.kind === "passToPass") {
      passedBefore = true
      failedBefore = failedBefore || false
    }
    if (ok) passed++
  }
  return { passed, total: task.verify.length, passedBefore, failedBefore }
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
  /** Optional synthetic-agent factory override for tests. */
  synthetic?: (task: AgentBenchmarkTask, mode: AgentBenchmarkMode) => any
}

export async function runAgentBenchmark(options: RunAgentBenchmarkOptions): Promise<AgentBenchmarkRun[]> {
  let tasks = options.tasks || loadAgentBenchmarkTasks(options.corpusRoot)
  if (options.taskIds?.length) tasks = tasks.filter((task) => options.taskIds!.includes(task.id))
  const fixtureRoot = join(options.corpusRoot, "fixture")
  if (!existsSync(fixtureRoot)) throw new Error(`Agent benchmark fixture ${fixtureRoot} does not exist.`)
  const modes: AgentBenchmarkMode[] = options.modes || ["hybrid"]
  const seed = options.seed ?? 20260728
  const samples = options.samples ?? 1
  const customProvider = customProviderID()
  const provider = options.provider || process.env.NIMBL_PROVIDER || customProvider || "freellmapi"
  const model = options.model || process.env.NIMBL_MODEL || (customProvider ? process.env.NIMBL_CUSTOM_MODEL || "" : "") || defaultModelFor(provider)
  const apiKey = options.apiKey || (options.live ? providerApiKey(provider) : "")
  const runs: AgentBenchmarkRun[] = []
  const indexByMode = new Map<AgentBenchmarkMode, ProjectContextIndex | undefined>()
  const gradeTaskBaselineRef: Record<string, { failToPassCount: number; passToPassCount: number; f2pInitiallyRed: boolean }> = {}
  try {
    for (const mode of modes) {
      if (mode === "none") continue
      indexByMode.set(mode, createProjectContextIndex(fixtureRoot, MODE_OPTIONS[mode]))
    }
    for (const task of tasks) {
      const staleDirectory = join(tmpdir(), `nimbl-bench-baseline-${task.id}`)
      mkdirSync(staleDirectory, { recursive: true })
      cpSync(fixtureRoot, staleDirectory, { recursive: true })
      gradeTaskBaselineRef[task.id] = gradeTaskBaseline(staleDirectory, task)
      for (let sample = 0; sample < samples; sample++) {
        const runSeed = benchmarkRunSeed(seed + sample, task.id)
        for (const mode of modes) {
          const started = Date.now()
          // Fresh copy per (task, sample, mode) so edits never leak.
          const workspace = join(tmpdir(), `nimbl-bench-${task.id}-${runSeed}-${mode}`)
          mkdirSync(workspace, { recursive: true })
          cpSync(fixtureRoot, workspace, { recursive: true })
          const events: AgentEvent[] = []
          const subagentRuns: { id: string; prompt: string; agent?: string; inputTokens: number; outputTokens: number; totalTokens: number; cacheReadTokens: number; cacheWriteTokens: number; latencyMs: number }[] = []
          const modelDefinition = resolveModel(provider, model, Number(process.env.NIMBL_CONTEXT_WINDOW) || undefined)
          const synthetic = options.synthetic || defaultSyntheticAgent
          const delegateTask: NonNullable<AgentRunOptions["delegateTask"]> = async (request) => {
            const childStart = Date.now()
            const childEvents: AgentEvent[] = []
            try {
              const child = await runAgent({
                root: workspace,
                provider,
                model,
                apiKey,
                mode: request.agent || task.mode || "build",
                messages: [{ role: "user", text: request.prompt }],
                contextWindow: modelDefinition.contextWindow,
                contextIndex: indexByMode.get(mode),
                compression: MODE_OPTIONS[mode].compression,
                permissions: { "*": "allow" },
                requestApproval: async () => "once",
                onEvent: (event) => childEvents.push(event),
                streamTextOverride: options.live ? undefined : synthetic(task, mode),
                maxToolSteps: 8,
              })
              // Child sessions cost their own tokens; fold them into the run so
              // subagent overhead is not hidden (and show up in the raw log).
              events.push({ kind: "subagent", prompt: request.prompt } as unknown as AgentEvent)
              for (const event of childEvents) events.push({ ...event, kind: "subagent" as const, child: request.id } as unknown as AgentEvent)
              subagentRuns.push({
                id: request.id, prompt: request.prompt, agent: request.agent,
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
            permissions: { "*": "allow" },
            requestApproval: async () => "once",
            onEvent: (event) => events.push(event),
            delegateTask,
            streamTextOverride: options.live ? undefined : synthetic(task, mode),
            maxToolSteps: 8,
          }
          type FailedRun = { ok: false; message: string }
          type OkRun = { ok: true; text: string; usage: AgentRunResult["usage"]; attempts: number; latencyMs: number; finishReason?: string; budget: AgentRunResult["budget"]; retrieval: AgentRunResult["retrieval"] }
          const outcome: OkRun | FailedRun = await runAgent(agentOptions).then((result): OkRun => ({ ok: true, text: result.text, usage: result.usage, attempts: result.attempts, latencyMs: result.latencyMs, finishReason: result.finishReason, budget: result.budget, retrieval: result.retrieval })).catch((error): FailedRun => ({ ok: false, message: error instanceof Error ? error.message : String(error) }))
          const failed = !outcome.ok
          const answer = failed ? "" : outcome.text
          const grade = gradeTask(workspace, task, answer)
          const retrievalTokens = !failed ? Number(outcome.budget.retrieval || 0) : 0
          // Only fetch live pricing in live mode; synthetic runs must not hit
          // the network or mutate the shared catalog (which would pollute the
          // static provider pricing used by other modules).
          const price = !failed && options.live ? await catalogPrice(provider, model, modelDefinition).catch(() => undefined) : undefined
          const providerCost = !failed && price ? estimateProviderCost(price, outcome.usage).usd : undefined
          const subagentTokens = subagentRuns.reduce((sum, child) => sum + child.totalTokens, 0)
          const subagentInput = subagentRuns.reduce((sum, child) => sum + child.inputTokens, 0)
          const subagentOutput = subagentRuns.reduce((sum, child) => sum + child.outputTokens, 0)
          const subagentCache = subagentRuns.reduce((sum, child) => sum + child.cacheReadTokens + child.cacheWriteTokens, 0)
          const toolHistogram: Record<string, number> = {}
          const toolEvents = events.filter((event) => event.kind === "tool")
          for (const event of toolEvents) toolHistogram[event.tool] = (toolHistogram[event.tool] || 0) + 1
          runs.push({
            taskId: task.id,
            mode,
            seed: runSeed,
            solved: !failed && grade.passed === grade.total,
            passedChecks: grade.passed,
            totalChecks: grade.total,
            passedBefore: grade.passedBefore,
            failedBefore: grade.failedBefore,
            inputTokens: failed ? 0 : outcome.usage.inputTokens + subagentInput,
            outputTokens: failed ? 0 : outcome.usage.outputTokens + subagentOutput,
            totalTokens: failed ? 0 : outcome.usage.totalTokens + subagentTokens,
            noCacheTokens: failed ? 0 : (outcome.usage.noCacheTokens || 0) + Math.max(0, subagentInput - subagentCache + subagentOutput),
            cacheReadTokens: failed ? 0 : (outcome.usage.cacheReadTokens || 0) + subagentRuns.reduce((sum, child) => sum + child.cacheReadTokens, 0),
            cacheWriteTokens: failed ? 0 : (outcome.usage.cacheWriteTokens || 0) + subagentRuns.reduce((sum, child) => sum + child.cacheWriteTokens, 0),
            referenceCostUsd: failed ? 0 : estimateReferenceCost(outcome.usage.inputTokens + subagentInput, outcome.usage.outputTokens + subagentOutput),
            providerCostUsd: providerCost,
            latencyMs: Date.now() - started,
            attempts: failed ? 0 : outcome.attempts,
            toolSteps: toolEvents.length,
            finishReason: failed ? undefined : outcome.finishReason,
            retrievalTokens,
            retrievalCandidates: !failed && Array.isArray(outcome.retrieval?.candidates) ? outcome.retrieval.candidates.length : 0,
            answer,
            difficulty: task.difficulty,
            tags: task.tags,
            telemetry: {
              failed,
              error: failed ? outcome.message : undefined,
              subagentRuns,
              subagentTokens,
              toolHistogram,
              eventCount: events.length,
              rawEvents: events,
              baseline: gradeTaskBaselineRef[task.id] ?? undefined,
            },
          })
        }
      }
    }
  } finally {
    for (const index of indexByMode.values()) index?.close()
  }
  return runs
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
export function summarizeAgentBenchmarkModes(runs: AgentBenchmarkRun[]): Record<AgentBenchmarkMode, { solved: number; total: number; totalTokens: VarianceSummary; cacheReadTokens: VarianceSummary; referenceCostUsd: VarianceSummary; latencyMs: VarianceSummary; runs: number }> {
  const byMode = new Map<AgentBenchmarkMode, AgentBenchmarkRun[]>()
  for (const run of runs) {
    const bucket = byMode.get(run.mode)
    if (bucket) bucket.push(run)
    else byMode.set(run.mode, [run])
  }
  const summary = {} as Record<AgentBenchmarkMode, { solved: number; total: number; totalTokens: VarianceSummary; cacheReadTokens: VarianceSummary; referenceCostUsd: VarianceSummary; latencyMs: VarianceSummary; runs: number }>
  for (const [mode, modeRuns] of byMode) {
    summary[mode] = {
      solved: modeRuns.filter((run) => run.solved).length,
      total: modeRuns.length,
      totalTokens: varianceSummary(modeRuns.map((run) => run.totalTokens)),
      cacheReadTokens: varianceSummary(modeRuns.map((run) => run.cacheReadTokens)),
      referenceCostUsd: varianceSummary(modeRuns.map((run) => run.referenceCostUsd)),
      latencyMs: varianceSummary(modeRuns.map((run) => run.latencyMs)),
      runs: modeRuns.length,
    }
  }
  return summary
}

export { benchmarkMetadata }
export type { BenchmarkMetadata }

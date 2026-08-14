import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs"
import { join } from "node:path"
import { createProjectContextIndex, type ProjectContextIndex } from "./context"

export interface BenchmarkTask {
  id: string
  query: string
  relevant: string[]
  limit?: number
  budgetChars?: number
}

export interface RetrievalEvaluation {
  precisionAtK: number
  recallAtK: number
  mrr: number
  firstRelevantRank: number | null
}

export interface RetrievalRun {
  taskId: string
  mode: string
  seed: number
  selectedPaths: string[]
  evaluation: RetrievalEvaluation
  estimatedTokens: number
  excerptChars: number
  latencyMs: number
  telemetry: Record<string, unknown>
}

export interface BenchmarkMetadata {
  timestamp: string
  seed: number
  gitRevision: string
  gitDirty: boolean
  nimblVersion: string
  provider: string
  model: string
  contextWindow: number
  cacheState: string
}

export type RetrievalMode = "none" | "lexical" | "structural" | "graph" | "semantic" | "hybrid" | "prompt-cache"

const MODE_OPTIONS: Record<RetrievalMode, { hybrid?: boolean; graph?: boolean }> = {
  none: { graph: false },
  lexical: { graph: false },
  structural: { graph: false },
  graph: { graph: true },
  semantic: { hybrid: true, graph: false },
  hybrid: { hybrid: true, graph: true },
  "prompt-cache": { hybrid: true, graph: true },
}

export function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function evaluateRetrieval(paths: string[], relevant: string[], k: number): RetrievalEvaluation {
  const top = paths.slice(0, k)
  const hits = top.filter((path) => relevant.includes(path))
  const firstRelevantRank = top.findIndex((path) => relevant.includes(path))
  return {
    precisionAtK: k > 0 ? hits.length / k : 0,
    recallAtK: relevant.length > 0 ? hits.length / relevant.length : 0,
    mrr: firstRelevantRank >= 0 ? 1 / (firstRelevantRank + 1) : 0,
    firstRelevantRank: firstRelevantRank >= 0 ? firstRelevantRank + 1 : null,
  }
}

export interface VarianceSummary {
  mean: number
  variance: number
  stdDev: number
  min: number
  max: number
  samples: number
}

export function varianceSummary(values: number[]): VarianceSummary {
  if (!values.length) return { mean: 0, variance: 0, stdDev: 0, min: 0, max: 0, samples: 0 }
  const mean = values.reduce((total, value) => total + value, 0) / values.length
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length
  return { mean, variance, stdDev: Math.sqrt(variance), min: Math.min(...values), max: Math.max(...values), samples: values.length }
}

export function benchmarkMetadata(partial: Partial<BenchmarkMetadata> = {}): BenchmarkMetadata {
  const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", cwd: process.cwd() })
  const porcelain = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8", cwd: process.cwd() })
  const packageJSON = existsSync(join(process.cwd(), "package.json")) ? JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) : {}
  return {
    timestamp: new Date().toISOString(),
    seed: 20260728,
    gitRevision: git.status === 0 ? git.stdout.trim() : "unknown",
    gitDirty: porcelain.status === 0 && porcelain.stdout.trim().length > 0,
    nimblVersion: String(packageJSON.version || "0.0.0"),
    provider: process.env.NIMBL_PROVIDER || "freellmapi",
    model: process.env.NIMBL_MODEL || "auto",
    contextWindow: Number(process.env.NIMBL_CONTEXT_WINDOW) || 128_000,
    cacheState: process.env.NIMBL_BENCH_COLD === "1" ? "cold" : "warm",
    ...partial,
  }
}

export function loadBenchmarkTasks(corpusRoot: string): BenchmarkTask[] {
  const file = join(corpusRoot, "tasks.json")
  const raw = JSON.parse(readFileSync(file, "utf8")) as { tasks?: BenchmarkTask[] }
  if (!Array.isArray(raw.tasks) || raw.tasks.length === 0) throw new Error(`Benchmark corpus ${file} must define a non-empty tasks array.`)
  return raw.tasks
}

export function benchmarkRunSeed(seed: number, taskId: string) {
  return Math.floor(mulberry32(seed)() * 0xffffff)
}

export async function runRetrievalBenchmark(options: {
  corpusRoot: string
  tasks?: BenchmarkTask[]
  modes?: RetrievalMode[]
  seed?: number
  budgetChars?: number
  limit?: number
  samples?: number
}): Promise<RetrievalRun[]> {
  const tasks = options.tasks || loadBenchmarkTasks(options.corpusRoot)
  const fixtureRoot = join(options.corpusRoot, "fixture")
  if (!existsSync(fixtureRoot)) throw new Error(`Benchmark fixture ${fixtureRoot} does not exist.`)
  const modes: RetrievalMode[] = options.modes || ["lexical", "graph", "hybrid"]
  const seed = options.seed ?? 20260728
  const samples = options.samples ?? 1
  const runs: RetrievalRun[] = []
  const indexByMode = new Map<string, ProjectContextIndex>()
  try {
    for (const mode of modes) indexByMode.set(mode, createProjectContextIndex(fixtureRoot, MODE_OPTIONS[mode]))
    for (const task of tasks) {
      for (let sample = 0; sample < samples; sample++) {
        const runSeed = benchmarkRunSeed(seed + sample, task.id)
        for (const mode of modes) {
          const started = Date.now()
          const selection = mode === "none" ? { items: [], estimatedTokens: 0, telemetry: { mode: "none", rationale: ["retrieval disabled"] } } : await indexByMode.get(mode)!.select(task.query, task.limit ?? options.limit ?? 8, task.budgetChars ?? options.budgetChars ?? 30_000)
          runs.push({
            taskId: task.id,
            mode,
            seed: runSeed,
            selectedPaths: selection.items.map((item) => item.path),
            evaluation: evaluateRetrieval(selection.items.map((item) => item.path), task.relevant, task.limit ?? options.limit ?? 8),
            estimatedTokens: selection.estimatedTokens,
            excerptChars: selection.items.reduce((total, item) => total + item.excerpt.length, 0),
            latencyMs: Date.now() - started,
            telemetry: selection.telemetry as unknown as Record<string, unknown>,
          })
        }
      }
    }
  } finally {
    for (const index of indexByMode.values()) index.close()
  }
  return runs
}

export interface AblationSummary { mode: string; quality: number; precisionAtK: number; recallAtK: number; mrr: number; estimatedTokens: number; latencyMs: number; qualityRegression: boolean; claim: "eligible" | "ineligible" }

/** Runs every retrieval configuration and only marks token savings as eligible when quality does not regress. */
export async function runRetrievalAblations(options: Omit<Parameters<typeof runRetrievalBenchmark>[0], "modes"> & { modes?: RetrievalMode[] }): Promise<AblationSummary[]> {
  const runs = await runRetrievalBenchmark({ ...options, modes: options.modes || ["none", "lexical", "structural", "graph", "semantic", "hybrid", "prompt-cache"] })
  const summary = summarizeBenchmarkRuns(runs); const baseline = summary.lexical?.mrr.mean ?? 0
  return Object.entries(summary).map(([mode, values]) => { const quality = (values.precisionAtK.mean + values.recallAtK.mean + values.mrr.mean) / 3; const qualityRegression = values.mrr.mean + 0.0001 < baseline; return { mode, quality, precisionAtK: values.precisionAtK.mean, recallAtK: values.recallAtK.mean, mrr: values.mrr.mean, estimatedTokens: values.estimatedTokens.mean, latencyMs: values.latencyMs.mean, qualityRegression, claim: qualityRegression ? "ineligible" : "eligible" } })
}

export function defensibleClaims(results: AblationSummary[]) {
  const lexical = results.find((item) => item.mode === "lexical"); const claims: { mode: string; tokenReduction: number; quality: number; eligible: boolean; reason: string }[] = []
  if (!lexical) return claims
  for (const result of results) claims.push({ mode: result.mode, tokenReduction: lexical.estimatedTokens ? 1 - result.estimatedTokens / lexical.estimatedTokens : 0, quality: result.quality, eligible: result.claim === "eligible" && result.quality >= lexical.quality, reason: result.qualityRegression ? "quality regressed against lexical baseline" : "quality meets or exceeds lexical baseline" })
  return claims
}

export function appendBenchmarkRecords(file: string, records: RetrievalRun[] | RetrievalRun) {
  mkdirSync(join(file, ".."), { recursive: true })
  const lines = (Array.isArray(records) ? records : [records]).map((record) => JSON.stringify(record))
  appendFileSync(file, lines.join("\n") + (lines.length ? "\n" : ""), "utf8")
}

export function readBenchmarkRecords(file: string): RetrievalRun[] {
  if (!existsSync(file)) return []
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as RetrievalRun)
}

export function summarizeBenchmarkRuns(runs: RetrievalRun[]): Record<string, { precisionAtK: VarianceSummary; recallAtK: VarianceSummary; mrr: VarianceSummary; estimatedTokens: VarianceSummary; latencyMs: VarianceSummary; runs: number }> {
  const byMode = new Map<string, RetrievalRun[]>()
  for (const run of runs) {
    const bucket = byMode.get(run.mode)
    if (bucket) bucket.push(run)
    else byMode.set(run.mode, [run])
  }
  const summary: Record<string, { precisionAtK: VarianceSummary; recallAtK: VarianceSummary; mrr: VarianceSummary; estimatedTokens: VarianceSummary; latencyMs: VarianceSummary; runs: number }> = {}
  for (const [mode, modeRuns] of byMode) {
    summary[mode] = {
      precisionAtK: varianceSummary(modeRuns.map((run) => run.evaluation.precisionAtK)),
      recallAtK: varianceSummary(modeRuns.map((run) => run.evaluation.recallAtK)),
      mrr: varianceSummary(modeRuns.map((run) => run.evaluation.mrr)),
      estimatedTokens: varianceSummary(modeRuns.map((run) => run.estimatedTokens)),
      latencyMs: varianceSummary(modeRuns.map((run) => run.latencyMs)),
      runs: modeRuns.length,
    }
  }
  return summary
}

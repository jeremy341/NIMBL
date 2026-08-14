import { join } from "node:path"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { runAgentBenchmark, summarizeAgentBenchmarkModes, type AgentBenchmarkRun } from "../src/core/agent-benchmark"
import { runOpencodeBenchmark } from "../src/core/opencode-benchmark"
import { registerCustomProvider } from "../src/core/providers"
import { appendBenchmarkRecords, benchmarkMetadata } from "../src/core/benchmark"

const corpusRoot = process.env.NIMBL_BENCH_CORPUS ? join(process.cwd(), process.env.NIMBL_BENCH_CORPUS) : join(import.meta.dir, "corpus")
const resultsDir = join(process.cwd(), ".nimbl", "benchmarks")
const seed = process.env.NIMBL_BENCH_SEED ? Number(process.env.NIMBL_BENCH_SEED) : 20260728
const samples = process.env.NIMBL_BENCH_SAMPLES ? Number(process.env.NIMBL_BENCH_SAMPLES) : 1
const live = process.env.NIMBL_BENCH_LIVE === "1" || Boolean(process.env.NIMBL_CUSTOM_BASE_URL || process.env.OPENCODE_BENCH_BASE_URL)
const nimblModes = (process.env.NIMBL_BENCH_MODES || "hybrid").split(",") as AgentBenchmarkRun["mode"][]
const taskIds = (process.env.NIMBL_BENCH_TASKS || "").split(",").map((id) => id.trim()).filter(Boolean)

// Optional custom OpenAI-compatible endpoint (e.g. a free proxy): set
// OPENCODE_BENCH_BASE_URL / OPENCODE_BENCH_API_KEY / OPENCODE_BENCH_PROVIDER
// / OPENCODE_BENCH_MODEL. When set, the SAME endpoint is registered as a NIMBL
// custom provider so both harnesses run the identical model live.
const baseURL = process.env.OPENCODE_BENCH_BASE_URL
const apiKey = process.env.OPENCODE_BENCH_API_KEY
const providerId = process.env.OPENCODE_BENCH_PROVIDER
const customProvider = baseURL && apiKey && providerId ? { providerId, baseURL, apiKey } : undefined

if (customProvider) {
  // NIMBL custom provider env vars mirror the opencode ones so both sides are
  // configured identically (unless NIMBL_PROVIDER was set explicitly).
  process.env.NIMBL_CUSTOM_BASE_URL ??= baseURL
  process.env.NIMBL_CUSTOM_API_KEY ??= apiKey
  process.env.NIMBL_CUSTOM_PROVIDER ??= providerId
  const modelID = process.env.OPENCODE_BENCH_MODEL?.split("/").at(-1) ?? process.env.NIMBL_CUSTOM_MODEL
  if (modelID) process.env.NIMBL_CUSTOM_MODEL ??= modelID
}
registerCustomProvider()

const opencodeModel = process.env.OPENCODE_BENCH_MODEL || process.env.NIMBL_MODEL || "deepseek/deepseek-chat"

if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true })

const meta = benchmarkMetadata({ seed, cacheState: process.env.NIMBL_BENCH_COLD === "1" ? "cold" : "warm" })
const runTag = `${Date.now()}`
const rawNimblRoot = join(resultsDir, `raw-nimbl-${runTag}`)
const rawOpenCodeRoot = join(resultsDir, `raw-opencode-${runTag}`)
mkdirSync(rawNimblRoot, { recursive: true })
mkdirSync(rawOpenCodeRoot, { recursive: true })

console.log(`corpusRoot: ${corpusRoot}`)

console.log("== Running NIMBL agent benchmark ==")
const nimblRuns = await runAgentBenchmark({ corpusRoot, seed, samples, live, modes: nimblModes, taskIds: taskIds.length ? taskIds : undefined })
const nimblRecordsFile = join(resultsDir, `agent-benchmark-${seed}-s${samples}${live ? "-live" : ""}-${runTag}.jsonl`)
appendBenchmarkRecords(nimblRecordsFile, nimblRuns as AgentBenchmarkRun[])
// Write every NIMBL run as its own raw file (full event stream included).
for (const run of nimblRuns) {
  const telemetry = (run.telemetry || {}) as Record<string, unknown>
  const rawEvents = Array.isArray(telemetry.rawEvents) ? telemetry.rawEvents : []
  writeFileSync(join(rawNimblRoot, `${run.taskId}-${run.mode}-s${run.seed}.json`), JSON.stringify({ ...run, telemetry: { ...telemetry, rawEvents } }, null, 2), "utf8")
}

console.log("== Running opencode benchmark ==")
console.log(`opencode model: ${opencodeModel} (set OPENCODE_BENCH_MODEL to override)`)
const opencodeRuns = await runOpencodeBenchmark({
  corpusRoot, seed, samples, model: opencodeModel, taskIds: taskIds.length ? taskIds : undefined, customProvider,
})
appendBenchmarkRecords(join(resultsDir, `opencode-benchmark-${seed}-s${samples}-${runTag}.jsonl`), opencodeRuns)

// Raw opencode event stream + per-run JSON. The runner preserved every event
// line verbatim in telemetry.rawEvents, so nothing is summarized or filtered.
for (const run of opencodeRuns) {
  const telemetry = (run.telemetry || {}) as Record<string, unknown>
  const rawEvents = Array.isArray(telemetry.rawEvents) ? telemetry.rawEvents : []
  const rawStreamName = `${run.taskId}-opencode-s${run.seed}.jsonl`
  writeFileSync(join(rawOpenCodeRoot, rawStreamName), rawEvents.join("\n") + "\n", "utf8")
  writeFileSync(join(rawOpenCodeRoot, `${run.taskId}-opencode-s${run.seed}.json`), JSON.stringify({ ...run, telemetry: { ...telemetry, rawEvents } }, null, 2), "utf8")
}

const nimblByMode = summarizeAgentBenchmarkModes(nimblRuns)
const opencodeSolved = opencodeRuns.filter((run) => run.solved).length
const opencodeTotal = opencodeRuns.length
const ocTokens = opencodeRuns.reduce((sum, run) => sum + run.totalTokens, 0)
const ocCost = opencodeRuns.reduce((sum, run) => sum + run.referenceCostUsd, 0)

const headToHead = {
  meta,
  corpusRoot,
  modes: nimblModes,
  samples,
  nimblByMode,
  opencode: { solved: opencodeSolved, total: opencodeTotal, totalTokens: ocTokens, referenceCostUsd: ocCost, runs: opencodeRuns },
  nimblRuns,
}
writeFileSync(join(resultsDir, `head-to-head-${runTag}.json`), JSON.stringify(headToHead, null, 2), "utf8")
console.log(`Raw results written to:\n  ${rawNimblRoot}\n  ${rawOpenCodeRoot}\n  ${nimblRecordsFile}\n  head-to-head-${runTag}.json`)
console.log(JSON.stringify({ meta, nimblByMode, opencode: { solved: opencodeSolved, total: opencodeTotal, totalTokens: ocTokens, referenceCostUsd: ocCost } }, null, 2))
console.log("\n=== Head-to-head (per task) ===")
const ocByTask = new Map(opencodeRuns.map((run) => [run.taskId, run]))
for (const run of nimblRuns) {
  if (run.mode !== "hybrid") continue
  const oc = ocByTask.get(run.taskId)
  if (!oc) continue
  console.log(`  ${run.taskId}: NIMBL(hybrid) solved=${run.solved} tokens=${run.totalTokens} | opencode solved=${oc.solved} tokens=${oc.totalTokens}`)
}

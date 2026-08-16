import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { runAgentBenchmark, summarizeAgentBenchmarkFamilies, summarizeAgentBenchmarkModes, summarizeAgentBenchmarkRuns, type AgentBenchmarkRun } from "../src/core/agent-benchmark"
import { appendBenchmarkRecords, benchmarkMetadata } from "../src/core/benchmark"

const corpusRoot = process.env.NIMBL_BENCH_CORPUS ? join(process.cwd(), process.env.NIMBL_BENCH_CORPUS) : join(import.meta.dir, "corpus")
const resultsDir = join(process.cwd(), ".nimbl", "benchmarks")
const seed = process.env.NIMBL_BENCH_SEED ? Number(process.env.NIMBL_BENCH_SEED) : 20260728
const samples = process.env.NIMBL_BENCH_SAMPLES ? Number(process.env.NIMBL_BENCH_SAMPLES) : 1
const live = process.env.NIMBL_BENCH_LIVE === "1"
// All four retrieval modes run in parallel when NIMBL_BENCH_MODES is unset.
const modes = (process.env.NIMBL_BENCH_MODES || "none,lexical,hybrid,prompt-cache").split(",").map((mode) => mode.trim()).filter(Boolean) as AgentBenchmarkRun["mode"][]
const concurrency = process.env.NIMBL_BENCH_CONCURRENCY ? Number(process.env.NIMBL_BENCH_CONCURRENCY) : 4
const requestsPerMinute = process.env.NIMBL_BENCH_REQ_PER_MIN ? Number(process.env.NIMBL_BENCH_REQ_PER_MIN) : undefined
const taskIds = (process.env.NIMBL_BENCH_TASKS || "").split(",").map((id) => id.trim()).filter(Boolean)
const file = join(resultsDir, `agent-benchmark-${seed}-s${samples}${live ? "-live" : ""}-${Date.now()}.jsonl`)
if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true })

const meta = benchmarkMetadata({ seed, cacheState: process.env.NIMBL_BENCH_COLD === "1" ? "cold" : "warm" })
process.stdout.write(`Starting ${live ? "LIVE" : "SYNTHETIC"} agent benchmark: tasks×modes at concurrency ${concurrency}${requestsPerMinute ? `, rate cap ${requestsPerMinute}/min` : ""}...\n`)
process.stdout.write(`Provider ${process.env.NIMBL_PROVIDER || "custom"} / model ${process.env.NIMBL_MODEL || process.env.NIMBL_CUSTOM_MODEL || "auto"}, modes: ${modes.join(", ")}\n`)
const startedAt = Date.now()
const runs = await runAgentBenchmark({ corpusRoot, seed, samples, live, modes, concurrency, requestsPerMinute, taskIds: taskIds.length ? taskIds : undefined })
const persistedRuns = runs.map((run) => ({ ...run, benchmarkMetadata: meta }))
appendBenchmarkRecords(file, persistedRuns as unknown as AgentBenchmarkRun[])
const byTask = summarizeAgentBenchmarkRuns(runs)
const byMode = summarizeAgentBenchmarkModes(runs)
const byFamily = summarizeAgentBenchmarkFamilies(runs)

process.stdout.write(`\n=== Per-mode (Sprint C) ===\n`)
for (const mode of Object.keys(byMode).sort()) {
  const m = byMode[mode]!
  process.stdout.write(`  ${mode}: solved=${m.solved}/${m.total} fullTokens=${Math.round(m.totalTokens.mean)} billedTokens=${Math.round(m.billedTokens.mean)} avgSteps=${Math.round(m.toolSteps.mean)} avgLatency=${Math.round(m.latencyMs.mean)}ms\n`)
}
process.stdout.write(`\n=== Per-family (Sprint C per-class budgets) ===\n`)
for (const family of Object.keys(byFamily).sort()) {
  const f = byFamily[family]!
  process.stdout.write(`  ${family}: solved=${f.solved}/${f.total} fullTokens=${Math.round(f.totalTokens.mean)} billedTokens=${Math.round(f.billedTokens.mean)} avgSteps=${Math.round(f.toolSteps.mean)} budget=${f.maxToolSteps} steps\n`)
}

console.log(JSON.stringify({ meta, byTask, byMode, byFamily, elapsedMs: Date.now() - startedAt }, null, 2))
console.log(`Raw results: ${file}`)
console.log(`Mode: ${live ? "LIVE (real provider tokens)" : "SYNTHETIC (deterministic agent loop)"}`)
console.log(`Tip: NIMBL_BENCH_LIVE=1 runs against NIMBL_PROVIDER/NIMBL_MODEL for real token usage.`)

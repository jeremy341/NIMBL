import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { runAgentBenchmark, summarizeAgentBenchmarkModes, summarizeAgentBenchmarkRuns, type AgentBenchmarkRun } from "../src/core/agent-benchmark"
import { appendBenchmarkRecords, benchmarkMetadata } from "../src/core/benchmark"

const corpusRoot = join(import.meta.dir, "corpus")
const resultsDir = join(process.cwd(), ".nimbl", "benchmarks")
const seed = process.env.NIMBL_BENCH_SEED ? Number(process.env.NIMBL_BENCH_SEED) : 20260728
const samples = process.env.NIMBL_BENCH_SAMPLES ? Number(process.env.NIMBL_BENCH_SAMPLES) : 1
const live = process.env.NIMBL_BENCH_LIVE === "1"
const file = join(resultsDir, `agent-benchmark-${seed}-s${samples}${live ? "-live" : ""}-${Date.now()}.jsonl`)
if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true })

const meta = benchmarkMetadata({ seed, cacheState: process.env.NIMBL_BENCH_COLD === "1" ? "cold" : "warm" })
const runs = await runAgentBenchmark({ corpusRoot, seed, samples, live })
appendBenchmarkRecords(file, runs as unknown as AgentBenchmarkRun[])
const byTask = summarizeAgentBenchmarkRuns(runs)
const byMode = summarizeAgentBenchmarkModes(runs)

console.log(JSON.stringify({ meta, byTask, byMode }, null, 2))
console.log(`Raw results: ${file}`)
console.log(`Mode: ${live ? "LIVE (real provider tokens)" : "SYNTHETIC (deterministic agent loop)"}`)
console.log(`Tip: NIMBL_BENCH_LIVE=1 runs against NIMBL_PROVIDER/NIMBL_MODEL for real token usage.`)

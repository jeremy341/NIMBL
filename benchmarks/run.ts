import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { appendBenchmarkRecords, benchmarkMetadata, runRetrievalBenchmark, summarizeBenchmarkRuns } from "../src/core/benchmark"

const corpusRoot = join(import.meta.dir, "corpus")
const resultsDir = join(process.cwd(), ".nimbl", "benchmarks")
const seed = process.env.NIMBL_BENCH_SEED ? Number(process.env.NIMBL_BENCH_SEED) : 20260728
const samples = process.env.NIMBL_BENCH_SAMPLES ? Number(process.env.NIMBL_BENCH_SAMPLES) : 1
const file = join(resultsDir, `benchmark-${seed}-s${samples}-${Date.now()}.jsonl`)
if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true })

const meta = benchmarkMetadata({ seed, cacheState: process.env.NIMBL_BENCH_COLD === "1" ? "cold" : "warm" })
const runs = await runRetrievalBenchmark({ corpusRoot, seed, samples })
appendBenchmarkRecords(file, runs)
const summary = summarizeBenchmarkRuns(runs)

console.log(JSON.stringify({ meta, summary }, null, 2))
console.log(`Raw results: ${file}`)

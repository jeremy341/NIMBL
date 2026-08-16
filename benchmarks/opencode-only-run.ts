import { join } from "node:path"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { runOpencodeBenchmark } from "../src/core/opencode-benchmark"
import { appendBenchmarkRecords, benchmarkMetadata } from "../src/core/benchmark"

const corpusRoot = process.env.NIMBL_BENCH_CORPUS ? join(process.cwd(), process.env.NIMBL_BENCH_CORPUS) : join(import.meta.dir, "corpus")
const resultsDir = join(process.cwd(), ".nimbl", "benchmarks")
const seed = process.env.NIMBL_BENCH_SEED ? Number(process.env.NIMBL_BENCH_SEED) : 20260728
const samples = process.env.NIMBL_BENCH_SAMPLES ? Number(process.env.NIMBL_BENCH_SAMPLES) : 1
const concurrency = process.env.NIMBL_BENCH_CONCURRENCY ? Number(process.env.NIMBL_BENCH_CONCURRENCY) : 4
const taskIds = (process.env.NIMBL_BENCH_TASKS || "").split(",").map((id) => id.trim()).filter(Boolean)

// opencode resolves `--model <provider>/<model>`; the prefix selects the injected
// custom provider, the suffix is the API model id. Pass the full prefixed form.
const baseURL = process.env.OPENCODE_BENCH_BASE_URL
const apiKey = process.env.OPENCODE_BENCH_API_KEY
// The injected provider ID must not collide with a provider already defined in
// the global opencode config (e.g. `openrouter` has a whitelist that would
// filter out our model). Use a unique ID.
const providerId = process.env.OPENCODE_BENCH_PROVIDER_ID || "nimbl-bench"
const apiModel = (process.env.OPENCODE_BENCH_MODEL || process.env.NIMBL_MODEL || "deepseek/deepseek-chat").replace(/^[^/]+\//, "")
const model = `${providerId}/${apiModel}`
const customProvider = baseURL && apiKey ? { providerId, baseURL, apiKey } : undefined

if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true })

const runTag = `${Date.now()}`
const meta = benchmarkMetadata({ seed, provider: process.env.OPENCODE_BENCH_PROVIDER || "opencode", model: apiModel })
const rawRoot = join(resultsDir, `raw-opencode-${runTag}`)
mkdirSync(rawRoot, { recursive: true })

console.log(`corpusRoot: ${corpusRoot}`)
console.log(`model: ${apiModel} (injected provider ${providerId}${customProvider ? "" : " NOT SET"})`)
console.log(`concurrency: ${concurrency}`)

const runs = await runOpencodeBenchmark({
  corpusRoot,
  seed,
  samples,
  model,
  taskIds: taskIds.length ? taskIds : undefined,
  customProvider,
  concurrency,
})

const persistedRuns = runs.map((run) => ({ ...run, benchmarkMetadata: meta }))
appendBenchmarkRecords(join(resultsDir, `opencode-benchmark-${seed}-s${samples}-${runTag}.jsonl`), persistedRuns)
for (const run of runs) {
  const telemetry = (run.telemetry || {}) as Record<string, unknown>
  const rawEvents = Array.isArray(telemetry.rawEvents) ? telemetry.rawEvents : []
  const rawStreamName = `${run.taskId}-opencode-s${run.seed}.jsonl`
  writeFileSync(join(rawRoot, rawStreamName), rawEvents.join("\n") + "\n", "utf8")
  writeFileSync(join(rawRoot, `${run.taskId}-opencode-s${run.seed}.json`), JSON.stringify({ ...run, benchmarkMetadata: meta, telemetry: { ...telemetry, rawEvents } }, null, 2), "utf8")
}

const solved = runs.filter((run) => run.solved).length
const totalTokens = runs.reduce((sum, run) => sum + run.totalTokens, 0)
const failed = runs.filter((run) => run.telemetry?.error).length
console.log(`opencode: ${solved}/${runs.length} solved, ${totalTokens} full tokens, ${failed} with errors`)
console.log(`Raw results written to:\n  ${rawRoot}\n  opencode-benchmark-${seed}-s${samples}-${runTag}.jsonl`)

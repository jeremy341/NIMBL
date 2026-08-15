import { join } from "node:path"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { runOpencodeBenchmark } from "../src/core/opencode-benchmark"
import { appendBenchmarkRecords } from "../src/core/benchmark"

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
const providerId = process.env.OPENCODE_BENCH_PROVIDER
const model = process.env.OPENCODE_BENCH_MODEL || process.env.NIMBL_MODEL || "deepseek/deepseek-chat"
const customProvider = baseURL && apiKey && providerId ? { providerId, baseURL, apiKey } : undefined

if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true })

const runTag = `${Date.now()}`
const rawRoot = join(resultsDir, `raw-opencode-${runTag}`)
mkdirSync(rawRoot, { recursive: true })

console.log(`corpusRoot: ${corpusRoot}`)
console.log(`model: ${model} (provider prefix required: ${customProvider ? "yes" : "no"})`)
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

appendBenchmarkRecords(join(resultsDir, `opencode-benchmark-${seed}-s${samples}-${runTag}.jsonl`), runs)
for (const run of runs) {
  const telemetry = (run.telemetry || {}) as Record<string, unknown>
  const rawEvents = Array.isArray(telemetry.rawEvents) ? telemetry.rawEvents : []
  const rawStreamName = `${run.taskId}-opencode-s${run.seed}.jsonl`
  writeFileSync(join(rawRoot, rawStreamName), rawEvents.join("\n") + "\n", "utf8")
  writeFileSync(join(rawRoot, `${run.taskId}-opencode-s${run.seed}.json`), JSON.stringify({ ...run, telemetry: { ...telemetry, rawEvents } }, null, 2), "utf8")
}

const solved = runs.filter((run) => run.solved).length
const totalTokens = runs.reduce((sum, run) => sum + run.totalTokens, 0)
const failed = runs.filter((run) => run.telemetry?.error).length
console.log(`opencode: ${solved}/${runs.length} solved, ${totalTokens} total tokens, ${failed} with errors`)
console.log(`Raw results written to:\n  ${rawRoot}\n  opencode-benchmark-${seed}-s${samples}-${runTag}.jsonl`)
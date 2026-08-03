import { describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  appendBenchmarkRecords,
  benchmarkMetadata,
  benchmarkRunSeed,
  evaluateRetrieval,
  loadBenchmarkTasks,
  mulberry32,
  readBenchmarkRecords,
  runRetrievalBenchmark,
  summarizeBenchmarkRuns,
  varianceSummary,
} from "@/core/benchmark"

const CORPUS = join(import.meta.dir, "..", "benchmarks", "corpus")

describe("retrieval grading", () => {
  it("computes precision, recall, and MRR", () => {
    const evaluation = evaluateRetrieval(["a.ts", "b.ts", "c.ts", "d.ts"], ["b.ts", "c.ts"], 4)
    expect(evaluation.precisionAtK).toBe(0.5)
    expect(evaluation.recallAtK).toBe(1)
    expect(evaluation.mrr).toBe(0.5)
    expect(evaluation.firstRelevantRank).toBe(2)
  })

  it("scores empty results as zero without throwing", () => {
    expect(evaluateRetrieval([], ["a.ts"], 4)).toEqual({ precisionAtK: 0, recallAtK: 0, mrr: 0, firstRelevantRank: null })
  })

  it("summarizes variance across samples", () => {
    const summary = varianceSummary([1, 2, 3, 4, 5])
    expect(summary.mean).toBe(3)
    expect(summary.stdDev).toBeCloseTo(Math.sqrt(2), 5)
    expect(summary.min).toBe(1)
    expect(summary.max).toBe(5)
    expect(summary.samples).toBe(5)
    expect(varianceSummary([]).samples).toBe(0)
  })

  it("is seeded deterministically", () => {
    expect(mulberry32(42)()).toBe(mulberry32(42)())
    expect(benchmarkRunSeed(20260728, "theme-config")).toBe(benchmarkRunSeed(20260728, "theme-config"))
  })
})

describe("benchmark corpus and runner", () => {
  it("loads the frozen task corpus", () => {
    const tasks = loadBenchmarkTasks(CORPUS)
    expect(tasks.length).toBeGreaterThanOrEqual(5)
    for (const task of tasks) expect(task.relevant.length).toBeGreaterThan(0)
  })

  it("runs all modes against the fixture and records telemetry", async () => {
    const tasks = loadBenchmarkTasks(CORPUS)
    const runs = await runRetrievalBenchmark({ corpusRoot: CORPUS, tasks: tasks.slice(0, 2), modes: ["lexical", "graph", "hybrid"], seed: 20260728 })
    expect(runs).toHaveLength(6)
    expect(new Set(runs.map((run) => run.mode))).toEqual(new Set(["lexical", "graph", "hybrid"]))
    for (const run of runs) {
      expect(run.evaluation.precisionAtK).toBeGreaterThan(0)
      expect(run.telemetry.indexedFiles).toBeGreaterThanOrEqual(5)
      expect(run.excerptChars).toBeGreaterThan(0)
    }
    const hybrid = runs.find((run) => run.mode === "hybrid" && run.taskId === "theme-config")!
    expect(hybrid.selectedPaths[0]).toBe("src/config.ts")
  })

  it("repeats runs across samples and reports variance", async () => {
    const tasks = loadBenchmarkTasks(CORPUS)
    const runs = await runRetrievalBenchmark({ corpusRoot: CORPUS, tasks: [tasks[0]!], modes: ["lexical"], seed: 7, samples: 2 })
    expect(runs).toHaveLength(2)
    const summary = summarizeBenchmarkRuns(runs)
    expect(summary["lexical"]?.runs).toBe(2)
    expect(summary["lexical"]?.precisionAtK.samples).toBe(2)
  })
})

describe("benchmark persistence", () => {
  it("round-trips JSONL records", () => {
    const dir = mkdtempSync(join(tmpdir(), "nimbl-benchmark-"))
    const file = join(dir, "results.jsonl")
    appendBenchmarkRecords(file, [
      { taskId: "a", mode: "lexical", seed: 1, selectedPaths: ["x.ts"], evaluation: { precisionAtK: 1, recallAtK: 1, mrr: 1, firstRelevantRank: 1 }, estimatedTokens: 10, excerptChars: 100, latencyMs: 5, telemetry: {} },
    ])
    const records = readBenchmarkRecords(file)
    expect(records).toHaveLength(1)
    expect(records[0]?.taskId).toBe("a")
    expect(readBenchmarkRecords(join(dir, "missing.jsonl"))).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })

  it("records reproducible metadata", () => {
    const metadata = benchmarkMetadata({ seed: 1, provider: "openrouter", model: "test", contextWindow: 128_000, cacheState: "cold" })
    expect(metadata.seed).toBe(1)
    expect(metadata.provider).toBe("openrouter")
    expect(metadata.cacheState).toBe("cold")
    expect(metadata.gitRevision).toMatch(/^[0-9a-f]{7,}$/)
    expect(metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(existsSync(join(process.cwd(), "package.json"))).toBe(true)
  })
})

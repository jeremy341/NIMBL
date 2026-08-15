import { describe, expect, it } from "vitest"
import { join } from "node:path"
import { gradeTask } from "@/core/agent-benchmark"
import type { AgentBenchmarkTask } from "@/core/agent-benchmark"

const corpusRoot = join(import.meta.dir, "..", "benchmarks", "corpus")

describe("agent benchmark", () => {
  it("loads the frozen agent task corpus", async () => {
    const { loadAgentBenchmarkTasks } = await import("@/core/agent-benchmark")
    const tasks = loadAgentBenchmarkTasks(corpusRoot)
    expect(tasks.length).toBeGreaterThanOrEqual(6)
    expect(tasks[0]!.verify.length).toBeGreaterThan(0)
  })

  it("grades fileContains and answerContains verifiers", async () => {
    const { mkdirSync, mkdtempSync, writeFileSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const root = mkdtempSync(join(tmpdir(), "nimbl-agentbench-grade-"))
    mkdirSync(join(root, "src"), { recursive: true })
    writeFileSync(join(root, "src", "config.ts"), "export const MAX_RETRIES = 5", { flag: "w" })
    const task: AgentBenchmarkTask = {
      id: "t",
      prompt: "p",
      verify: [
        { type: "fileContains", path: "src/config.ts", text: "MAX_RETRIES = 5" },
        { type: "answerContains", text: "five" },
      ],
    }
    const { passed, total } = gradeTask(root, task, "The answer is five.")
    expect(total).toBe(2)
    expect(passed).toBe(2)
  })

  it("runs the synthetic end-to-end benchmark and solves the frozen tasks", async () => {
    const { runAgentBenchmark } = await import("@/core/agent-benchmark")
    const runs = await runAgentBenchmark({ corpusRoot, modes: ["lexical"], samples: 1 })
    expect(runs.length).toBeGreaterThanOrEqual(6)
    // Every frozen task solves in synthetic mode (the harness drives the real
    // tools: read, edit, bash).
    expect(runs.every((run) => run.solved)).toBe(true)
    // The "update-config" task must actually have edited the file.
    const update = runs.find((run) => run.taskId === "update-config")
    expect(update?.passedChecks).toBe(update?.totalChecks)
    expect(update?.solved).toBe(true)
  })

  it("summarizes per-mode token usage", async () => {
    const { runAgentBenchmark, summarizeAgentBenchmarkModes } = await import("@/core/agent-benchmark")
    const runs = await runAgentBenchmark({ corpusRoot, modes: ["none", "lexical"], samples: 1 })
    const byMode = summarizeAgentBenchmarkModes(runs)
    expect(byMode.lexical.solved).toBe(byMode.lexical.total)
    expect(byMode.none.totalTokens.mean).toBeGreaterThan(0)
    expect(byMode.lexical.totalTokens.mean).toBeGreaterThan(0)
  })

  it("produces identical graded results with concurrency 1 and 4", async () => {
    const { runAgentBenchmark } = await import("@/core/agent-benchmark")
    const sequential = await runAgentBenchmark({ corpusRoot, modes: ["none", "lexical"], samples: 1, concurrency: 1 })
    const parallel = await runAgentBenchmark({ corpusRoot, modes: ["none", "lexical"], samples: 1, concurrency: 4 })
    expect(sequential.length).toBe(parallel.length)
    const key = (run: { taskId: string; mode: string; seed: number }) => `${run.mode}:${run.taskId}:${run.seed}`
    const sequentialByKey = new Map(sequential.map((run) => [key(run), run]))
    for (const run of parallel) {
      const seq = sequentialByKey.get(key(run))
      expect(seq, `missing sequential run for ${key(run)}`).toBeDefined()
      expect(seq!.solved).toBe(run.solved)
      expect(seq!.passedChecks).toBe(run.passedChecks)
      expect(seq!.totalChecks).toBe(run.totalChecks)
      expect(seq!.totalTokens).toBe(run.totalTokens)
    }
  })

  it("runs all four modes including prompt-cache against the frozen corpus", async () => {
    const { runAgentBenchmark } = await import("@/core/agent-benchmark")
    const runs = await runAgentBenchmark({ corpusRoot, modes: ["none", "lexical", "hybrid", "prompt-cache"], samples: 1, concurrency: 4 })
    const modes = new Set(runs.map((run) => run.mode))
    expect([...modes].sort()).toEqual(["hybrid", "lexical", "none", "prompt-cache"])
    expect(runs.length).toBeGreaterThanOrEqual(24)
  })
})

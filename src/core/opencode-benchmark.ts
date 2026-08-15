import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { benchmarkRunSeed } from "./benchmark"
import { gradeTask, loadAgentBenchmarkTasks, type AgentBenchmarkRun, type AgentBenchmarkTask } from "./agent-benchmark"
import { estimateReferenceCost } from "./api"

interface OpenCodeEvent {
  type: string
  timestamp: number
  sessionID: string
  part?: {
    type?: string
    text?: string
    tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
    cost?: number
    tool?: string
    state?: { status?: string; title?: string }
  }
  error?: { name?: string; data?: { message?: string } }
}

/**
 * Runs opencode (`opencode run --format json --auto`) on the frozen agent task
 * corpus and returns NIMBL-shaped AgentBenchmarkRun records so the two harnesses
 * can be compared side by side.
 *
 * Requires: `opencode` on PATH (npm `opencode-ai`).
 */
export async function runOpencodeBenchmark(options: {
  corpusRoot: string
  model?: string
  opencodeBinary?: string
  samples?: number
  seed?: number
  agent?: string
  taskIds?: string[]
  timeoutMs?: number
  extraArgs?: string[]
  onLine?: (line: string) => void
  /** Max opencode processes in flight at once (each run is an isolated workspace). */
  concurrency?: number
  /**
   * Custom OpenAI-compatible provider injected as `opencode.json` so the
   * benchmark can target an arbitrary endpoint (e.g. a free proxy). Keys:
   * `providerId`, `baseURL`, `apiKey`, `npm` (default @ai-sdk/openai-compatible).
   */
  customProvider?: { providerId: string; baseURL: string; apiKey: string; npm?: string }
}): Promise<AgentBenchmarkRun[]> {
  const tasks = (options.taskIds ? loadAgentBenchmarkTasks(options.corpusRoot).filter((task) => options.taskIds!.includes(task.id)) : loadAgentBenchmarkTasks(options.corpusRoot))
  const fixtureRoot = join(options.corpusRoot, "fixture")
  if (!existsSync(fixtureRoot)) throw new Error(`Agent benchmark fixture ${fixtureRoot} does not exist.`)
  const binary = options.opencodeBinary || "opencode"
  const model = options.model || process.env.OPENCODE_BENCH_MODEL || process.env.NIMBL_MODEL || "deepseek/deepseek-chat"
  const samples = options.samples ?? 1
  const seed = options.seed ?? 20260728
  const concurrency = options.concurrency ?? 1
  const runs: AgentBenchmarkRun[] = []

  const work: Array<{ task: AgentBenchmarkTask; runSeed: number }> = []
  for (const task of tasks) {
    for (let sample = 0; sample < samples; sample++) work.push({ task, runSeed: benchmarkRunSeed(seed + sample, task.id) })
  }

  const lane = async (items: typeof work) => {
    for (const item of items) {
      const { task, runSeed } = item
      const started = Date.now()
      const workspace = join(tmpdir(), `opencode-bench-${task.id}-${runSeed}`)
      mkdirSync(workspace, { recursive: true })
      cpSync(fixtureRoot, workspace, { recursive: true })
      // opencode stores per-project state under the workspace; remove any of its
      // own dirs so each run is clean.
      for (const name of [".opencode", ".git"]) {
        try { rmSync(join(workspace, name), { recursive: true, force: true }) } catch { /* ignore */ }
      }
      // Inject a custom provider config so `opencode run --model <id>/<model>`
      // points at an arbitrary OpenAI-compatible endpoint.
      if (options.customProvider) {
        const cfg = {
          provider: {
            [options.customProvider.providerId]: {
              npm: options.customProvider.npm ?? "@ai-sdk/openai-compatible",
              name: options.customProvider.providerId,
              options: { baseURL: options.customProvider.baseURL, apiKey: options.customProvider.apiKey },
              models: {
                [model.split("/").at(-1) ?? model]: {
                  name: model.split("/").at(-1) ?? model,
                  tool_call: true,
                  limit: { context: 128_000, output: 8_192 },
                },
              },
            },
          },
        }
        writeFileSync(join(workspace, "opencode.json"), JSON.stringify(cfg, null, 2))
      }

      const tokens = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }
      let cost = 0
      let sawStepFinish = false
      const toolTitles: string[] = []
      const texts: string[] = []
      const rawLines: string[] = []
      const subagentSessions = new Map<string, { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number }>()
      const mainSessionID: { value?: string } = {}
      let error: string | undefined

      await new Promise<void>((resolve, reject) => {
        const timeoutMs = options.timeoutMs ?? 300_000
        // Use Bun.spawn: on Windows, Node's child_process.spawn deadlocks with
        // the Bun-compiled opencode binary (stdout never flushes), while
        // Bun.spawn handles it cleanly (verified).
        const proc = Bun.spawn(
          [
            binary,
            "run",
            "--pure",
            "--format", "json",
            "--auto",
            "--model", model,
            ...(options.agent ? ["--agent", options.agent] : []),
            ...(options.extraArgs ?? []),
            task.prompt,
          ],
          { cwd: workspace, stdout: "pipe", stderr: "pipe" },
        )
        let stderr = ""
        const timer = setTimeout(() => {
          try { proc.kill() } catch { /* already gone */ }
          error = `opencode timed out after ${Math.round(timeoutMs / 1000)}s`
          resolve()
        }, timeoutMs)
        const handleLine = (line: string) => {
          if (!line.trim()) return
          options.onLine?.(line)
          rawLines.push(line)
          let event: OpenCodeEvent
          try { event = JSON.parse(line) } catch { return }
          if (event.type === "step_finish" && event.part?.tokens) {
            sawStepFinish = true
            const sessionID = event.sessionID
            if (!mainSessionID.value && event.part.tokens.input > 0) mainSessionID.value = sessionID
            if (mainSessionID.value && sessionID !== mainSessionID.value) {
              // Child session (subagent) — track its tokens separately so we can
              // report delegation cost without losing it from the totals.
              const child = subagentSessions.get(sessionID) || { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }
              child.input += event.part.tokens.input ?? 0
              child.output += event.part.tokens.output ?? 0
              child.reasoning += event.part.tokens.reasoning ?? 0
              child.cacheRead += event.part.tokens.cache?.read ?? 0
              child.cacheWrite += event.part.tokens.cache?.write ?? 0
              subagentSessions.set(sessionID, child)
            }
            tokens.input += event.part.tokens.input ?? 0
            tokens.output += event.part.tokens.output ?? 0
            tokens.reasoning += event.part.tokens.reasoning ?? 0
            tokens.cacheRead += event.part.tokens.cache?.read ?? 0
            tokens.cacheWrite += event.part.tokens.cache?.write ?? 0
            if (typeof event.part.cost === "number") cost += event.part.cost
          }
          if (event.type === "tool_use" && event.part?.tool) toolTitles.push(event.part.tool)
          if (event.type === "text" && event.part?.text) texts.push(event.part.text)
          if (event.type === "error") error = event.error?.data?.message ?? event.error?.name ?? "opencode error"
        }
        void (async () => {
          try {
            let buffer = ""
            const stdout = new Response(proc.stdout)
            const reader = stdout.body?.getReader()
            const decoder = new TextDecoder()
            if (reader) {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                let index = buffer.indexOf("\n")
                while (index >= 0) {
                  handleLine(buffer.slice(0, index))
                  buffer = buffer.slice(index + 1)
                  index = buffer.indexOf("\n")
                }
              }
              if (buffer.trim()) handleLine(buffer.trim())
            }
            stderr = await new Response(proc.stderr).text()
            const code = await proc.exited
            clearTimeout(timer)
            if (code !== 0 && !sawStepFinish && !texts.length && !error) {
              reject(new Error(`opencode exited ${code}: ${stderr.slice(0, 300)}`))
              return
            }
            resolve()
          } catch (err) {
            clearTimeout(timer)
            reject(err)
          }
        })()
      })

      const answer = texts.join("").trim()
      const grade = gradeTask(workspace, task, answer)
      const subagentTokens = [...subagentSessions.values()].reduce((sum, child) => sum + child.input + child.output + child.reasoning, 0)
      runs.push({
        taskId: task.id,
        mode: "opencode" as unknown as AgentBenchmarkRun["mode"],
        seed: runSeed,
        solved: grade.passed === grade.total,
        passedChecks: grade.passed,
        totalChecks: grade.total,
        passedBefore: grade.passedBefore,
        failedBefore: grade.failedBefore,
        inputTokens: tokens.input,
        outputTokens: tokens.output,
        totalTokens: tokens.input + tokens.output + tokens.reasoning,
        noCacheTokens: tokens.input - tokens.cacheRead,
        cacheReadTokens: tokens.cacheRead,
        cacheWriteTokens: tokens.cacheWrite,
        referenceCostUsd: estimateReferenceCost(tokens.input, tokens.output),
        providerCostUsd: cost > 0 ? cost : undefined,
        latencyMs: Date.now() - started,
        attempts: 1,
        toolSteps: toolTitles.length,
        finishReason: error ? "error" : "stop",
        retrievalTokens: 0,
        retrievalCandidates: 0,
        answer,
        difficulty: task.difficulty,
        tags: task.tags,
        telemetry: {
          harness: "opencode",
          model,
          error,
          rawEvents: rawLines,
          subagentSessions: [...subagentSessions.entries()].map(([sessionID, child]) => ({ sessionID, ...child })),
          subagentTokens,
          toolHistogram: toolTitles.reduce<Record<string, number>>((acc, tool) => { acc[tool] = (acc[tool] || 0) + 1; return acc }, {}),
        },
      })
    }
  }

  const limit = Math.max(1, Math.min(concurrency, work.length))
  let next = 0
  const lanes = Array.from({ length: limit }, async () => {
    while (next < work.length) {
      const slice = work[next++]
      await lane([slice])
    }
  })
  await Promise.all(lanes)
  return runs
}

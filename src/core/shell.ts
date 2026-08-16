const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_OUTPUT_CHARS = 4_000

// Kills the spawned child AND its process tree so a daemonizing grandchild
// (servers, watch, npm run dev) cannot keep the pipes open and hang the run.
// Windows: taskkill /T /F terminates the whole tree; POSIX: try a negative
// pid (process group) then fall back to the child itself.
async function killProcessTree(pid: number) {
  try {
    if (process.platform === "win32") {
      const result = await Bun.spawn(["taskkill", "/PID", String(pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" }).exited
      if (result === 0) return
    } else {
      try { process.kill(-pid, "SIGKILL"); return } catch { /* no group */ }
    }
    try { process.kill(pid, "SIGKILL") } catch { /* already gone */ }
  } catch { /* already gone */ }
}

// Reads a pipe to EOF but stops early once the direct child has exited, so a
// descendant that inherited the pipe cannot hang the run after timeout/abort.
async function readBounded(
  stream: ReadableStream<Uint8Array>,
  limit: number,
  stopAfter: Promise<unknown>,
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let output = ""
  let truncated = false
  let stopped = false
  const stop = () => { stopped = true; void reader.cancel().catch(() => {}) }
  void stopAfter.then(stop).catch(stop)
  try {
    while (true) {
      if (stopped) break
      const result = await Promise.race([
        reader.read(),
        stopAfter.then(() => ({ done: true as const })),
      ])
      const { done, value } = result as { done: boolean; value?: Uint8Array }
      if (done) break
      const decoded = decoder.decode(value, { stream: true })
      const remaining = limit - output.length
      if (decoded.length > remaining) truncated = true
      if (remaining > 0) output += decoded.slice(0, remaining)
    }
    const tail = decoder.decode()
    if (tail.length > limit - output.length) truncated = true
    return { text: output + tail.slice(0, Math.max(0, limit - output.length)), truncated }
  } finally {
    try { await reader.cancel() } catch { /* already closed */ }
    reader.releaseLock()
  }
}

export interface ShellOptions {
  signal?: AbortSignal
  timeoutMs?: number
  maxOutputChars?: number
}

export function isTestCommand(command: string): boolean {
  return /(^|\s)(bun\s+test|vitest(?:\s|$)|npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|yarn\s+test)(\s|$)/i.test(command)
}

/** Canonicalize a test command for memoization so cosmetic flag differences
 * (`| Select-Object -First N`, `2>&1`, trailing whitespace) still hit the cache. */
export function normalizeTestCommand(command: string): string {
  return command
    .replace(/\s*\|\s*Select-Object\s+-First\s+\d+\s*$/i, "")
    .replace(/\s*2>&1\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Keep test feedback actionable without replaying the full runner log.
 *
 * TIER-E regression fix: the earlier version kept only lines matching
 * pass/fail/error keywords, which dropped the failing FILE PATH and the
 * Expected/Received assertion values. Starved of "which file failed", the
 * model re-ran the full suite ~2x (55 -> 132 test runs on lh-fix-all), doubling
 * steps and tokens. This version parses the bun/vitest output into per-file
 * failure blocks that preserve exactly the attribution the model needs:
 *   - the failing file path (tests-hidden\foo.test.ts)
 *   - the failing test name ((fail) ...)
 *   - the error type (error: expect(received).toBe(expected))
 *   - Expected / Received values
 * plus the pass/fail totals. Code-context lines, stack traces, and runner
 * noise are dropped (still capped, still tiny on passing runs).
 */
export function summarizeTestOutput(command: string, output: string, code: number): string {
  if (!isTestCommand(command)) return output
  const lines = output.split(/\r?\n/).map((line) => line.trimEnd())
  const failures: string[] = []
  let currentFile = ""
  let passTotal = 0
  let failTotal = 0
  let ranLine = ""
  let pendingError = ""
  let pendingExpected = ""
  let pendingReceived = ""

  const pushFailure = (name: string) => {
    const block = [`FAIL ${currentFile || "(unknown file)"}`, `  ${name}`]
    if (pendingError) block.push(`  ${pendingError}`)
    if (pendingExpected) block.push(`  ${pendingExpected}`)
    if (pendingReceived) block.push(`  ${pendingReceived}`)
    failures.push(block.join("\n"))
    pendingError = ""; pendingExpected = ""; pendingReceived = ""
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    // File header: tests-hidden\billing-idempotency.test.ts:
    const fileMatch = line.match(/^(.+\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|mts|cts)):\s*$/i)
    if (fileMatch) { currentFile = fileMatch[1]!; continue }
    // Summary totals: " 10 pass" / " 15 fail"
    let m = line.match(/^(\d+)\s+pass$/i)
    if (m) { passTotal = Number(m[1]); continue }
    m = line.match(/^(\d+)\s+fail$/i)
    if (m) { failTotal = Number(m[1]); continue }
    m = line.match(/^Ran (\d+) tests? across (\d+) files?\./i)
    if (m) { ranLine = `Ran ${m[1]} tests across ${m[2]} files.`; continue }
    // (fail) test name [0.73ms]
    m = line.match(/^\(fail\)\s+(.+?)(?:\s+\[\d+(?:\.\d+)?ms\])?\s*$/i)
    if (m) { failTotal++; pushFailure(m[1]!); continue }
    // (pass) test name [0.09ms]
    m = line.match(/^\(pass\)\s+/i)
    if (m) { passTotal++; continue }
    // error: expect(received).toBe(expected)  (buffer until next (fail))
    m = line.match(/^error:\s*(.+)$/i)
    if (m) { pendingError = m[1]!.slice(0, 120); continue }
    // Expected: "k1" / Received: undefined
    m = line.match(/^(Expected|Received):\s*(.+)$/i)
    if (m) {
      const value = m[2]!.slice(0, 80)
      if (m[1]!.toLowerCase() === "expected") pendingExpected = `Expected: ${value}`
      else pendingReceived = `Received: ${value}`
      continue
    }
    // Ignore everything else (code context, ^ pointers, stack traces, runner noise).
  }

  const maxFailures = 10
  const shown = failures.slice(0, maxFailures)
  const more = failures.length - shown.length
  const result = [`Test command exited ${code}.`]
  if (shown.length) result.push(...shown)
  if (more > 0) result.push(`... and ${more} more failing tests`)
  result.push(`${passTotal} pass, ${failTotal} fail` + (ranLine ? ` - ${ranLine}` : ""))
  return result.join("\n")
}

export async function runShellCommand(command: string, cwd: string, options: ShellOptions = {}) {
  const limit = options.maxOutputChars ?? DEFAULT_OUTPUT_CHARS
  const child = Bun.spawn(
    process.platform === "win32"
      ? ["powershell.exe", "-NoProfile", "-Command", command]
      : ["/bin/sh", "-lc", command],
    { cwd, stdout: "pipe", stderr: "pipe" },
  )
  let timedOut = false

  const kill = () => { void killProcessTree(child.pid) }
  const timer = setTimeout(() => {
    timedOut = true
    kill()
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  options.signal?.addEventListener("abort", kill, { once: true })

  try {
    const exited = child.exited.then((code) => code).catch(() => 0)
    const [stdout, stderr, code] = await Promise.all([
      readBounded(child.stdout, limit, exited),
      readBounded(child.stderr, limit, exited),
      exited,
    ])
    if (options.signal?.aborted) throw new Error("Command interrupted.")
    if (timedOut) throw new Error(`Command timed out after ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms.`)
    const combined = (stdout.text + (stderr.text ? `\n${stderr.text}` : "")).trim() || "(no output)"
    const wasTruncated = stdout.truncated || stderr.truncated || combined.length > limit
    const output = combined.slice(0, limit) + (wasTruncated ? "\n\n... output truncated by NIMBL" : "")
    return { code, output }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener("abort", kill)
  }
}

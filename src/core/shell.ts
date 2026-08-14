const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_OUTPUT_CHARS = 12_000

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

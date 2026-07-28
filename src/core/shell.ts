const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_OUTPUT_CHARS = 12_000

async function readBounded(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let output = ""
  let truncated = false
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const decoded = decoder.decode(value, { stream: true })
    const remaining = limit - output.length
    if (decoded.length > remaining) truncated = true
    if (remaining > 0) output += decoded.slice(0, remaining)
  }
  const tail = decoder.decode()
  if (tail.length > limit - output.length) truncated = true
  return { text: output + tail.slice(0, Math.max(0, limit - output.length)), truncated }
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
  const abort = () => child.kill()
  const timer = setTimeout(() => {
    timedOut = true
    child.kill()
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  options.signal?.addEventListener("abort", abort, { once: true })
  try {
    const [stdout, stderr, code] = await Promise.all([
      readBounded(child.stdout, limit),
      readBounded(child.stderr, limit),
      child.exited,
    ])
    if (options.signal?.aborted) throw new Error("Command interrupted.")
    if (timedOut) throw new Error(`Command timed out after ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms.`)
    const combined = (stdout.text + (stderr.text ? `\n${stderr.text}` : "")).trim() || "(no output)"
    const wasTruncated = stdout.truncated || stderr.truncated || combined.length > limit
    const output = combined.slice(0, limit) + (wasTruncated ? "\n\n... output truncated by NIMBL" : "")
    return { code, output }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener("abort", abort)
  }
}

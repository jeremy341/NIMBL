import { dlopen, ptr } from "bun:ffi"
import type { ReadStream } from "node:tty"

// Adapted from OpenCode's MIT-licensed Windows terminal guard.
// See ../tui-opencode-ui/OPENCODE_ATTRIBUTION.md.

const STD_INPUT_HANDLE = -10
const ENABLE_PROCESSED_INPUT = 0x0001

const kernel = () => dlopen("kernel32.dll", {
  GetStdHandle: { args: ["i32"], returns: "ptr" },
  GetConsoleMode: { args: ["ptr", "ptr"], returns: "i32" },
  SetConsoleMode: { args: ["ptr", "u32"], returns: "i32" },
  FlushConsoleInputBuffer: { args: ["ptr"], returns: "i32" },
})

let k32: ReturnType<typeof kernel> | undefined
let restoreGuard: (() => void) | undefined

function load() {
  if (process.platform !== "win32" || !process.stdin.isTTY) return false
  try {
    k32 ??= kernel()
    return true
  } catch {
    return false
  }
}

export function win32DisableProcessedInput() {
  if (!load()) return
  const handle = k32!.symbols.GetStdHandle(STD_INPUT_HANDLE)
  const buffer = new Uint32Array(1)
  if (!handle || k32!.symbols.GetConsoleMode(handle, ptr(buffer)) === 0) return
  const mode = buffer[0]!
  if (mode & ENABLE_PROCESSED_INPUT) k32!.symbols.SetConsoleMode(handle, mode & ~ENABLE_PROCESSED_INPUT)
}

export function win32FlushInputBuffer() {
  if (!load()) return
  const handle = k32!.symbols.GetStdHandle(STD_INPUT_HANDLE)
  if (handle) k32!.symbols.FlushConsoleInputBuffer(handle)
}

export function win32InstallCtrlCGuard() {
  if (!load()) return
  if (restoreGuard) return restoreGuard

  const stdin = process.stdin as ReadStream
  const originalSetRawMode = stdin.setRawMode
  const handle = k32!.symbols.GetStdHandle(STD_INPUT_HANDLE)
  const buffer = new Uint32Array(1)
  if (!handle || k32!.symbols.GetConsoleMode(handle, ptr(buffer)) === 0) return
  const initialMode = buffer[0]!

  const enforce = () => win32DisableProcessedInput()
  const enforceLater = () => {
    enforce()
    setImmediate(enforce)
  }

  let wrapped: ReadStream["setRawMode"] | undefined
  if (typeof originalSetRawMode === "function") {
    wrapped = (mode: boolean) => {
      const result = originalSetRawMode.call(stdin, mode)
      enforceLater()
      return result
    }
    stdin.setRawMode = wrapped
  }

  enforceLater()
  const interval = setInterval(enforce, 100)
  interval.unref()
  let restored = false
  restoreGuard = () => {
    if (restored) return
    restored = true
    clearInterval(interval)
    if (wrapped && stdin.setRawMode === wrapped) stdin.setRawMode = originalSetRawMode
    k32!.symbols.SetConsoleMode(handle, initialMode)
    restoreGuard = undefined
  }
  return restoreGuard
}

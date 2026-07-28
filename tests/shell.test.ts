import { describe, expect, it } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runShellCommand } from "@/core/shell"

describe("shell execution", () => {
  it("stops commands that exceed their timeout", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-shell-"))
    const command = process.platform === "win32" ? "Start-Sleep -Milliseconds 500" : "sleep 0.5"
    await expect(runShellCommand(command, root, { timeoutMs: 25 })).rejects.toThrow("timed out")
  })

  it("bounds captured output", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-shell-"))
    const command = process.platform === "win32" ? "'x' * 1000" : "printf '%1000s' x"
    const result = await runShellCommand(command, root, { maxOutputChars: 80 })
    expect(result.output.length).toBeLessThan(160)
    expect(result.output).toContain("truncated")
  })
})

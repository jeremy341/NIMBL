import { describe, expect, it } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isReadLikeShellCommand, isTestCommand, normalizeTestCommand, runShellCommand, summarizeTestOutput } from "@/core/shell"

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

  it("condenses test output to a verdict and actionable failures", () => {
    expect(isTestCommand("bun test ./tests-hidden")).toBe(true)
    expect(isTestCommand("bun run build")).toBe(false)
    const output = summarizeTestOutput("bun test ./tests-hidden", "bun test v1.3.14\n\ntests-hidden\\billing.test.ts:\n2 | import { charge } from \"../src\"\n7 |   expect(stored.key).toBe(\"k1\")\n                                    ^\nerror: expect(received).toBe(expected)\nExpected: \"k1\"\nReceived: undefined\n      at <anonymous> (tests-hidden\\billing.test.ts:7:33)\n(fail) charge persists the idempotency key [0.73ms]\n(pass) other test [0.09ms]\n 10 pass\n 1 fail\nRan 25 tests across 11 files. [118.00ms]\n" + "noise\n".repeat(50), 1)
    expect(output).toContain("Test command exited 1.")
    expect(output).toContain("FAIL tests-hidden\\billing.test.ts")
    expect(output).toContain("charge persists the idempotency key")
    expect(output).toContain("expect(received).toBe(expected)")
    expect(output).toContain("Expected: \"k1\"")
    expect(output).toContain("Received: undefined")
    expect(output).toContain("10 pass, 1 fail")
    expect(output).toContain("Ran 25 tests across 11 files.")
    expect(output).not.toContain("2 | import")
    expect(output).not.toContain("noise")
    expect(output.length).toBeLessThan(700)
  })

  it("keeps passing runs compact", () => {
    const output = summarizeTestOutput("bun test ./tests/unit", "bun test v1.3.14\n\ntests/unit/support.test.ts:\n(pass) a [0.09ms]\n(pass) b [0.03ms]\n 5 pass\n 0 fail\nRan 5 tests across 1 file. [35.00ms]", 0)
    expect(output).toContain("Test command exited 0.")
    expect(output).toContain("5 pass, 0 fail")
    expect(output).not.toContain("(pass) a")
  })

  it("normalizes test commands so cosmetic flag differences hit the memoization cache", () => {
    expect(normalizeTestCommand("bun test ./tests-hidden 2>&1")).toBe("bun test ./tests-hidden")
    expect(normalizeTestCommand("bun test ./tests-hidden 2>&1 | Select-Object -First 120")).toBe("bun test ./tests-hidden")
    expect(normalizeTestCommand("bun test  ./tests-hidden  2>&1")).toBe("bun test ./tests-hidden")
    expect(normalizeTestCommand("bun test ./tests-hidden | Select-Object -First 5")).toBe("bun test ./tests-hidden")
    expect(normalizeTestCommand("Get-Content a.ts")).toBe("Get-Content a.ts")
  })

  it("classifies shell file inspection conservatively for soft investigation accounting", () => {
    expect(isReadLikeShellCommand("Get-Content src/a.ts")).toBe(true)
    expect(isReadLikeShellCommand("cat src/a.ts | Select-String export")).toBe(true)
    expect(isReadLikeShellCommand("bun test ./tests/a.test.ts")).toBe(false)
    expect(isReadLikeShellCommand("Get-Content src/a.ts | Set-Content src/b.ts")).toBe(false)
  })
})

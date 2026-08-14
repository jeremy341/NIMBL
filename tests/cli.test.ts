import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runCliCommand } from "@/cli-commands"

describe("cli commands", () => {
  const root = mkdtempSync(join(tmpdir(), "nimbl-cli-"))

  afterEach(() => {
    process.exitCode = 0
  })

  it("dispatches the headless run command and fails fast on a missing API key", async () => {
    const original = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    try {
      process.exitCode = 0
      const handled = await runCliCommand(["run", "--provider", "openai", "explain this"], root)
      expect(handled).toBe(true)
      expect(process.exitCode).toBe(1)
    } finally {
      if (original !== undefined) process.env.OPENAI_API_KEY = original
      else delete process.env.OPENAI_API_KEY
    }
  })

  it("handles the --print flag as a headless run", async () => {
    const original = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    try {
      process.exitCode = 0
      const handled = await runCliCommand(["--print", "--provider", "openai", "summarize"], root)
      expect(handled).toBe(true)
      expect(process.exitCode).toBe(1)
    } finally {
      if (original !== undefined) process.env.OPENAI_API_KEY = original
      else delete process.env.OPENAI_API_KEY
    }
  })

  it("does not intercept ordinary flags", async () => {
    const handled = await runCliCommand(["--provider", "openai"], root)
    expect(handled).toBe(false)
  })
})

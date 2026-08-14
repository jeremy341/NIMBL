import { describe, expect, it } from "vitest"
import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { preparePromptContext } from "@/core/prompt-context"

describe("prompt context", () => {
  it("adds project-local file references and approved command output", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-prompt-"))
    writeFileSync(join(root, "notes.md"), "Relevant project note")
    const result = await preparePromptContext({ root, text: "Review @notes.md and !`echo check`", runCommand: async () => "check" })
    expect(result.attachments).toEqual(["notes.md"])
    expect(result.commands).toEqual(["echo check"])
    expect(result.text).toContain("Relevant project note")
    expect(result.text).toContain("User-requested command output")
  })

  it("rejects references that escape through a symlink", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-prompt-root-"))
    const outside = mkdtempSync(join(tmpdir(), "nimbl-prompt-outside-"))
    writeFileSync(join(outside, "secret.txt"), "outside")
    symlinkSync(outside, join(root, "linked"), "junction")

    await expect(preparePromptContext({
      root,
      text: "Review @linked/secret.txt",
      runCommand: async () => "",
    })).rejects.toThrow("outside this project")
  })

  it("blocks environment-file variants", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-prompt-env-"))
    writeFileSync(join(root, ".env.production"), "SECRET=value")

    await expect(preparePromptContext({
      root,
      text: "Review @.env.production",
      runCommand: async () => "",
    })).rejects.toThrow("Environment files")
  })

  it("attaches @file references followed by trailing punctuation", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-prompt-punct-"))
    writeFileSync(join(root, "notes.md"), "Punctuated note")
    const result = await preparePromptContext({ root, text: "See @notes.md? now.", runCommand: async () => "" })
    expect(result.attachments).toEqual(["notes.md"])
    expect(result.text).toContain("Punctuated note")
  })
})

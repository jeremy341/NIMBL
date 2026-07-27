import { describe, expect, it } from "vitest"
import { mkdtempSync, writeFileSync } from "node:fs"
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
})

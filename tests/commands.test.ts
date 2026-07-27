import { describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expandCommand, loadProjectCommands } from "@/core/commands"

describe("project commands", () => {
  it("loads markdown command files and expands arguments", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-commands-"))
    const folder = join(root, ".nimbl", "commands")
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, "review.md"), "---\ndescription: Review a file\nagent: plan\n---\nReview $1 with $ARGUMENTS")
    const command = loadProjectCommands(root).review!
    expect(command.description).toBe("Review a file")
    expect(command.agent).toBe("plan")
    expect(expandCommand(command, "src/app.tsx carefully")).toBe("Review src/app.tsx with src/app.tsx carefully")
  })
})

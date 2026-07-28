import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

describe("supported entry points", () => {
  it("ships only the OpenTUI frontend", () => {
    const root = resolve(import.meta.dirname, "..")
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"))
    expect(pkg.scripts.repl).toBeUndefined()
    expect(pkg.scripts.tui).toBeUndefined()
    expect(pkg.dependencies.ink).toBeUndefined()
    expect(pkg.dependencies["ink-text-input"]).toBeUndefined()
    expect(existsSync(resolve(root, "src/index.ts"))).toBe(false)
    expect(existsSync(resolve(root, "src/tui.tsx"))).toBe(false)
    expect(readFileSync(resolve(root, "build.ts"), "utf8")).toContain("src/tui-opencode.tsx")
  })
})

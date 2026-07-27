import { describe, expect, it } from "vitest"
import { clearContextCache, compressCode, selectProjectContextWithBudget } from "@/core/context"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

describe("context compression", () => {
  it("preserves source structure in a compact excerpt", () => {
    const result = compressCode("const ignored = 1\nexport function keep() {}\nconst another = 2")
    expect(result).toContain("export function keep")
  })
})

describe("context selection budget", () => {
  it("caps selected context and caches repeated project queries", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-context-"))
    writeFileSync(join(root, "feature.ts"), "export function feature() { return 'feature '.repeat(1000) }")
    clearContextCache()
    const first = await selectProjectContextWithBudget(root, "explain feature", 6, 80)
    const second = await selectProjectContextWithBudget(root, "explain feature", 6, 80)
    expect(first.items[0]?.excerpt.length).toBeLessThanOrEqual(80)
    expect(first.estimatedTokens).toBeLessThanOrEqual(20)
    expect(second.cacheHit).toBe(true)
  })
})

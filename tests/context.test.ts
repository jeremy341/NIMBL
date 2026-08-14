import { describe, expect, it } from "vitest"
import { clearContextCache, compressCode, createProjectContextIndex, selectProjectContextWithBudget } from "@/core/context"
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
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
    expect(first.telemetry.selectedFiles).toBe(1)
    expect(second.telemetry.cacheHit).toBe(true)
  })

  it("applies nested gitignore rules and retains explicitly unignored files", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-context-ignore-"))
    mkdirSync(join(root, "src"), { recursive: true })
    writeFileSync(join(root, ".gitignore"), "ignored.ts\nsrc/*\n!src/keep.ts\n")
    writeFileSync(join(root, "ignored.ts"), "export const secretFeature = true")
    writeFileSync(join(root, "src", "keep.ts"), "export const feature = true")
    const index = createProjectContextIndex(root)
    const result = await index.select("feature")
    expect(result.items.map((item) => item.path)).toEqual(["src/keep.ts"])
    expect(result.telemetry.ignoredFiles).toBeGreaterThan(0)
    index.close()
  })

  it("applies nested gitignore rules relative to their directory", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-context-nested-ignore-"))
    mkdirSync(join(root, "packages", "app"), { recursive: true })
    writeFileSync(join(root, "packages", ".gitignore"), "generated.ts\n")
    writeFileSync(join(root, "packages", "generated.ts"), "export const feature = 'ignored'")
    writeFileSync(join(root, "packages", "app", "feature.ts"), "export const feature = 'kept'")
    const index = createProjectContextIndex(root)
    const result = await index.select("feature")
    expect(result.items.map((item) => item.path)).toEqual(["packages/app/feature.ts"])
    index.close()
  })

  it("invalidates selections when indexed files change", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-context-index-"))
    const file = join(root, "feature.ts")
    writeFileSync(file, "export const feature = 'one'")
    const index = createProjectContextIndex(root)
    const first = await index.select("feature")
    const cached = await index.select("feature")
    writeFileSync(file, "export const feature = 'two'")
    index.invalidate("feature.ts")
    const refreshed = await index.select("feature")
    expect(cached.cacheHit).toBe(true)
    expect(refreshed.cacheHit).toBe(false)
    expect(refreshed.telemetry.indexGeneration).toBeGreaterThan(first.telemetry.indexGeneration)
    expect(refreshed.items[0]?.excerpt).toContain("two")
    index.close()
  })

  it("watches project changes without retaining the process after close", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-context-watch-"))
    const file = join(root, "feature.ts")
    writeFileSync(file, "export const feature = 'one'")
    const index = createProjectContextIndex(root, { watch: true })
    await index.select("feature")
    writeFileSync(file, "export const feature = 'two'")
    let refreshed
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20))
      refreshed = await index.select("feature")
      if (!refreshed.cacheHit) break
    }
    expect(refreshed?.cacheHit).toBe(false)
    expect(refreshed?.items[0]?.excerpt).toContain("two")
    index.close()
  })

  it("excludes protected and symlink-escaping files regardless of ignore rules", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-context-safe-"))
    const outside = mkdtempSync(join(tmpdir(), "nimbl-context-outside-"))
    mkdirSync(join(root, ".git"))
    mkdirSync(join(root, ".nimbl"))
    writeFileSync(join(root, ".git", "feature.ts"), "export const featureSecret = true")
    writeFileSync(join(root, ".nimbl", "feature.ts"), "export const featureToken = true")
    writeFileSync(join(outside, "outside.ts"), "export const feature = true")
    symlinkSync(outside, join(root, "linked"), "junction")
    const index = createProjectContextIndex(root)
    const result = await index.select("feature")
    expect(result.items).toEqual([])
    expect(result.telemetry.ignoredFiles).toBeGreaterThan(0)
    index.close()
  })

  it("prefers parser-backed declaration chunks and falls back for unsupported files", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-context-structural-"))
    writeFileSync(join(root, "feature.ts"), "import { readFileSync } from 'node:fs'\nconst unrelated = 1\nexport function targetFeature(name: string) { return readFileSync(name, 'utf8') }\nconst after = 2")
    writeFileSync(join(root, "feature.py"), "def target_feature(name):\n  return name")
    const index = createProjectContextIndex(root)
    const result = await index.select("target feature")
    const typescript = result.items.find((item) => item.path === "feature.ts")
    const python = result.items.find((item) => item.path === "feature.py")
    expect(typescript?.excerpt).toContain("function targetFeature(name: string)")
    expect(typescript?.excerpt).toContain("import { readFileSync }")
    expect(typescript?.excerpt).not.toContain("const unrelated")
    expect(typescript?.reason).toContain("structural lexical")
    expect(python?.reason).toContain("lexical")
    index.close()
  })

  it("supports an explicit project extension allowlist", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-context-extensions-"))
    writeFileSync(join(root, "feature.txt"), "feature text")
    const index = createProjectContextIndex(root, { extensions: ["txt"] })
    const result = await index.select("feature")
    expect(result.items.map((item) => item.path)).toEqual(["feature.txt"])
    index.close()
  })

  it("expands retrieval through the dependency graph under the token budget", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-context-graph-"))
    writeFileSync(join(root, "main.ts"), "import { helper } from './lib'\nexport function main() { return helper() }")
    writeFileSync(join(root, "lib.ts"), "export function helper() { return 'shared' }")
    writeFileSync(join(root, "unrelated.ts"), "export const noise = true")
    const index = createProjectContextIndex(root)
    const result = await index.select("main")
    const lib = result.items.find((item) => item.path === "lib.ts")
    expect(lib).toBeDefined()
    expect(lib?.reason).toContain("graph:")
    expect(result.telemetry.graphExpandedFiles).toBeGreaterThan(0)
    expect(result.telemetry.graphEdges).toBeGreaterThan(0)
    index.close()
  })

  it("keeps graph-expanded excerpts within the char budget", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-context-graph-budget-"))
    writeFileSync(join(root, "main.ts"), "import { helper } from './lib'\nexport function main() { return helper() }")
    writeFileSync(join(root, "lib.ts"), "export function helper() { return 'shared '.repeat(1000) }")
    const index = createProjectContextIndex(root)
    const result = await index.select("main", 6, 120)
    expect(result.estimatedTokens).toBeLessThanOrEqual(30)
    for (const item of result.items) expect(item.excerpt.length).toBeLessThanOrEqual(120)
    index.close()
  })

  it("runs hybrid semantic retrieval offline with local embeddings", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-context-hybrid-"))
    writeFileSync(join(root, "feature.ts"), "export function feature() { return 'feature configuration'.repeat(50) }")
    writeFileSync(join(root, "noise.ts"), "export function noise() { return 'noise noise'.repeat(50) }")
    const index = createProjectContextIndex(root, { hybrid: true })
    const result = await index.select("load the configuration", 4)
    expect(result.telemetry.hybrid).toBe(true)
    expect(result.telemetry.semanticCandidates).toBeGreaterThan(0)
    expect(result.items[0]?.path).toBe("feature.ts")
    index.close()
  })

  it("reuses a persisted vector index when sources are unchanged", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-context-hybrid-persist-"))
    writeFileSync(join(root, "feature.ts"), "export function feature() { return 'feature config'.repeat(50) }")
    const first = createProjectContextIndex(root, { hybrid: true })
    await first.select("config feature")
    first.close()
    const second = createProjectContextIndex(root, { hybrid: true })
    const result = await second.select("config feature")
    expect(result.items[0]?.path).toBe("feature.ts")
    second.close()
  })

  it("keeps the event loop alive during the first index build so the UI spinner can animate", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-context-yield-"))
    for (let index = 0; index < 200; index++) {
      writeFileSync(join(root, `file${index}.ts`), `export function fn${index}() { return 'payload '.repeat(80) }\nimport { helper${index % 5} } from './helper${index % 5}'`)
    }
    for (let index = 0; index < 5; index++) {
      writeFileSync(join(root, `helper${index}.ts`), `export function helper${index}() { return 'helper payload '.repeat(80) }`)
    }
    const index = createProjectContextIndex(root)
    let ticks = 0
    const timer = setInterval(() => ticks++, 5)
    try {
      await index.select("payload", 4, 100_000)
    } finally {
      clearInterval(timer)
      index.close()
    }
    // With cooperative yields the timer fires during the build; a fully
    // synchronous build would starve it entirely.
    expect(ticks).toBeGreaterThan(0)
  })
})

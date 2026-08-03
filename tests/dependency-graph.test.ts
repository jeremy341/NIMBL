import { describe, expect, it } from "vitest"
import { buildDependencyGraph } from "@/core/dependency-graph"

describe("dependency graph", () => {
  it("builds stable file and symbol identities", () => {
    const graph = buildDependencyGraph([
      { path: "src/a.ts", source: "export function alpha() { return 1 }\nexport const beta = 2" },
      { path: "src/b.ts", source: "export class Gamma {}" },
    ])
    expect(graph.fileCount()).toBe(2)
    expect(graph.symbolCount()).toBe(3)
    expect(graph.edgeCount()).toBeGreaterThanOrEqual(3)
  })

  it("tracks relative imports and expands seeds through them", () => {
    const graph = buildDependencyGraph([
      { path: "src/a.ts", source: "import { helper } from './b'\nexport function alpha() { return helper() }" },
      { path: "src/b.ts", source: "export function helper() { return 1 }" },
    ])
    const expanded = graph.expandFrom(["src/a.ts"], 10_000)
    expect(expanded.map((entry) => entry.path)).toContain("src/b.ts")
    expect(expanded.find((entry) => entry.path === "src/b.ts")?.reason).toContain("imports")
    expect(expanded.find((entry) => entry.path === "src/b.ts")?.reason).toContain("helper called")
  })

  it("tracks cross-file references to unique symbols", () => {
    const graph = buildDependencyGraph([
      { path: "src/main.ts", source: "export function main() { return helper() }\nfunction local() { return 1 }" },
      { path: "src/lib.ts", source: "export function helper() { return 2 }" },
    ])
    const expanded = graph.expandFrom(["src/lib.ts"], 10_000)
    expect(expanded.map((entry) => entry.path)).toContain("src/main.ts")
    expect(expanded.find((entry) => entry.path === "src/main.ts")?.reason).toContain("helper called")
  })

  it("does not link ambiguous symbol names", () => {
    const graph = buildDependencyGraph([
      { path: "src/a.ts", source: "export function shared() { return 1 }" },
      { path: "src/b.ts", source: "export function shared() { return 2 }\nexport function caller() { return shared() }" },
    ])
    const expanded = graph.expandFrom(["src/a.ts"], 10_000)
    expect(expanded.map((entry) => entry.path)).not.toContain("src/b.ts")
  })

  it("tracks inheritance relationships", () => {
    const graph = buildDependencyGraph([
      { path: "src/base.ts", source: "export class Base {}\nexport interface Contract {}" },
      { path: "src/child.ts", source: "import { Base } from './base'\nexport class Child extends Base implements Contract {}" },
    ])
    const expanded = graph.expandFrom(["src/child.ts"], 10_000)
    const base = expanded.find((entry) => entry.path === "src/base.ts")
    expect(base?.reason).toContain("inherits")
  })

  it("tracks test relationships for test files", () => {
    const graph = buildDependencyGraph([
      { path: "src/feature.ts", source: "export function feature() { return 1 }" },
      { path: "src/feature.test.ts", source: "import { feature } from './feature'\nimport { describe, it, expect } from 'vitest'\ndescribe('feature', () => it('works', () => expect(feature()).toBe(1)))" },
    ])
    const expanded = graph.expandFrom(["src/feature.ts"], 10_000)
    const test = expanded.find((entry) => entry.path === "src/feature.test.ts")
    expect(test?.reason).toContain("tests")
  })

  it("recomputes edges incrementally when a file changes", () => {
    const graph = buildDependencyGraph([
      { path: "src/a.ts", source: "import { x } from './b'\nexport function alpha() { return x }" },
      { path: "src/b.ts", source: "export const x = 1" },
      { path: "src/c.ts", source: "export const y = 2" },
    ])
    graph.invalidate("src/a.ts", "import { y } from './c'\nexport function alpha() { return y }")
    const expanded = graph.expandFrom(["src/a.ts"], 10_000)
    expect(expanded.map((entry) => entry.path)).toContain("src/c.ts")
    expect(expanded.map((entry) => entry.path)).not.toContain("src/b.ts")
  })

  it("respects the token budget and entry limit during expansion", () => {
    const graph = buildDependencyGraph([
      { path: "src/main.ts", source: "import { a } from './a'\nimport { b } from './b'\nimport { c } from './c'\nexport function main() { return [a, b, c] }" },
      { path: "src/a.ts", source: "export const a = 'a'.repeat(400)" },
      { path: "src/b.ts", source: "export const b = 'b'.repeat(400)" },
      { path: "src/c.ts", source: "export const c = 'c'.repeat(400)" },
    ])
    const capped = graph.expandFrom(["src/main.ts"], 500, 2)
    expect(capped.length).toBeLessThanOrEqual(2)
    expect(capped.reduce((total, entry) => total + entry.excerpt.length, 0)).toBeLessThanOrEqual(500)
    expect(capped.length).toBe(2)
  })
})

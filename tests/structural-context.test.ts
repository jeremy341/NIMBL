import { describe, expect, it } from "vitest"
import { structuralChunks } from "@/core/structural-context"

describe("structural context", () => {
  it("extracts coherent TypeScript declarations with their signatures", () => {
    const source = [
      "import { readFileSync } from 'node:fs'",
      "export interface Config { enabled: boolean }",
      "export function loadConfig(path: string): Config { return { enabled: Boolean(readFileSync(path)) } }",
      "const internal = 1",
    ].join("\n")
    const chunks = structuralChunks("config.ts", source)
    expect(chunks?.map((chunk) => chunk.name)).toEqual(expect.arrayContaining(["Config", "loadConfig", "internal"]))
    expect(chunks?.some((chunk) => chunk.kind === "ImportDeclaration")).toBe(true)
    expect(chunks?.find((chunk) => chunk.name === "loadConfig")?.text).toContain("path: string")
  })

  it("extracts top-level JSON properties as valid source units", () => {
    const chunks = structuralChunks("config.json", '{\n  "provider": "openai",\n  "enabled": true\n}')
    expect(chunks?.map((chunk) => chunk.name)).toEqual(["provider", "enabled"])
    expect(chunks?.[0]?.text).toContain('"provider"')
  })

  it("falls back cleanly for unsupported and malformed source", () => {
    expect(structuralChunks("main.py", "def feature():\n  return True")).toBeUndefined()
    expect(structuralChunks("broken.ts", "export function {")).toBeUndefined()
  })

  it("reduces a declaration-focused excerpt without breaking its syntax", () => {
    const source = ["const unrelated = 'x'.repeat(100)", "export function target(value: string) { return value.toUpperCase() }", "const trailing = 'y'.repeat(100)"].join("\n")
    const chunk = structuralChunks("feature.ts", source)?.find((item) => item.name === "target")
    expect(chunk?.text.length).toBeLessThan(source.length)
    expect(chunk?.text).toBe("export function target(value: string) { return value.toUpperCase() }")
  })
})

import { describe, expect, it } from "vitest"
import { applyEdit } from "@/core/edit-apply"

describe("edit-apply cascade", () => {
  it("replaces exact unique text", () => {
    expect(applyEdit("const x = 1", "x = 1", "y = 2")).toEqual({ ok: true, after: "const y = 2" })
  })

  it("rejects ambiguous matches without replaceAll", () => {
    expect(applyEdit("a b a", "a", "c")).toEqual({ ok: false, reason: "ambiguous" })
  })

  it("replaces all when replaceAll is set", () => {
    expect(applyEdit("a b a", "a", "c", true)).toEqual({ ok: true, after: "c b c" })
  })

  it("returns missing when text is absent", () => {
    expect(applyEdit("hello", "world", "there")).toEqual({ ok: false, reason: "missing" })
  })

  it("allows a small edit into a larger file (not disproportionate)", () => {
    const source = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n")
    const small = "line 0\nline 1"
    const result = applyEdit(source, small, "line 0 changed\nline 1")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.after).toContain("line 0 changed")
  })

  it("rejects a fuzzy match that would replace the whole file", () => {
    const source = "first\nsecond\nthird"
    const result = applyEdit(source, "FIRST\nSECOND\nTHIRD", "changed")
    expect(result.ok).toBe(false)
    expect(result).toEqual({ ok: false, reason: "unbalanced" })
  })

  it("is tolerant of line-ending and indentation differences", () => {
    const source = "function add(a, b) {\n    return a + b\n}"
    const result = applyEdit(source, "  return a + b", "  return a + b + 1")
    expect(result.ok).toBe(true)
  })

  it("matches whitespace-normalized text", () => {
    const source = "const value =   {  a: 1 }"
    const result = applyEdit(source, "const value = { a: 1 }", "const value = null")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.after).toContain("const value = null")
  })

  it("handles indentation-flexible blocks", () => {
    const source = "if (x) {\n    foo()\n    bar()\n}"
    const result = applyEdit(source, "    foo()\n    bar()", "    baz()")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.after).toContain("baz()")
  })

  it("uses trimmed boundary when exact prefix fails", () => {
    const source = "print(  hello world  )"
    const result = applyEdit(source, "hello world", "goodbye")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.after).toContain("goodbye")
  })

  it("uses context-aware matching for multi-line blocks", () => {
    const source = "start\nline one\nline two\nline three\nend"
    const result = applyEdit(source, "LINE ONE\nLINE TWO\nLINE THREE", "changed")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.after).toContain("changed")
  })

  it("uses block anchors with fuzzy first/last lines within a larger file", () => {
    const source = "function foo() {\n  // header\n  return 1\n}\n\nfunction bar() {\n  return 2\n}"
    const result = applyEdit(source, "function foo() {\n  return 1\n}", "function foo() {\n  return 2\n}")
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.after).toContain("return 2")
  })
})

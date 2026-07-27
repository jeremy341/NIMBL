import { describe, expect, it } from "vitest"
import { permissionFor } from "@/core/permissions"

describe("permission rules", () => {
  it("uses the last matching wildcard rule and a global default", () => {
    const permissions = { "*": "ask", bash: { "*": "deny", "git status*": "allow" }, edit: { "*": "ask", "docs/*.md": "allow" } } as const
    expect(permissionFor(permissions, { tool: "bash", target: "git status --short" })).toBe("allow")
    expect(permissionFor(permissions, { tool: "bash", target: "rm -rf tmp" })).toBe("deny")
    expect(permissionFor(permissions, { tool: "edit", target: "docs/README.md" })).toBe("allow")
    expect(permissionFor(permissions, { tool: "webfetch", target: "example.com" })).toBe("ask")
  })
})

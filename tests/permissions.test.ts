import { describe, expect, it } from "vitest"
import { permissionDecision, permissionFor } from "@/core/permissions"

describe("permission rules", () => {
  it("uses the last matching wildcard rule and a global default", () => {
    const permissions = { "*": "ask", bash: { "*": "deny", "git status*": "allow" }, edit: { "*": "ask", "docs/*.md": "allow" } } as const
    expect(permissionFor(permissions, { tool: "bash", target: "git status --short" })).toBe("allow")
    expect(permissionFor(permissions, { tool: "bash", target: "rm -rf tmp" })).toBe("deny")
    expect(permissionFor(permissions, { tool: "edit", target: "docs/README.md" })).toBe("allow")
    expect(permissionFor(permissions, { tool: "webfetch", target: "example.com" })).toBe("ask")
  })

  it("does not let a global *: allow rule implicitly allow external directories", () => {
    const permissions = { "*": "allow", external_directory: "ask" } as const
    expect(permissionFor(permissions, { tool: "external_directory", target: "C:\\Users\\me\\shared" })).toBe("ask")
    expect(permissionDecision(permissions, { tool: "external_directory", target: "C:\\Users\\me\\shared" }).matchedRule).toBe("external_directory")
  })

  it("resolves external_directory from explicit allow/deny rules", () => {
    const allow = { external_directory: { "C:\\Users\\me\\shared\\*": "allow" } } as const
    expect(permissionFor(allow, { tool: "external_directory", target: "C:\\Users\\me\\shared\\docs" })).toBe("allow")
    const deny = { external_directory: { "*": "deny" } } as const
    expect(permissionFor(deny, { tool: "external_directory", target: "C:\\Users\\me\\shared" })).toBe("deny")
  })
})

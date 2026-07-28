import { describe, expect, it } from "vitest"
import { DEFAULT_SETTINGS } from "@/core/settings"
import { routeProvider } from "@/core/routing"

describe("provider routing", () => {
  it("prefers a local provider for privacy-sensitive prompts", () => {
    expect(routeProvider("keep this private", DEFAULT_SETTINGS)?.local).toBe(true)
  })
})

describe("default keybindings", () => {
  it("does not reserve terminal flow-control keys", () => {
    expect(Object.values(DEFAULT_SETTINGS.keybinds)).not.toContain("ctrl+s")
    expect(Object.values(DEFAULT_SETTINGS.keybinds)).not.toContain("ctrl+q")
  })
})

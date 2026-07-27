import { describe, expect, it } from "vitest"
import { DEFAULT_SETTINGS } from "@/core/settings"
import { routeProvider } from "@/core/routing"

describe("provider routing", () => {
  it("prefers a local provider for privacy-sensitive prompts", () => {
    expect(routeProvider("keep this private", DEFAULT_SETTINGS)?.local).toBe(true)
  })
})

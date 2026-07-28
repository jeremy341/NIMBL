import { describe, expect, it } from "vitest"
import { ASSISTANT_RESPONSE_STYLE, stripEmojis } from "@/core/response-style"

describe("assistant response style", () => {
  it("forbids emojis in generated responses", () => {
    expect(ASSISTANT_RESPONSE_STYLE).toContain("Never use emoji characters")
  })

  it("removes provider emojis before rendering", () => {
    expect(stripEmojis("Done 🚀 ✅ text ©️")).toBe("Done   text ")
    expect(stripEmojis("flags 🇺🇸 and keycap 1️⃣")).toBe("flags  and keycap 1")
  })
})

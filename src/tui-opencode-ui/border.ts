import type { BoxRenderable } from "@opentui/core"

export const EmptyBorder = {
  topLeft: "",
  bottomLeft: "",
  vertical: "",
  topRight: "",
  bottomRight: "",
  horizontal: " ",
  bottomT: "",
  topT: "",
  cross: "",
  leftT: "",
  rightT: "",
}

export const SplitBorder = {
  border: ["left" as const, "right" as const],
  customBorderChars: {
    ...EmptyBorder,
    vertical: "┃",
  },
}

export function setBorder(
  box: BoxRenderable,
  border: Array<"top" | "right" | "bottom" | "left">,
  customBorderChars = EmptyBorder,
) {
  box.border = border
  box.customBorderChars = customBorderChars
}

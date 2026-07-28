import type { AgentMode } from "./types"

// OpenCode's dark semantic theme with NIMBL green as the primary accent.
export const theme = {
  primary: "#06402b",
  secondary: "#5c9cf5",
  accent: "#9d7cd8",
  error: "#e06c75",
  warning: "#f5a742",
  success: "#7fd88f",
  info: "#56b6c2",
  text: "#eeeeee",
  textMuted: "#808080",
  background: "#0a0a0a",
  backgroundPanel: "#141414",
  backgroundElement: "#1e1e1e",
  backgroundMenu: "#1e1e1e",
  borderSubtle: "#3c3c3c",
  border: "#484848",
  borderActive: "#606060",
  selectedListItemText: "#ffffff",

  diffAdded: "#4fd6be",
  diffRemoved: "#c53b53",
  diffContext: "#828bb8",
  diffHunkHeader: "#828bb8",
  diffHighlightAdded: "#b8db87",
  diffHighlightRemoved: "#e26a75",
  diffAddedBg: "#20303b",
  diffRemovedBg: "#37222c",
  diffContextBg: "#141414",
  diffLineNumber: "#8f8f8f",
  diffAddedLineNumberBg: "#1b2b34",
  diffRemovedLineNumberBg: "#2d1f26",

  markdownText: "#eeeeee",
  markdownHeading: "#9d7cd8",
  markdownLink: "#06402b",
  markdownLinkText: "#56b6c2",
  markdownCode: "#7fd88f",
  markdownBlockQuote: "#e5c07b",
  markdownEmph: "#e5c07b",
  markdownStrong: "#f5a742",
  markdownHorizontalRule: "#808080",
  markdownListItem: "#06402b",
  markdownListEnumeration: "#56b6c2",
  markdownImage: "#06402b",
  markdownImageText: "#56b6c2",
  markdownCodeBlock: "#eeeeee",

  syntaxComment: "#808080",
  syntaxKeyword: "#9d7cd8",
  syntaxFunction: "#06402b",
  syntaxVariable: "#e06c75",
  syntaxString: "#7fd88f",
  syntaxNumber: "#f5a742",
  syntaxType: "#e5c07b",
  syntaxOperator: "#56b6c2",
  syntaxPunctuation: "#eeeeee",
} as const

export function agentColor(mode: AgentMode): string {
  if (mode === "build") return theme.secondary
  if (mode === "plan") return theme.accent
  if (mode === "explain") return theme.success
  return theme.warning
}

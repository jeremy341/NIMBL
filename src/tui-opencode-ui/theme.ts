import { createSignal } from "solid-js"
import type { AgentMode } from "./types"

export type ThemeName = "nimbl" | "opencode" | "mono"

export interface ThemePalette {
  brand: string
  primary: string
  primaryForeground: string
  secondary: string
  accent: string
  error: string
  warning: string
  success: string
  info: string
  text: string
  textMuted: string
  background: string
  backgroundPanel: string
  backgroundElement: string
  backgroundMenu: string
  borderSubtle: string
  border: string
  borderActive: string
  selectedListItemText: string

  diffAdded: string
  diffRemoved: string
  diffContext: string
  diffHunkHeader: string
  diffHighlightAdded: string
  diffHighlightRemoved: string
  diffAddedBg: string
  diffRemovedBg: string
  diffContextBg: string
  diffLineNumber: string
  diffAddedLineNumberBg: string
  diffRemovedLineNumberBg: string

  markdownText: string
  markdownHeading: string
  markdownLink: string
  markdownLinkText: string
  markdownCode: string
  markdownBlockQuote: string
  markdownEmph: string
  markdownStrong: string
  markdownHorizontalRule: string
  markdownListItem: string
  markdownListEnumeration: string
  markdownImage: string
  markdownImageText: string
  markdownCodeBlock: string

  syntaxComment: string
  syntaxKeyword: string
  syntaxFunction: string
  syntaxVariable: string
  syntaxString: string
  syntaxNumber: string
  syntaxType: string
  syntaxOperator: string
  syntaxPunctuation: string

  thinkingOpacity: number
}

const NIMBL_FOREGROUND = "#4ade80"

const nimblTheme: ThemePalette = {
  brand: "#16885a",
  primary: "#06402b",
  primaryForeground: NIMBL_FOREGROUND,
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
  markdownLink: NIMBL_FOREGROUND,
  markdownLinkText: "#56b6c2",
  markdownCode: "#7fd88f",
  markdownBlockQuote: "#e5c07b",
  markdownEmph: "#e5c07b",
  markdownStrong: "#f5a742",
  markdownHorizontalRule: "#808080",
  markdownListItem: NIMBL_FOREGROUND,
  markdownListEnumeration: "#56b6c2",
  markdownImage: NIMBL_FOREGROUND,
  markdownImageText: "#56b6c2",
  markdownCodeBlock: "#eeeeee",

  syntaxComment: "#808080",
  syntaxKeyword: "#9d7cd8",
  syntaxFunction: NIMBL_FOREGROUND,
  syntaxVariable: "#e06c75",
  syntaxString: "#7fd88f",
  syntaxNumber: "#f5a742",
  syntaxType: "#e5c07b",
  syntaxOperator: "#56b6c2",
  syntaxPunctuation: "#eeeeee",

  thinkingOpacity: 0.6,
}

// Mirrors opencode's default "opencode" theme: peach primary, same neutrals.
const opencodeTheme: ThemePalette = {
  brand: "#d97757",
  primary: "#fab283",
  primaryForeground: "#0a0a0a",
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
  selectedListItemText: "#0a0a0a",

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
  markdownLink: "#fab283",
  markdownLinkText: "#56b6c2",
  markdownCode: "#7fd88f",
  markdownBlockQuote: "#e5c07b",
  markdownEmph: "#e5c07b",
  markdownStrong: "#f5a742",
  markdownHorizontalRule: "#808080",
  markdownListItem: "#fab283",
  markdownListEnumeration: "#56b6c2",
  markdownImage: "#fab283",
  markdownImageText: "#56b6c2",
  markdownCodeBlock: "#eeeeee",

  syntaxComment: "#808080",
  syntaxKeyword: "#9d7cd8",
  syntaxFunction: "#fab283",
  syntaxVariable: "#e06c75",
  syntaxString: "#7fd88f",
  syntaxNumber: "#f5a742",
  syntaxType: "#e5c07b",
  syntaxOperator: "#56b6c2",
  syntaxPunctuation: "#eeeeee",

  thinkingOpacity: 0.6,
}

// Monochrome theme: pure grays with a single accent reserved for NIMBL green.
const monoTheme: ThemePalette = {
  brand: "#4ade80",
  primary: "#d4d4d4",
  primaryForeground: "#0a0a0a",
  secondary: "#b8b8b8",
  accent: "#9a9a9a",
  error: "#f2a0a0",
  warning: "#e6c07a",
  success: "#b4e6b4",
  info: "#a8d4d4",
  text: "#eeeeee",
  textMuted: "#8a8a8a",
  background: "#0a0a0a",
  backgroundPanel: "#121212",
  backgroundElement: "#1c1c1c",
  backgroundMenu: "#1c1c1c",
  borderSubtle: "#333333",
  border: "#464646",
  borderActive: "#5e5e5e",
  selectedListItemText: "#0a0a0a",

  diffAdded: "#a3d9c8",
  diffRemoved: "#d99a9a",
  diffContext: "#8a8a8a",
  diffHunkHeader: "#8a8a8a",
  diffHighlightAdded: "#c8e6d6",
  diffHighlightRemoved: "#e6bcbc",
  diffAddedBg: "#1c2a24",
  diffRemovedBg: "#2a1c1c",
  diffContextBg: "#121212",
  diffLineNumber: "#8a8a8a",
  diffAddedLineNumberBg: "#16241e",
  diffRemovedLineNumberBg: "#241616",

  markdownText: "#eeeeee",
  markdownHeading: "#9a9a9a",
  markdownLink: "#4ade80",
  markdownLinkText: "#a8d4d4",
  markdownCode: "#b4e6b4",
  markdownBlockQuote: "#c8c8c8",
  markdownEmph: "#c8c8c8",
  markdownStrong: "#e6c07a",
  markdownHorizontalRule: "#808080",
  markdownListItem: "#4ade80",
  markdownListEnumeration: "#a8d4d4",
  markdownImage: "#4ade80",
  markdownImageText: "#a8d4d4",
  markdownCodeBlock: "#eeeeee",

  syntaxComment: "#8a8a8a",
  syntaxKeyword: "#9a9a9a",
  syntaxFunction: "#4ade80",
  syntaxVariable: "#d9a0a0",
  syntaxString: "#b4e6b4",
  syntaxNumber: "#e6c07a",
  syntaxType: "#c8c8c8",
  syntaxOperator: "#a8d4d4",
  syntaxPunctuation: "#eeeeee",

  thinkingOpacity: 0.6,
}

export const THEMES: Record<ThemeName, ThemePalette> = {
  nimbl: nimblTheme,
  opencode: opencodeTheme,
  mono: monoTheme,
}

export const THEME_NAMES: ThemeName[] = ["nimbl", "opencode", "mono"]

const [activeTheme, setActiveTheme] = createSignal<ThemeName>("nimbl")

export function currentThemeName(): ThemeName {
  return activeTheme()
}

export function setThemeName(name: ThemeName) {
  setActiveTheme(name)
}

// Reactive theme proxy: every `theme.<token>` read tracks the active theme
// signal, so all existing components re-render when the theme switches.
export const theme = new Proxy({} as ThemePalette, {
  get(_target, prop: string) {
    return (THEMES[activeTheme()] as unknown as Record<string, unknown>)[prop]
  },
  has(_target, prop) {
    return prop in THEMES.nimbl
  },
})

export function agentColor(mode: AgentMode): string {
  if (mode === "build") return theme.secondary
  if (mode === "plan") return theme.accent
  if (mode === "explain") return theme.success
  return theme.warning
}

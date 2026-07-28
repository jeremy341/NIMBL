import { SyntaxStyle } from "@opentui/core"
import { theme } from "./theme"

export const syntaxStyle = SyntaxStyle.fromTheme([
  { scope: ["comment"], style: { foreground: theme.syntaxComment, italic: true } },
  { scope: ["keyword", "keyword.modifier", "keyword.directive"], style: { foreground: theme.syntaxKeyword } },
  { scope: ["function", "function.call", "method", "method.call"], style: { foreground: theme.syntaxFunction } },
  { scope: ["variable", "variable.member"], style: { foreground: theme.syntaxVariable } },
  { scope: ["string", "string.special"], style: { foreground: theme.syntaxString } },
  { scope: ["number", "constant"], style: { foreground: theme.syntaxNumber } },
  { scope: ["type", "type.builtin", "constructor"], style: { foreground: theme.syntaxType } },
  { scope: ["operator", "punctuation.special"], style: { foreground: theme.syntaxOperator } },
  { scope: ["punctuation", "punctuation.bracket"], style: { foreground: theme.syntaxPunctuation } },
  { scope: ["markup.heading"], style: { foreground: theme.markdownHeading, bold: true } },
  { scope: ["markup.heading.1"], style: { foreground: theme.markdownHeading, bold: true, underline: true } },
  { scope: ["markup.heading.2", "markup.heading.3", "markup.heading.4"], style: { foreground: theme.markdownHeading, bold: true } },
  { scope: ["markup.bold", "markup.strong"], style: { foreground: theme.markdownStrong, bold: true } },
  { scope: ["markup.italic"], style: { foreground: theme.markdownEmph, italic: true } },
  { scope: ["markup.list"], style: { foreground: theme.markdownListItem } },
  { scope: ["markup.quote"], style: { foreground: theme.markdownBlockQuote, italic: true } },
  { scope: ["markup.raw", "markup.raw.block", "markup.raw.inline"], style: { foreground: theme.markdownCode } },
  { scope: ["markup.link"], style: { foreground: theme.markdownLink, underline: true } },
])

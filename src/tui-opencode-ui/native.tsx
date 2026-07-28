import { type DiffRenderable, type MarkdownRenderable, type SyntaxStyle } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect } from "solid-js"
import { syntaxStyle } from "./syntax"
import { theme } from "./theme"

export interface NativeMarkdownProps {
  content: string
  color?: string
}

export function NativeMarkdown(props: NativeMarkdownProps) {
  let markdown: MarkdownRenderable | undefined
  const requiredProps = {} as { syntaxStyle: SyntaxStyle }

  function apply(content: string, color: string) {
    if (!markdown || markdown.isDestroyed) return
    // OpenTUI 0.4.5's Solid prop bridge strips prototypes from class-valued props.
    markdown.syntaxStyle = syntaxStyle
    markdown.streaming = true
    markdown.internalBlockMode = "top-level"
    markdown.tableOptions = { style: "grid" }
    markdown.conceal = true
    markdown.fg = color
    markdown.bg = theme.background
    markdown.content = content
  }

  createEffect(() => {
    const content = props.content
    const color = props.color ?? theme.markdownText
    apply(content, color)
  })

  return (
    <markdown
      {...requiredProps}
      ref={(value: MarkdownRenderable) => {
        markdown = value
        apply(props.content, props.color ?? theme.markdownText)
      }}
    />
  )
}

export interface NativeDiffProps {
  diff: string
  filetype?: string
}

export function NativeDiff(props: NativeDiffProps) {
  const dimensions = useTerminalDimensions()
  let renderable: DiffRenderable | undefined

  function apply(diff: string, type: string | undefined, width: number) {
    if (!renderable || renderable.isDestroyed) return
    renderable.syntaxStyle = syntaxStyle
    renderable.view = width > 120 ? "split" : "unified"
    renderable.filetype = type
    renderable.showLineNumbers = true
    renderable.width = "100%"
    renderable.wrapMode = "word"
    renderable.fg = theme.text
    renderable.addedBg = theme.diffAddedBg
    renderable.removedBg = theme.diffRemovedBg
    renderable.contextBg = theme.diffContextBg
    renderable.addedSignColor = theme.diffHighlightAdded
    renderable.removedSignColor = theme.diffHighlightRemoved
    renderable.lineNumberFg = theme.diffLineNumber
    renderable.lineNumberBg = theme.diffContextBg
    renderable.addedLineNumberBg = theme.diffAddedLineNumberBg
    renderable.removedLineNumberBg = theme.diffRemovedLineNumberBg
    renderable.diff = diff
  }

  createEffect(() => {
    const diff = props.diff
    const type = props.filetype
    const width = dimensions().width
    apply(diff, type, width)
  })

  return (
    <diff
      ref={(value: DiffRenderable) => {
        renderable = value
        apply(props.diff, props.filetype, dimensions().width)
      }}
    />
  )
}

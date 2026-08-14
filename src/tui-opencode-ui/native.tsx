import { type CodeRenderable, type DiffRenderable, type MarkdownRenderable, type SyntaxStyle } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect } from "solid-js"
import { createSyntaxStyle } from "./syntax"
import { theme } from "./theme"

export interface NativeMarkdownProps {
  content: string
  color?: string
  conceal?: boolean
}

export function NativeMarkdown(props: NativeMarkdownProps) {
  let markdown: MarkdownRenderable | undefined
  let currentContent: string | undefined
  let currentColor: string | undefined
  let currentConceal: boolean | undefined
  let currentStyle: SyntaxStyle | undefined
  const requiredProps = {} as { syntaxStyle: SyntaxStyle }

  function initialize(value: MarkdownRenderable) {
    markdown = value
    currentContent = undefined
    currentColor = undefined
    currentConceal = undefined
    currentStyle = undefined
    // OpenTUI 0.4.5's Solid prop bridge strips prototypes from class-valued props.
    value.streaming = true
    value.internalBlockMode = "top-level"
    value.tableOptions = { style: "grid" }
    value.conceal = props.conceal ?? true
    value.bg = theme.background
    applyStyle(value)
    update(props.content, props.color ?? theme.markdownText, props.conceal ?? true)
  }

  function applyStyle(value: MarkdownRenderable) {
    const style = createSyntaxStyle()
    if (currentStyle !== style) {
      value.syntaxStyle = style
      currentStyle = style
    }
  }

  function update(content: string, color: string, conceal: boolean) {
    if (!markdown || markdown.isDestroyed) return
    if (currentColor !== color) {
      markdown.fg = color
      currentColor = color
    }
    if (currentConceal !== conceal) {
      markdown.conceal = conceal
      currentConceal = conceal
    }
    if (currentContent !== content) {
      markdown.content = content
      currentContent = content
    }
  }

  createEffect(() => {
    const content = props.content
    const color = props.color ?? theme.markdownText
    const conceal = props.conceal ?? true
    if (markdown && !markdown.isDestroyed) applyStyle(markdown)
    update(content, color, conceal)
  })

  return <markdown {...requiredProps} ref={initialize} />
}

export function NativeCode(props: { content: string; filetype?: string }) {
  let renderable: CodeRenderable | undefined
  const requiredProps = {} as { syntaxStyle: SyntaxStyle }
  createEffect(() => {
    if (!renderable || renderable.isDestroyed) return
    renderable.content = props.content
    renderable.filetype = props.filetype || "text"
    renderable.syntaxStyle = createSyntaxStyle()
    renderable.fg = theme.markdownCode
    renderable.bg = theme.backgroundPanel
  })
  return (
    <code
      {...requiredProps}
      ref={(value: CodeRenderable) => {
        renderable = value
        value.streaming = false
        value.drawUnstyledText = true
        value.fg = theme.markdownCode
        value.bg = theme.backgroundPanel
        value.width = "100%"
        value.content = props.content
        value.filetype = props.filetype || "text"
        value.syntaxStyle = createSyntaxStyle()
      }}
    />
  )
}

export interface NativeDiffProps {
  diff: string
  filetype?: string
  width?: number
}

export function NativeDiff(props: NativeDiffProps) {
  const dimensions = useTerminalDimensions()
  let renderable: DiffRenderable | undefined
  let currentDiff: string | undefined
  let currentFiletype: string | undefined
  let currentView: "split" | "unified" | undefined

  function applyColors(value: DiffRenderable) {
    value.syntaxStyle = createSyntaxStyle()
    value.fg = theme.text
    value.addedBg = theme.diffAddedBg
    value.removedBg = theme.diffRemovedBg
    value.contextBg = theme.diffContextBg
    value.addedSignColor = theme.diffHighlightAdded
    value.removedSignColor = theme.diffHighlightRemoved
    value.lineNumberFg = theme.diffLineNumber
    value.lineNumberBg = theme.diffContextBg
    value.addedLineNumberBg = theme.diffAddedLineNumberBg
    value.removedLineNumberBg = theme.diffRemovedLineNumberBg
  }

  function initialize(value: DiffRenderable) {
    renderable = value
    currentDiff = undefined
    currentFiletype = undefined
    currentView = undefined
    // Assign this imperatively because OpenTUI 0.4.5 strips class prototypes in JSX props.
    applyColors(value)
    value.showLineNumbers = true
    value.width = "100%"
    value.wrapMode = "word"
    update(props.diff, props.filetype, props.width ?? dimensions().width)
  }

  function update(diff: string, type: string | undefined, width: number) {
    if (!renderable || renderable.isDestroyed) return
    const view = width > 120 ? "split" : "unified"
    if (currentView !== view) {
      renderable.view = view
      currentView = view
    }
    if (currentFiletype !== type) {
      renderable.filetype = type
      currentFiletype = type
    }
    if (currentDiff !== diff) {
      renderable.diff = diff
      currentDiff = diff
    }
  }

  createEffect(() => {
    const diff = props.diff
    const type = props.filetype
    const width = props.width ?? dimensions().width
    if (renderable && !renderable.isDestroyed) applyColors(renderable)
    update(diff, type, width)
  })

  return <diff ref={initialize} />
}

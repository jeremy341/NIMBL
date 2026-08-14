function levenshtein(left: string, right: string): number {
  const a = left.length
  const b = right.length
  if (a === 0) return b
  if (b === 0) return a
  let prev = new Array<number>(b + 1)
  let curr = new Array<number>(b + 1)
  for (let j = 0; j <= b; j++) prev[j] = j
  for (let i = 1; i <= a; i++) {
    curr[0] = i
    for (let j = 1; j <= b; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    const swap = prev
    prev = curr
    curr = swap
  }
  return prev[b]
}

function similarity(left: string, right: string): number {
  const longer = Math.max(left.length, right.length)
  if (longer === 0) return 1
  return 1 - levenshtein(left, right) / longer
}

type Replacer = (source: string, oldText: string, newText: string) => string | undefined

function occurrences(source: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let index = source.indexOf(needle)
  while (index !== -1) {
    count++
    index = source.indexOf(needle, index + needle.length)
  }
  return count
}

function exactReplace(source: string, oldText: string, newText: string): string | undefined {
  if (occurrences(source, oldText) !== 1) return undefined
  return source.replace(oldText, newText)
}

function lineTrimmedReplace(source: string, oldText: string, newText: string): string | undefined {
  const trimmedOld = oldText.split("\n").map((line) => line.trim()).join("\n")
  const trimmedNew = newText.split("\n").map((line) => line.trim()).join("\n")
  const lines = source.split("\n")
  const oldLines = trimmedOld.split("\n")
  if (!oldLines.length) return undefined
  for (let i = 0; i <= lines.length - oldLines.length; i++) {
    const window = lines.slice(i, i + oldLines.length).map((line) => line.trim())
    if (window.join("\n") === trimmedOld) {
      const next = [...lines.slice(0, i), ...trimmedNew.split("\n"), ...lines.slice(i + oldLines.length)]
      return next.join("\n")
    }
  }
  return undefined
}

function whitespaceNormalizedReplace(source: string, oldText: string, newText: string): string | undefined {
  const collapse = (text: string) => text.replace(/\s+/g, " ").trim()
  const normOld = collapse(oldText)
  const normNew = collapse(newText)
  if (!normOld) return undefined
  const lines = source.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const start = i
    let buffer = ""
    for (let j = i; j < lines.length; j++) {
      buffer = buffer ? buffer + "\n" + lines[j]! : lines[j]!
      if (collapse(buffer) === normOld) {
        const head = lines.slice(0, start).join("\n")
        const tail = lines.slice(j + 1).join("\n")
        return [head, normNew, tail].filter((part) => part.length > 0).join("\n")
      }
      if (collapse(buffer).length > normOld.length) break
    }
  }
  return undefined
}

function indentationFlexibleReplace(source: string, oldText: string, newText: string): string | undefined {
  const oldLines = oldText.split("\n")
  if (oldLines.length < 2) return undefined
  const baseIndent = oldLines[0]?.match(/^(\s*)/)?.[1]?.length ?? 0
  const strippedOld = oldLines.map((line) => line.slice(baseIndent)).join("\n")
  const strippedNew = newText.split("\n").map((line) => line.slice(baseIndent)).join("\n")
  const sourceLines = source.split("\n")
  for (let i = 0; i <= sourceLines.length - oldLines.length; i++) {
    const windowIndent = sourceLines[i]?.match(/^(\s*)/)?.[1]?.length ?? 0
    const window = sourceLines.slice(i, i + oldLines.length).map((line) => line.slice(windowIndent)).join("\n")
    if (window === strippedOld) {
      const indent = sourceLines[i]?.match(/^(\s*)/)?.[1] ?? ""
      const next = [...sourceLines.slice(0, i), ...strippedNew.split("\n").map((line) => indent + line), ...sourceLines.slice(i + oldLines.length)]
      return next.join("\n")
    }
  }
  return undefined
}

function trimmedBoundaryReplace(source: string, oldText: string, newText: string): string | undefined {
  const trimmed = oldText.trim()
  const trimmedNew = newText.trim()
  if (!trimmed || trimmed === oldText) return undefined
  if (occurrences(source, trimmed) !== 1) return undefined
  return source.replace(trimmed, trimmedNew)
}

function contextAwareReplace(source: string, oldText: string, newText: string): string | undefined {
  const oldLines = oldText.split("\n")
  if (oldLines.length < 3) return undefined
  const sourceLines = source.split("\n")
  const middle = oldLines.slice(1, -1)
  for (let i = 0; i <= sourceLines.length - oldLines.length; i++) {
    const window = sourceLines.slice(i, i + oldLines.length)
    let matches = 0
    for (let k = 0; k < middle.length; k++) {
      const target = window[k + 1]
      if (target !== undefined && similarity(target.trim().toLowerCase(), middle[k]!.trim().toLowerCase()) >= 0.65) matches++
    }
    if (matches / middle.length >= 0.5) {
      const next = [...sourceLines.slice(0, i), ...newText.split("\n"), ...sourceLines.slice(i + oldLines.length)]
      return next.join("\n")
    }
  }
  return undefined
}

function blockAnchorReplace(source: string, oldText: string, newText: string): string | undefined {
  const oldLines = oldText.split("\n")
  if (oldLines.length < 2) return undefined
  const first = oldLines[0]!.trim()
  const last = oldLines.at(-1)!.trim()
  const sourceLines = source.split("\n")
  for (let i = 0; i < sourceLines.length; i++) {
    if (sourceLines[i]!.trim() !== first) continue
    let matched = 0
    for (let j = 0; j < oldLines.length && i + j < sourceLines.length; j++) {
      if (similarity(sourceLines[i + j]!.trim().toLowerCase(), oldLines[j]!.trim().toLowerCase()) >= 0.65) matched++
    }
    const candidate = sourceLines.slice(i, i + oldLines.length)
    if (candidate.at(-1)?.trim() === last && matched >= oldLines.length * 0.65) {
      const next = [...sourceLines.slice(0, i), ...newText.split("\n"), ...sourceLines.slice(i + oldLines.length)]
      return next.join("\n")
    }
  }
  return undefined
}

export type EditResult =
  | { ok: true; after: string }
  | { ok: false; reason: "missing" | "ambiguous" | "unbalanced" }

function isDisproportionateMatch(source: string, oldText: string): boolean {
  const sourceLines = source.split("\n").length
  const oldLines = oldText.split("\n").length
  // Every strategy bounds its match window to oldLines.length, so the only
  // "disproportionate" case is a fuzzy match replacing essentially the whole
  // file — which is what the exact path already handles precisely. Reject only
  // when oldText spans nearly the entire file (guards against a fuzzy matcher
  // grabbing the whole file when a small edit was intended).
  const spansWholeFile = oldLines >= 2 && oldLines >= sourceLines - 1 && source.length >= oldText.length * 0.8
  return spansWholeFile
}

export function applyEdit(source: string, oldText: string, newText: string, replaceAll = false): EditResult {
  if (oldText === newText) return { ok: true, after: source }

  const strategies: Replacer[] = [
    exactReplace,
    lineTrimmedReplace,
    blockAnchorReplace,
    whitespaceNormalizedReplace,
    indentationFlexibleReplace,
    trimmedBoundaryReplace,
    contextAwareReplace,
  ]

  const directCount = occurrences(source, oldText)
  if (directCount === 1) {
    return { ok: true, after: source.replace(oldText, newText) }
  }
  if (directCount > 1) {
    if (replaceAll) return { ok: true, after: source.split(oldText).join(newText) }
    return { ok: false, reason: "ambiguous" }
  }

  // Fuzzy strategies only: block a match that would silently replace nearly the
  // entire file (a fuzzy hit that size is almost always a wrong match). Exact
  // replacements above are unaffected.
  if (isDisproportionateMatch(source, oldText)) {
    return { ok: false, reason: "unbalanced" }
  }

  for (const strategy of strategies) {
    const result = strategy(source, oldText, newText)
    if (result !== undefined) {
      const count = occurrences(result, oldText)
      if (count === 0 || count === occurrences(source, oldText)) {
        return { ok: true, after: result }
      }
      return { ok: false, reason: "ambiguous" }
    }
  }

  return { ok: false, reason: "missing" }
}

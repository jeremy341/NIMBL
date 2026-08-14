import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export function resolveEditorCommand(configured?: string): string | undefined {
  if (configured?.trim()) return configured.trim()
  if (process.env.VISUAL?.trim()) return process.env.VISUAL.trim()
  if (process.env.EDITOR?.trim()) return process.env.EDITOR.trim()
  return undefined
}

export async function editTextWithEditor(
  value: string,
  options: { editor?: string; cwd?: string; label?: string } = {},
): Promise<{ value?: string; changed: boolean }> {
  const editor = resolveEditorCommand(options.editor)
  if (!editor) throw new Error("No editor configured. Set VISUAL, EDITOR, or settings.prompt.editor.")
  const folder = mkdtempSync(join(tmpdir(), "nimbl-edit-"))
  const file = join(folder, `${options.label || "draft"}.txt`)
  writeFileSync(file, value, "utf8")
  try {
    const parts = editor.split(/\s+/)
    const command = parts[0]!
    const args = [...parts.slice(1), file]
    const child = Bun.spawn([command, ...args], {
      cwd: options.cwd,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })
    const code = await child.exited
    if (code !== 0) throw new Error(`${editor} exited with code ${code}.`)
    const edited = readFileSync(file, "utf8")
    return { value: edited, changed: edited !== value }
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

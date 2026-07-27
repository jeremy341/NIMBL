// Postinstall patch for @opentui/solid — re-applies fixes lost on bun install.
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const file = resolve(import.meta.dirname, "..", "node_modules", "@opentui", "solid", "index.bun.js")
let source = readFileSync(file, "utf8")

const patches = [
  {
    // Backfill resolved renderable nodes after recursive insertExpression
    // so current = array never stores unresolved function objects.
    search: `current = insertExpression(parent, array, current, marker, true);\n      }\n      if (array.length === 0) {`,
    replace: `current = insertExpression(parent, array, current, marker, true);
        if (Array.isArray(current)) {
          array.length = 0;
          for (let _i = 0; _i < current.length; _i++)
            array.push(current[_i]);
        }
      }
      if (array.length === 0) {`,
  },
]

let changed = false
for (const { search, replace } of patches) {
  if (source.includes(search)) {
    source = source.replace(search, replace)
    changed = true
    console.log("[patch] Applied:", search.slice(0, 80) + "...")
  } else {
    console.log("[patch] Already applied (skipping):", search.slice(0, 80) + "...")
  }
}

if (changed) {
  writeFileSync(file, source, "utf8")
  console.log("[patch] Wrote updates to", file)
} else {
  console.log("[patch] No changes needed.")
}

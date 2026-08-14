import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

import { build } from "bun"

const result = await build({
  entrypoints: ["src/tui-opencode.tsx"],
  outdir: "dist",
  target: "bun",
  conditions: ["browser"],
  naming: "nimbl.js",
  plugins: [createSolidTransformPlugin()],
  external: [
    "@opentui/core-win32-x64",
    "@opentui/core-darwin-x64",
    "@opentui/core-darwin-arm64",
    "@opentui/core-linux-x64",
    "@opentui/core-linux-arm64",
    "@opentui/core-linux-x64-musl",
    "@opentui/core-linux-arm64-musl",
    "@opentui/core-win32-arm64",
  ],
})

console.log("Build result:", result.success ? "SUCCESS" : "FAILED")
console.log("Build output:", result.outputs.map(f => f.path))

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exitCode = 1
}

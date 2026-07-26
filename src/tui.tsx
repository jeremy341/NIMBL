// NIMBL TUI — Ink-based terminal UI
import React from "react"
import { render } from "ink"
import { resolveConfig } from "./config"
import { App } from "./tui/app"

const config = resolveConfig(process.argv)

// Clear the terminal for a clean start
process.stdout.write("\x1b[2J\x1b[H")

const { waitUntilExit } = render(React.createElement(App, { config }))

await waitUntilExit()

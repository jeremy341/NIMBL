import { format, add } from "../utils"
import { CONFIG_THEME, MAX_RETRIES } from "../config"
import { generateReport } from "./report"

export function feature(name: string) {
  const retries = MAX_RETRIES
  const theme = CONFIG_THEME
  return format(name) + " in " + theme + " with " + retries + " retries"
}

export function summarize(items: string[]) {
  return items.map((item) => add(1, item.length)).join(", ")
}

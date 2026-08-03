import { feature, summarize } from "./feature"

export function generateReport(names: string[]) {
  const body = names.map((name) => feature(name)).join("\n")
  return "Report:\n" + body + "\nCount: " + summarize(names).split(", ").length
}

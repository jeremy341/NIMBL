import type { StoredSession } from "./sessions"

export function findSession(sessions: StoredSession[], sessionID: string | undefined) {
  if (!sessionID) return undefined
  const exact = sessions.find((session) => session.id === sessionID)
  if (exact) return exact
  const matches = sessions.filter((session) => session.id.startsWith(sessionID))
  return matches.length === 1 ? matches[0] : undefined
}

export function latestSession(sessions: StoredSession[]) {
  return sessions.toSorted((left, right) =>
    (right.updated ?? right.created) - (left.updated ?? left.created),
  )[0]
}

export function sessionEpilogue(session: Pick<StoredSession, "id" | "title">) {
  const reset = "\x1b[0m"
  const bold = "\x1b[1m"
  const dim = "\x1b[90m"
  const green = "\x1b[38;2;74;222;128m"
  const label = (value: string) => `${dim}${value.padEnd(10, " ")}${reset}`
  const title = session.title.length > 50 ? session.title.slice(0, 47) + "..." : session.title
  return [
    `  ${green}${bold}NIMBL${reset}`,
    "",
    `  ${label("Session")}${bold}${title}${reset}`,
    `  ${label("Continue")}${bold}nimbl -s ${session.id}${reset}`,
    "",
  ].join("\n")
}

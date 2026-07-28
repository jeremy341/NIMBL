export const EXIT_CONFIRM_WINDOW_MS = 2_000

export interface ExitGuardState {
  armedAt?: number
  exit: boolean
}

export function registerExitPress(
  armedAt: number | undefined,
  now: number,
  windowMs = EXIT_CONFIRM_WINDOW_MS,
): ExitGuardState {
  if (armedAt !== undefined && now - armedAt >= 0 && now - armedAt <= windowMs) {
    return { armedAt: undefined, exit: true }
  }
  return { armedAt: now, exit: false }
}

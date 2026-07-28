export interface CtrlCState {
  selection: boolean
  dialog: boolean
  approval: boolean
  question: boolean
  running: boolean
  draft: boolean
}

export type CtrlCAction = "copy" | "close-dialog" | "reject-approval" | "cancel-question" | "abort-run" | "clear-draft" | "exit"

export function ctrlCAction(state: CtrlCState): CtrlCAction {
  if (state.selection) return "copy"
  if (state.dialog) return "close-dialog"
  if (state.approval) return "reject-approval"
  if (state.question) return "cancel-question"
  if (state.running) return "abort-run"
  if (state.draft) return "clear-draft"
  return "exit"
}

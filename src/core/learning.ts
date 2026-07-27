import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export interface LearningState {
  concepts: Record<string, { encounters: number; confidence: number; updated: number }>
}

function fileFor(root: string) { return join(root, ".nimbl", "learning.json") }

export function loadLearning(root: string): LearningState {
  try { return existsSync(fileFor(root)) ? JSON.parse(readFileSync(fileFor(root), "utf8")) as LearningState : { concepts: {} } }
  catch { return { concepts: {} } }
}

export function observeLearning(state: LearningState, prompt: string, successful = true): LearningState {
  const concepts = { ...state.concepts }
  for (const concept of new Set(prompt.toLowerCase().match(/\b(?:typescript|react|solid|testing|api|async|git|docker|database|security|performance|typescript|css)\b/g) || [])) {
    const prior = concepts[concept] || { encounters: 0, confidence: 0, updated: 0 }
    concepts[concept] = { encounters: prior.encounters + 1, confidence: Math.min(1, prior.confidence + (successful ? 0.08 : 0.02)), updated: Date.now() }
  }
  return { concepts }
}

export function saveLearning(root: string, state: LearningState) {
  const folder = join(root, ".nimbl")
  mkdirSync(folder, { recursive: true })
  writeFileSync(fileFor(root), JSON.stringify(state, null, 2) + "\n", "utf8")
}

export function teachingPrompt(state: LearningState) {
  const growing = Object.entries(state.concepts).filter(([, value]) => value.confidence < 0.6).map(([concept]) => concept).slice(0, 4)
  return growing.length ? `Teaching focus: briefly explain the relevant trade-off, especially around ${growing.join(", ")}. Do not quiz unless the user asks.` : "Teaching focus: explain important trade-offs concisely before suggesting an edit."
}

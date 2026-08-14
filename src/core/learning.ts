import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export interface LearningEvidence { id: string; kind: "encounter" | "hint" | "attempt" | "success" | "error" | "assessment" | "review"; score?: number; source?: string; time: number }
export interface LearningConcept { encounters: number; confidence: number; updated: number; evidence: LearningEvidence[]; prerequisites: string[]; misconception?: { severity: "low" | "medium" | "high"; status: "open" | "corrected"; recurrence: number; note?: string } }
export interface LearningSkill { id: string; label: string; prerequisites: string[]; mastery: number; dueAt?: number; evidenceIds: string[] }
export interface LearningGoal { id: string; label: string; concepts: string[]; target: number; created: number; completed?: number }
export interface LearningQuiz { id: string; concept: string; prompt: string; options?: string[]; answer?: string; attempts: number; score?: number; created: number }
export interface LearningPreferences { enabled: boolean; quizFrequency: "never" | "rare" | "normal" | "often"; retentionDays: number; storePrompts: false }
export interface LearningState {
  version?: 2
  concepts: Record<string, LearningConcept>
  skills?: Record<string, LearningSkill>
  goals?: Record<string, LearningGoal>
  quizzes?: LearningQuiz[]
  preferences?: LearningPreferences
}

const DEFAULT_PREFERENCES: LearningPreferences = { enabled: true, quizFrequency: "normal", retentionDays: 365, storePrompts: false }
function fileFor(root: string) { return join(root, ".nimbl", "learning.json") }
function now() { return Date.now() }
function concept(value: Partial<LearningConcept> = {}): LearningConcept { return { encounters: value.encounters || 0, confidence: value.confidence || 0, updated: value.updated || 0, evidence: value.evidence || [], prerequisites: value.prerequisites || [], misconception: value.misconception } }

export function normalizeLearning(value: unknown): LearningState {
  const raw = value && typeof value === "object" ? value as Partial<LearningState> : {}
  const concepts: Record<string, LearningConcept> = {}
  for (const [id, entry] of Object.entries(raw.concepts || {})) concepts[id] = concept(entry as Partial<LearningConcept>)
  return { version: 2, concepts, skills: raw.skills || {}, goals: raw.goals || {}, quizzes: raw.quizzes || [], preferences: { ...DEFAULT_PREFERENCES, ...(raw.preferences || {}) } }
}

export function loadLearning(root: string): LearningState {
  try { return existsSync(fileFor(root)) ? normalizeLearning(JSON.parse(readFileSync(fileFor(root), "utf8"))) : normalizeLearning({ concepts: {} }) }
  catch { return normalizeLearning({ concepts: {} }) }
}

const KNOWN = ["typescript", "react", "solid", "testing", "api", "async", "git", "docker", "database", "security", "performance", "css", "context", "retrieval", "tokens", "prompt-caching", "permissions", "compaction"]
function conceptsIn(text: string) { return new Set(text.toLowerCase().match(new RegExp(`\\b(?:${KNOWN.join("|")})\\b`, "g")) || []) }
function addEvidence(entry: LearningConcept, kind: LearningEvidence["kind"], score?: number, source?: string) { const item: LearningEvidence = { id: crypto.randomUUID(), kind, score, source, time: now() }; entry.evidence = [...entry.evidence, item].slice(-100); entry.updated = item.time; return item }

export function observeLearning(state: LearningState, prompt: string, successful = true): LearningState {
  const next = normalizeLearning(state)
  if (!next.preferences?.enabled) return next
  for (const name of conceptsIn(prompt)) {
    const entry = next.concepts[name] || concept()
    entry.encounters += 1
    entry.confidence = Math.min(1, entry.confidence + (successful ? 0.08 : 0.02))
    addEvidence(entry, successful ? "success" : "error", successful ? 1 : 0, "session")
    next.concepts[name] = entry
    next.skills![name] ||= { id: name, label: name, prerequisites: entry.prerequisites, mastery: entry.confidence, evidenceIds: entry.evidence.map((item) => item.id) }
    next.skills![name]!.mastery = entry.confidence
    next.skills![name]!.evidenceIds = entry.evidence.map((item) => item.id)
  }
  return next
}

export function recordLearningAttempt(state: LearningState, conceptID: string, input: { kind: LearningEvidence["kind"]; score?: number; source?: string; misconception?: string }) {
  const next = normalizeLearning(state); const entry = next.concepts[conceptID] || concept(); const evidence = addEvidence(entry, input.kind, input.score, input.source)
  if (input.kind === "attempt" || input.kind === "assessment" || input.kind === "review") {
    const score = input.score ?? 0
    entry.confidence = Math.max(0, Math.min(1, entry.confidence * 0.8 + score * 0.2))
    if (input.misconception) entry.misconception = { severity: score < 0.35 ? "high" : "medium", status: "open", recurrence: (entry.misconception?.recurrence || 0) + 1, note: input.misconception }
    else if (score >= 0.8 && entry.misconception) entry.misconception.status = "corrected"
  }
  next.concepts[conceptID] = entry
  next.skills![conceptID] = { id: conceptID, label: conceptID, prerequisites: entry.prerequisites, mastery: entry.confidence, evidenceIds: entry.evidence.map((item) => item.id), dueAt: scheduleReview(entry.confidence) }
  return { state: next, evidence }
}

export function scheduleReview(confidence: number, from = now()) { const intervalDays = confidence >= 0.85 ? 30 : confidence >= 0.6 ? 7 : confidence >= 0.3 ? 2 : 1; return from + intervalDays * 86_400_000 }
export function dueReviews(state: LearningState, at = now()) { return Object.values(state.skills || {}).filter((skill) => (skill.dueAt || 0) <= at) }

export function createGoal(state: LearningState, label: string, concepts: string[], target = 0.8) { const next = normalizeLearning(state); const goal: LearningGoal = { id: crypto.randomUUID(), label: label.trim().slice(0, 120), concepts: [...new Set(concepts)], target: Math.max(0, Math.min(1, target)), created: now() }; next.goals![goal.id] = goal; return { state: next, goal } }
export function createQuiz(state: LearningState, conceptID: string, prompt: string, options?: string[], answer?: string) { const next = normalizeLearning(state); const quiz: LearningQuiz = { id: crypto.randomUUID(), concept: conceptID, prompt: prompt.slice(0, 2_000), options, answer, attempts: 0, created: now() }; next.quizzes!.push(quiz); return { state: next, quiz } }
export function scoreQuiz(state: LearningState, quizID: string, score: number) { const next = normalizeLearning(state); const quiz = next.quizzes!.find((item) => item.id === quizID); if (!quiz) throw new Error("Quiz was not found."); quiz.attempts += 1; quiz.score = Math.max(0, Math.min(1, score)); return recordLearningAttempt(next, quiz.concept, { kind: "assessment", score: quiz.score, source: quiz.id }).state }
export function resetLearning(state: LearningState) { return normalizeLearning({ concepts: {} }) }
export function deleteLearningEvidence(state: LearningState, before?: number) { const next = normalizeLearning(state); for (const entry of Object.values(next.concepts)) entry.evidence = before === undefined ? [] : entry.evidence.filter((item) => item.time >= before); return next }
export function exportLearning(state: LearningState) { return JSON.stringify(normalizeLearning(state), null, 2) + "\n" }

export function saveLearning(root: string, state: LearningState) { const folder = join(root, ".nimbl"); mkdirSync(folder, { recursive: true }); writeFileSync(fileFor(root), exportLearning(state), "utf8") }
export function teachingPrompt(state: LearningState) { const normalized = normalizeLearning(state); const growing = Object.entries(normalized.concepts).filter(([, value]) => value.confidence < 0.6 && value.misconception?.status !== "corrected").map(([key]) => key).slice(0, 4); return growing.length ? `Teaching focus: briefly explain the relevant trade-off, especially around ${growing.join(", ")}. Do not quiz unless the user asks.` : "Teaching focus: explain important trade-offs concisely before suggesting an edit." }

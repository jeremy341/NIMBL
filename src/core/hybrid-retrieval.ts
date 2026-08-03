import type { StoredVectorIndex } from "./vector-index"
import { cosineSimilarity } from "./embeddings"

export interface LexicalCandidate {
  path: string
  score: number
  reason: string
  excerpt: string
}

export interface SemanticCandidate {
  path: string
  score: number
}

export interface GraphCandidate {
  path: string
  hop: number
  reason: string
  excerpt: string
}

export interface HybridCandidate {
  path: string
  score: number
  reasons: string[]
  excerpt: string
  sources: Array<"lexical" | "semantic" | "graph">
}

export interface HybridWeights {
  lexical: number
  semantic: number
  graph: number
}

export interface HybridSearchInput {
  lexical: LexicalCandidate[]
  semantic: SemanticCandidate[]
  graph: GraphCandidate[]
  vectorIndex?: StoredVectorIndex
}

export interface HybridOptions {
  weights?: Partial<HybridWeights>
  diversity?: number
  topK?: number
}

const DEFAULT_WEIGHTS: HybridWeights = { lexical: 0.5, semantic: 0.35, graph: 0.15 }
const DUPLICATE_COSINE = 0.92

function termSet(text: string) {
  return new Set((text.toLowerCase().match(/[a-z0-9_]{2,}/g) || []))
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0
  let intersection = 0
  for (const term of left) if (right.has(term)) intersection++
  return intersection / (left.size + right.size - intersection)
}

function candidatesByPath(input: HybridSearchInput, weights: HybridWeights) {
  const byPath = new Map<string, HybridCandidate>()
  const lexicalMax = input.lexical.reduce((maximum, candidate) => Math.max(maximum, candidate.score), 0) || 1
  for (const candidate of input.lexical) {
    const entry = byPath.get(candidate.path) ?? { path: candidate.path, score: 0, reasons: [], excerpt: "", sources: [] as HybridCandidate["sources"] }
    entry.score += (candidate.score / lexicalMax) * weights.lexical
    entry.reasons.push(candidate.reason)
    if (candidate.excerpt.length > entry.excerpt.length) entry.excerpt = candidate.excerpt
    if (!entry.sources.includes("lexical")) entry.sources.push("lexical")
    byPath.set(candidate.path, entry)
  }
  for (const candidate of input.semantic) {
    const entry = byPath.get(candidate.path) ?? { path: candidate.path, score: 0, reasons: [], excerpt: "", sources: [] as HybridCandidate["sources"] }
    entry.score += candidate.score * weights.semantic
    entry.reasons.push(`semantic similarity ${candidate.score.toFixed(2)}`)
    if (!entry.sources.includes("semantic")) entry.sources.push("semantic")
    byPath.set(candidate.path, entry)
  }
  for (const candidate of input.graph) {
    const entry = byPath.get(candidate.path) ?? { path: candidate.path, score: 0, reasons: [], excerpt: "", sources: [] as HybridCandidate["sources"] }
    entry.score += (1 / (candidate.hop + 1)) * weights.graph
    entry.reasons.push(candidate.reason)
    if (candidate.excerpt.length > entry.excerpt.length) entry.excerpt = candidate.excerpt
    if (!entry.sources.includes("graph")) entry.sources.push("graph")
    byPath.set(candidate.path, entry)
  }
  return [...byPath.values()]
}

function similarityBetween(left: HybridCandidate, right: HybridCandidate, vectorIndex?: StoredVectorIndex) {
  const leftUnit = vectorIndex?.units.find((unit) => unit.file === left.path)
  const rightUnit = vectorIndex?.units.find((unit) => unit.file === right.path)
  if (leftUnit?.vector.length && rightUnit?.vector.length) return cosineSimilarity(leftUnit.vector, rightUnit.vector)
  return jaccard(termSet(left.excerpt), termSet(right.excerpt))
}

export function hybridRerank(input: HybridSearchInput, options: HybridOptions = {}): HybridCandidate[] {
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights }
  const diversity = options.diversity ?? 0.25
  const topK = options.topK ?? 12
  const candidates = candidatesByPath(input, weights).sort((left, right) => right.score - left.score)
  const selected: HybridCandidate[] = []
  const pool = [...candidates]
  while (pool.length && selected.length < topK) {
    let bestIndex = 0
    let bestScore = -Infinity
    for (let index = 0; index < pool.length; index++) {
      const candidate = pool[index]!
      const diversityPenalty = selected.length
        ? selected.reduce((maximum, picked) => Math.max(maximum, similarityBetween(candidate, picked, input.vectorIndex)), 0)
        : 0
      const metric = diversity * candidate.score - (1 - diversity) * diversityPenalty
      if (metric > bestScore) {
        bestScore = metric
        bestIndex = index
      }
    }
    const picked = pool.splice(bestIndex, 1)[0]!
    if (selected.some((existing) => similarityBetween(existing, picked, input.vectorIndex) > DUPLICATE_COSINE)) continue
    selected.push(picked)
  }
  return selected
}

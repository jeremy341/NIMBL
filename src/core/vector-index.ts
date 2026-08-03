import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type { EmbeddingAdapter } from "./embeddings"
import { cosineSimilarity } from "./embeddings"
import { structuralChunks } from "./structural-context"

export const VECTOR_INDEX_VERSION = 1

export interface VectorUnit {
  id: string
  file: string
  text: string
  contentHash: string
}

export interface StoredVectorUnit extends VectorUnit {
  vector: number[]
}

export interface StoredVectorIndex {
  version: typeof VECTOR_INDEX_VERSION
  embedderKind: string
  model?: string
  contentHashAlgorithm: "sha1"
  units: StoredVectorUnit[]
}

export interface FileSourceLike {
  path: string
  source: string
}

export function contentHash(text: string) {
  return new Bun.CryptoHasher("sha1").update(text).digest("hex")
}

export function unitId(path: string, name: string | undefined, kind: string, startLine: number) {
  return `${path}#${name ?? kind}:${startLine}`
}

export function unitsFromSources(sources: FileSourceLike[]): VectorUnit[] {
  const units: VectorUnit[] = []
  for (const source of sources) {
    const chunks = structuralChunks(source.path, source.source) ?? []
    for (const chunk of chunks) {
      units.push({
        id: unitId(source.path, chunk.name, chunk.kind, chunk.startLine),
        file: source.path,
        text: chunk.text,
        contentHash: contentHash(chunk.text),
      })
    }
    if (!chunks.length) {
      units.push({
        id: unitId(source.path, undefined, "lexical", 1),
        file: source.path,
        text: source.source.slice(0, 4_000),
        contentHash: contentHash(source.source.slice(0, 4_000)),
      })
    }
  }
  return units
}

export async function buildVectorIndex(units: VectorUnit[], embedder: EmbeddingAdapter): Promise<StoredVectorIndex> {
  const vectors = await embedder.embed(units.map((unit) => unit.text))
  return {
    version: VECTOR_INDEX_VERSION,
    embedderKind: embedder.kind,
    model: embedder.model,
    contentHashAlgorithm: "sha1",
    units: units.map((unit, index) => ({ ...unit, vector: vectors[index] ?? [] })),
  }
}

export function searchVectorIndex(index: StoredVectorIndex, query: number[], topK = 12, minimumScore = 0.05) {
  return index.units
    .map((unit) => ({ unit, score: cosineSimilarity(query, unit.vector) }))
    .filter((candidate) => candidate.score >= minimumScore)
    .sort((left, right) => right.score - left.score || left.unit.file.localeCompare(right.unit.file))
    .slice(0, topK)
}

export function loadVectorIndex(file: string): StoredVectorIndex | undefined {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as StoredVectorIndex
    if (parsed.version !== VECTOR_INDEX_VERSION || !Array.isArray(parsed.units)) return undefined
    return parsed
  } catch {
    return undefined
  }
}

export function saveVectorIndex(file: string, index: StoredVectorIndex) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(index), "utf8")
}

export function isCurrentVectorIndex(index: StoredVectorIndex, units: VectorUnit[]) {
  const existing = new Map(index.units.map((unit) => [unit.id, unit.contentHash]))
  if (existing.size !== units.length) return false
  for (const unit of units) if (existing.get(unit.id) !== unit.contentHash) return false
  return true
}

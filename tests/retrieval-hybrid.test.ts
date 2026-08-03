import { describe, expect, it } from "vitest"
import { cosineSimilarity, createHostedEmbedder, createLocalEmbedder } from "@/core/embeddings"
import { buildVectorIndex, contentHash, isCurrentVectorIndex, saveVectorIndex, searchVectorIndex, unitsFromSources } from "@/core/vector-index"
import { hybridRerank, type GraphCandidate } from "@/core/hybrid-retrieval"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

describe("local embeddings", () => {
  it("embeds similar text closer than unrelated text", async () => {
    const embedder = createLocalEmbedder()
    const vectors = await embedder.embed(["load config from file", "parse configuration file", "render the galaxy"])
    const similar = cosineSimilarity(vectors[0]!, vectors[1]!)
    const unrelated = cosineSimilarity(vectors[0]!, vectors[2]!)
    expect(similar).toBeGreaterThan(unrelated)
    expect(embedder.kind).toBe("local")
  })

  it("produces deterministic unit vectors", async () => {
    const embedder = createLocalEmbedder()
    const first = (await embedder.embed(["deterministic text"]))[0]
    const second = (await embedder.embed(["deterministic text"]))[0]
    expect(first).toEqual(second)
  })
})

describe("hosted embeddings", () => {
  it("uses the OpenAI-compatible embeddings endpoint and fails loudly on errors", async () => {
    const calls: string[] = []
    const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
      calls.push(String(input))
      const body = JSON.parse(String(init?.body))
      expect(body.model).toBe("text-embedding-3-small")
      if (body.input.includes("boom")) return new Response("nope", { status: 500 })
      return new Response(JSON.stringify({ data: body.input.map((_text: string, index: number) => ({ embedding: [index + 1, 0] })) }), { status: 200, headers: { "Content-Type": "application/json" } })
    }
    const embedder = createHostedEmbedder({ baseURL: "https://example.test/v1", apiKey: "key", fetcher })
    const vectors = await embedder.embed(["one", "two"])
    expect(vectors).toEqual([[1, 0], [2, 0]])
    expect(calls[0]).toContain("/embeddings")
    await expect(embedder.embed(["boom"])).rejects.toThrow(/500/)
  })
})

describe("vector index", () => {
  it("chunks parser-derived units with content hashes and searches by cosine", async () => {
    const sources = [
      { path: "feature.ts", source: "export function feature() { return 'feature'.repeat(50) }" },
      { path: "other.ts", source: "export function unrelated() { return 'unrelated'.repeat(50) }" },
    ]
    const units = unitsFromSources(sources)
    expect(units.some((unit) => unit.file === "feature.ts")).toBe(true)
    expect(units.every((unit) => unit.contentHash.length === 40)).toBe(true)
    const index = await buildVectorIndex(units, createLocalEmbedder())
    const query = await createLocalEmbedder().embed(["feature function"])
    const results = searchVectorIndex(index, query[0]!, 2)
    expect(results[0]?.unit.file).toBe("feature.ts")
  })

  it("persists and reloads a versioned index", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-vector-"))
    const file = join(root, "index.json")
    const units = unitsFromSources([{ path: "a.ts", source: "export const a = 'a'.repeat(20)" }])
    const index = await buildVectorIndex(units, createLocalEmbedder())
    saveVectorIndex(file, index)
    const loaded = (await import("@/core/vector-index")).loadVectorIndex(file)
    expect(loaded?.version).toBe(1)
    expect(loaded?.units).toHaveLength(units.length)
    expect(isCurrentVectorIndex(loaded!, units)).toBe(true)
    const stale = unitsFromSources([{ path: "a.ts", source: "export const a = 'a'.repeat(99)" }])
    expect(isCurrentVectorIndex(loaded!, stale)).toBe(false)
  })

  it("ignores a corrupt index file", async () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-vector-corrupt-"))
    const file = join(root, "index.json")
    writeFileSync(file, "{ not json")
    const loaded = (await import("@/core/vector-index")).loadVectorIndex(file)
    expect(loaded).toBeUndefined()
  })

  it("content hashes are stable for identical text", () => {
    expect(contentHash("same text")).toBe(contentHash("same text"))
    expect(contentHash("same text")).not.toBe(contentHash("other text"))
  })
})

describe("hybrid retrieval", () => {
  const lexical = [
    { path: "a.ts", score: 42, reason: "lexical matches feature", excerpt: "export function feature() { return 1 }" },
    { path: "b.ts", score: 8, reason: "lexical matches feature", excerpt: "export const featureFlag = true" },
  ]
  const semantic = [
    { path: "c.ts", score: 0.9 },
    { path: "a.ts", score: 0.7 },
  ]
  const graph: GraphCandidate[] = [
    { path: "b.ts", hop: 1, reason: "graph: a.ts imports b.ts", excerpt: "export const featureFlag = true" },
  ]

  it("fuses lexical, semantic, and graph scores into ranked candidates", () => {
    const results = hybridRerank({ lexical, semantic, graph }, { topK: 10, diversity: 0.25 })
    expect(results.find((candidate) => candidate.path === "a.ts")?.sources).toEqual(expect.arrayContaining(["lexical", "semantic"]))
    expect(results.find((candidate) => candidate.path === "b.ts")?.sources).toEqual(expect.arrayContaining(["lexical", "graph"]))
    expect(results.find((candidate) => candidate.path === "c.ts")?.sources).toEqual(["semantic"])
  })

  it("suppresses near-duplicate excerpts via MMR diversity", () => {
    const nearDuplicates = [
      { path: "x.ts", score: 50, reason: "r", excerpt: "export function feature() { return 'aaaa'.repeat(50) }" },
      { path: "y.ts", score: 49, reason: "r", excerpt: "export function feature() { return 'aaaa'.repeat(50) }" },
    ]
    const results = hybridRerank({ lexical: nearDuplicates, semantic: [], graph: [] }, { topK: 10, diversity: 0.1 })
    expect(results.length).toBeLessThanOrEqual(1)
  })

  it("merges duplicate paths and applies the topK limit", () => {
    const results = hybridRerank({ lexical, semantic, graph }, { topK: 2, diversity: 0 })
    expect(results.length).toBeLessThanOrEqual(2)
    expect(new Set(results.map((candidate) => candidate.path)).size).toBe(results.length)
  })
})

export type EmbedderKind = "local" | "hosted"

export interface EmbeddingAdapter {
  kind: EmbedderKind
  model?: string
  embed(texts: string[]): Promise<number[][]>
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

function fnv1a(input: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function localTokens(text: string) {
  return (text.toLowerCase().match(/[a-z0-9_]{2,}/g) || []).slice(0, 4_000)
}

function ngrams(words: string[]) {
  const grams = new Set<string>()
  for (const word of words) grams.add(word)
  for (let index = 0; index + 1 < words.length; index++) grams.add(words[index]! + "\u0000" + words[index + 1])
  for (let index = 0; index + 2 < words.length; index++) grams.add(words[index]! + "\u0000" + words[index + 1] + "\u0000" + words[index + 2])
  return [...grams]
}

function normalize(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0))
  if (!magnitude) return vector
  return vector.map((value) => value / magnitude)
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (left.length !== right.length) return 0
  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  for (let index = 0; index < left.length; index++) {
    dot += left[index]! * right[index]!
    leftMagnitude += left[index]! * left[index]!
    rightMagnitude += right[index]! * right[index]!
  }
  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude)
  return denominator ? dot / denominator : 0
}

export function createLocalEmbedder(dimensions = 192): EmbeddingAdapter {
  return {
    kind: "local",
    model: "local-feature-hash",
    embed: async (texts) => texts.map((text) => {
      const vector = new Array<number>(dimensions).fill(0)
      for (const gram of ngrams(localTokens(text))) {
        const hash = fnv1a(gram)
        const index = hash % dimensions
        vector[index] = (vector[index] ?? 0) + ((hash & 0x8000) ? 1 : -1)
      }
      return normalize(vector)
    }),
  }
}

export function createHostedEmbedder(options: { baseURL: string; apiKey: string; model?: string; fetcher?: Fetcher; signal?: AbortSignal }): EmbeddingAdapter {
  const model = options.model ?? "text-embedding-3-small"
  return {
    kind: "hosted",
    model,
    embed: async (texts) => {
      const response = await (options.fetcher ?? fetch)(options.baseURL.replace(/\/$/, "") + "/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify({ model, input: texts }),
        signal: options.signal,
      })
      if (!response.ok) throw new Error(`Embedding endpoint HTTP ${response.status} ${response.statusText}`)
      const body = await response.json() as { data?: Array<{ embedding?: number[] }> }
      const vectors = body.data?.map((item) => item.embedding).filter((embedding): embedding is number[] => Boolean(embedding?.length))
      if (!vectors || vectors.length !== texts.length) throw new Error("Embedding endpoint returned an unexpected payload.")
      return vectors
    },
  }
}

export function createEmbedder(options: { mode?: "local" | "hosted" | "none"; baseURL?: string; apiKey?: string; model?: string; fetcher?: Fetcher; signal?: AbortSignal } = {}): EmbeddingAdapter | undefined {
  const mode = options.mode ?? (process.env.NIMBL_EMBEDDINGS_URL ? "hosted" : "local")
  if (mode === "none") return undefined
  if (mode === "hosted") {
    const baseURL = options.baseURL ?? process.env.NIMBL_EMBEDDINGS_URL
    const apiKey = options.apiKey ?? process.env.NIMBL_EMBEDDINGS_KEY
    if (!baseURL || !apiKey) throw new Error("Hosted embeddings require NIMBL_EMBEDDINGS_URL and NIMBL_EMBEDDINGS_KEY.")
    return createHostedEmbedder({ baseURL, apiKey, model: options.model ?? process.env.NIMBL_EMBEDDINGS_MODEL, fetcher: options.fetcher, signal: options.signal })
  }
  return createLocalEmbedder()
}

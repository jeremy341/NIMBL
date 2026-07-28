import type { ProviderModel } from "./providers"
import { countTextTokens, type TokenCount } from "./tokenizers"

export interface RequestBudgetInput {
  systemInstructions: string[]
  toolSchemas: string[]
  history: string[]
  summary: string[]
  attachments: string[]
  projectInstructions: string[]
  retrieval: string[]
  outputReservation: number
  safetyMarginTokens?: number
}

export interface RequestBudgetBreakdown {
  contextWindow: number
  systemInstructions: number
  toolSchemas: number
  history: number
  summary: number
  attachments: number
  projectInstructions: number
  retrieval: number
  protocolOverhead: number
  outputReservation: number
  safetyMargin: number
  inputTotal: number
  requestTotal: number
  remaining: number
  quality: TokenCount["quality"]
  tokenizer: ProviderModel["tokenizer"]
  fits: boolean
}

function count(parts: string[], model: ProviderModel) {
  return parts.reduce((total, part) => total + countTextTokens(part, model).tokens, 0)
}

export function budgetRequest(model: ProviderModel, input: RequestBudgetInput): RequestBudgetBreakdown {
  const systemInstructions = count(input.systemInstructions, model)
  const toolSchemas = count(input.toolSchemas, model)
  const history = count(input.history, model)
  const summary = count(input.summary, model)
  const attachments = count(input.attachments, model)
  const projectInstructions = count(input.projectInstructions, model)
  const retrieval = count(input.retrieval, model)
  const protocolOverhead = (input.history.length + input.toolSchemas.length + 2) * 4
  const outputReservation = Math.min(input.outputReservation, model.maxOutputTokens)
  const safetyMargin = input.safetyMarginTokens ?? Math.max(256, Math.ceil(model.contextWindow * 0.02))
  const inputTotal = systemInstructions + toolSchemas + history + summary + attachments + projectInstructions + retrieval + protocolOverhead
  const requestTotal = inputTotal + outputReservation + safetyMargin
  const tokenCount = countTextTokens("", model)
  return {
    contextWindow: model.contextWindow,
    systemInstructions,
    toolSchemas,
    history,
    summary,
    attachments,
    projectInstructions,
    retrieval,
    protocolOverhead,
    outputReservation,
    safetyMargin,
    inputTotal,
    requestTotal,
    remaining: model.contextWindow - requestTotal,
    quality: tokenCount.quality,
    tokenizer: model.tokenizer,
    fits: requestTotal <= model.contextWindow,
  }
}

export function fitRequestToBudget(model: ProviderModel, input: RequestBudgetInput, minimumHistory = 2) {
  const history = [...input.history]
  const retrieval = [...input.retrieval]
  let budget = budgetRequest(model, { ...input, history, retrieval })
  while (!budget.fits && retrieval.length) {
    retrieval.shift()
    budget = budgetRequest(model, { ...input, history, retrieval })
  }
  while (!budget.fits && history.length > minimumHistory) {
    history.shift()
    budget = budgetRequest(model, { ...input, history, retrieval })
  }
  return { history, retrieval, budget }
}

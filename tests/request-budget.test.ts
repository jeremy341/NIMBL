import { describe, expect, it } from "vitest"
import { getModel } from "@/core/providers"
import { budgetRequest, fitRequestToBudget } from "@/core/request-budget"

describe("request budgeting", () => {
  it("accounts for every request category and output reservation", () => {
    const model = { ...getModel("openai", "gpt-4.1"), contextWindow: 200, maxOutputTokens: 40 }
    const budget = budgetRequest(model, {
      systemInstructions: ["system"],
      toolSchemas: ["tool schema"],
      history: ["history"],
      summary: ["summary"],
      attachments: ["attachment"],
      projectInstructions: ["project"],
      retrieval: ["retrieval"],
      outputReservation: 40,
      safetyMarginTokens: 10,
    })
    expect(budget.inputTotal).toBe(budget.systemInstructions + budget.toolSchemas + budget.history + budget.summary + budget.attachments + budget.projectInstructions + budget.retrieval + budget.protocolOverhead)
    expect(budget.requestTotal).toBe(budget.inputTotal + 40 + 10)
    expect(budget.fits).toBe(true)
    expect(budget.quality).toBe("exact")
  })

  it("drops retrieval before old history to fit deterministically", () => {
    const model = { ...getModel("openai", "gpt-4.1"), contextWindow: 50, maxOutputTokens: 20 }
    const fitted = fitRequestToBudget(model, {
      systemInstructions: ["system"],
      toolSchemas: ["tool"],
      history: ["old history ".repeat(10), "recent history"],
      summary: [],
      attachments: [],
      projectInstructions: [],
      retrieval: ["low relevance ".repeat(20), "high relevance ".repeat(10)],
      outputReservation: 20,
      safetyMarginTokens: 5,
    }, 1)
    expect(fitted.retrieval).toEqual([])
    expect(fitted.history).toEqual(["recent history"])
    expect(fitted.budget.fits).toBe(true)
  })
})

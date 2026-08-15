import { describe, expect, it } from "vitest"
import { classifyTask, TASK_FAMILY_STEPS } from "@/core/task-classifier"

describe("classifyTask — tag path (benchmark ground truth)", () => {
  it("maps plain tags to their family", () => {
    expect(classifyTask("anything", ["bug-fix"]).family).toBe("single-fix")
    expect(classifyTask("anything", ["test-writing"]).family).toBe("test-writing")
    expect(classifyTask("anything", ["delegation"]).family).toBe("delegation")
    expect(classifyTask("anything", ["retrieval"]).family).toBe("retrieval")
    expect(classifyTask("anything", ["multi-file"]).family).toBe("multi-file")
    expect(classifyTask("anything", ["shell-loop"]).family).toBe("shell-loop")
    expect(classifyTask("anything", ["long-horizon"]).family).toBe("long-horizon")
  })

  it("resolves tag conflicts by precedence (long-horizon > shell-loop > multi-file)", () => {
    expect(classifyTask("anything", ["long-horizon", "multi-file"]).family).toBe("long-horizon")
    expect(classifyTask("anything", ["shell-loop", "bug-fix"]).family).toBe("shell-loop")
    expect(classifyTask("anything", ["multi-file", "bug-fix"]).family).toBe("multi-file")
    expect(classifyTask("anything", ["delegation", "bug-fix"]).family).toBe("delegation")
  })

  it("falls back to the prompt when tags are empty or unknown", () => {
    expect(classifyTask("fix all the bugs now", []).family).toBe("long-horizon")
    expect(classifyTask("hello", ["unknown-tag"]).family).toBe("single-fix")
  })
})

describe("classifyTask — prompt path (production)", () => {
  it("classifies the real long-horizon corpus prompts", () => {
    expect(classifyTask("The storefront has several subtle bugs (subtotal math, reservation oversell, quote pipeline, currency conversion). Work top-down: audit the domains, fix all of them so the hidden suites pass, and keep the unit suite green. Verify with: bun test ./tests-hidden and bun test ./tests/unit").family).toBe("long-horizon")
    expect(classifyTask("Rename the exported function prepareShipment in src/domains/shipping to createShipment and update every importer across the repository (search for import sites), keeping the behavior identical and the unit suite green.").family).toBe("long-horizon")
  })

  it("classifies shell-loop prompts without stealing test-writing or bug-fix tasks", () => {
    expect(classifyTask("Run the hidden golden suite: bun test ./tests-hidden. Read the failures to discover which source modules are wrong, fix them all, and get the whole hidden suite green. Do not modify or delete any file under tests-hidden.").family).toBe("shell-loop")
    expect(classifyTask("Run the full test suite (bun test). Drive the tests, read the failures, and fix every broken source file until the entire suite is green.").family).toBe("shell-loop")
  })

  it("classifies multi-file prompts", () => {
    expect(classifyTask("Pricing must produce correct quotes end to end: a quote of base=100 must total 97.2 with margin 42. This can require fixes across discount.ts, money.ts and service.ts. Fix the pipeline so quote works.").family).toBe("multi-file")
    expect(classifyTask("Orders must be able to dispatch a shipment. Add a function fulfill(orderId, zone) in src/domains/orders/fulfill.ts (new file) that calls prepareShipment from the shipping domain and returns the shipment. Export it from the orders module.").family).toBe("multi-file")
    expect(classifyTask("Charges accept an idempotency key but the key never reaches the persisted Payment record. Thread the idempotencyKey from charge() into the Payment object that doCharge saves.").family).toBe("multi-file")
  })

  it("classifies test-writing prompts even when they mention running the suite", () => {
    expect(classifyTask("There is no unit coverage for money rounding in tests/unit. Write tests/unit/money.test.ts asserting round(2.567, 2) === 2.57 and round(1.005, 2) === 1.01.").family).toBe("test-writing")
    expect(classifyTask("Add a test file tests/unit/carriers.test.ts that covers carrierForZone for every zone 1..5. Then run the suite - you will find carrierForZone has an off-by-one. Fix the source until your new test and the whole unit suite pass: bun test ./tests/unit").family).toBe("test-writing")
  })

  it("classifies delegation prompts", () => {
    expect(classifyTask("Use a subagent to research how awardPoints and isEligibleForTier interact in the customers domain, then implement the correct threshold behavior in the parent session.").family).toBe("delegation")
    expect(classifyTask("Payments must be idempotent. Delegate research to a subagent to map how idempotency.ts, service.ts and repo.ts relate in the billing domain.").family).toBe("delegation")
  })

  it("classifies retrieval prompts", () => {
    expect(classifyTask("Find the target gross margin ratio used by the pricing service and report the exact number. Answer with just the number.").family).toBe("retrieval")
    expect(classifyTask("Which domain owns idempotency for payments? Consult the architecture document and the code, then report the domain name.").family).toBe("retrieval")
  })

  it("keeps single bug-fix prompts on the single-fix family despite verify hints", () => {
    expect(classifyTask("applyDiscount in src/domains/pricing/discount.ts is too aggressive (divides by 1000 instead of 100). Fix the math so a 10% discount on 100 yields 90. Verify with: bun test ./tests-hidden/pricing-discount.test.ts").family).toBe("single-fix")
    expect(classifyTask("truncate in src/support/strings.ts keeps the tail instead of the head of a string. Fix it to keep the first max characters.").family).toBe("single-fix")
    expect(classifyTask("hello world").family).toBe("single-fix")
  })
})

describe("classifyTask — budgets, retrieval limits, guidance", () => {
  it("publishes the per-family step budget table", () => {
    expect(TASK_FAMILY_STEPS).toEqual({ retrieval: 8, "single-fix": 12, "test-writing": 16, delegation: 16, "multi-file": 40, "shell-loop": 50, "long-horizon": 100 })
    for (const tags of [["retrieval"], ["bug-fix"], ["test-writing"], ["delegation"], ["multi-file"], ["shell-loop"], ["long-horizon"]]) {
      const task = classifyTask("anything", tags)
      expect(task.maxToolSteps).toBe(TASK_FAMILY_STEPS[task.family])
    }
  })

  it("widens retrieval only for multi-file and long-horizon families", () => {
    expect(classifyTask("anything", ["multi-file"]).retrievalLimit).toBe(16)
    expect(classifyTask("anything", ["long-horizon"]).retrievalLimit).toBe(16)
    expect(classifyTask("anything", ["retrieval"]).retrievalLimit).toBe(12)
    expect(classifyTask("anything", ["shell-loop"]).retrievalLimit).toBe(12)
    expect(classifyTask("anything").retrievalLimit).toBe(12)
  })

  it("adds guidance only for corrective-behavior families", () => {
    const guided = new Set(["multi-file", "shell-loop", "long-horizon"])
    for (const family of Object.keys(TASK_FAMILY_STEPS)) {
      const task = classifyTask("anything", [family])
      expect(Boolean(task.guidance), family).toBe(guided.has(family))
    }
  })
})
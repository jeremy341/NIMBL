/**
 * Zero-LLM task classifier (Sprint C). Maps a user prompt (plus optional ground-truth
 * tags from a benchmark cohort) to a task family and its step budget, so the agent's
 * tool-step cap is a *per-class ceiling* rather than one flat number: easy/retrieval
 * tasks keep today's tiny budgets while long-horizon/shell-loop/multi-file tasks get
 * the turns they need (opencode needed 72-102 steps on `lh-fix-all`; NIMBL was cut
 * off at 8). Pure and deterministic: no extra LLM call, no network, no I/O.
 */

export type TaskFamily =
  | "retrieval"
  | "single-fix"
  | "test-writing"
  | "delegation"
  | "multi-file"
  | "shell-loop"
  | "long-horizon"

export interface TaskClassification {
  family: TaskFamily
  maxToolSteps: number
  /** Context item limit for selectProjectContextWithBudget (12 default, 16 for
   * multi-file/long-horizon families whose evidence spans many domains). */
  retrievalLimit: number
  /** Optional one-line instruction appended to the system prompt, only for the
   * families that need corrective behavior guidance. */
  guidance?: string
}

export const TASK_FAMILY_STEPS: Record<TaskFamily, number> = {
  retrieval: 8,
  "single-fix": 12,
  "test-writing": 16,
  delegation: 16,
  "multi-file": 40,
  "shell-loop": 50,
  "long-horizon": 100,
}

const RETRIEVAL_LIMIT_DEFAULT = 12
const RETRIEVAL_LIMIT_WIDE = 16

const GUIDANCE: Partial<Record<TaskFamily, string>> = {
  "long-horizon":
    "This is a long-horizon task spanning multiple bugs or files. Track the sub-bugs with todowrite, work top-down, delegate independent bugs to a subagent when they are separable, and verify each fix with the listed tests before finishing.",
  "shell-loop":
    "This task is driven by running tests: run the suite, read the failure output, fix the offending source, and re-run until green. Verify each edit with the relevant test before moving on.",
  "multi-file":
    "This task spans multiple files or domains. Map how the modules connect before editing, track the changes with todowrite, and verify with the listed tests without weakening existing unit tests.",
}

/** Prompt-signal precedence: strongest intent wins. Ordering matters — e.g.
 * `lh-fix-all` mentions a "quote pipeline" (a multi-file signal) but is long-horizon;
 * `tw-carriers` mentions "run the suite" (a shell-loop signal) but is test-writing. */
const SIGNALS: Array<{ family: TaskFamily; test: RegExp }> = [
  { family: "long-horizon", test: /fix all|several (subtle )?bugs|work top-down|audit the domains|update every importer|multiple independent bugs/ },
  { family: "multi-file", test: /\bacross\b|\bend to end\b|\bpipeline\b|thread .*\binto\b|\bnew file\b|\bexport it from\b/ },
  { family: "test-writing", test: /no unit coverage|add a test file|write tests|write a test file|new test file/ },
  { family: "shell-loop", test: /run the (full |hidden |golden |entire |whole )?.{0,24}(suite|tests)|drive the tests/ },
  { family: "delegation", test: /\bdelegate\b|\bsubagent\b/ },
  { family: "retrieval", test: /report the (exact )?number|answer with just the number|consult the architecture document|report the .* exactly/ },
]

const TAG_TO_FAMILY: Record<string, TaskFamily> = {
  retrieval: "retrieval",
  "bug-fix": "single-fix",
  "test-writing": "test-writing",
  delegation: "delegation",
  "multi-file": "multi-file",
  "shell-loop": "shell-loop",
  "long-horizon": "long-horizon",
}

const TAG_PRECEDENCE: TaskFamily[] = ["long-horizon", "shell-loop", "multi-file", "test-writing", "delegation", "retrieval", "single-fix"]

export function classifyTask(prompt: string, tags?: string[]): TaskClassification {
  let family: TaskFamily = "single-fix"
  if (tags?.length) {
    // Benchmark ground truth wins: the cohort already declares its category.
    const present = new Set(tags.map((tag) => TAG_TO_FAMILY[tag.toLowerCase()]).filter(Boolean))
    for (const candidate of TAG_PRECEDENCE) {
      if (present.has(candidate)) { family = candidate; break }
    }
  } else {
    const normalized = prompt.toLowerCase()
    for (const { family: candidate, test } of SIGNALS) {
      if (test.test(normalized)) { family = candidate; break }
    }
  }
  const wide = family === "multi-file" || family === "long-horizon"
  return {
    family,
    maxToolSteps: TASK_FAMILY_STEPS[family],
    retrievalLimit: wide ? RETRIEVAL_LIMIT_WIDE : RETRIEVAL_LIMIT_DEFAULT,
    guidance: GUIDANCE[family],
  }
}
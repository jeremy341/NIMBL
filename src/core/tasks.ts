import { randomUUID } from "node:crypto"

export type TaskKind = "agent" | "subagent" | "background"
export type TaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted"

/**
 * A task may opt out of the aggregate token guard with `Infinity`.
 * This is used for delegated child agents: the model/provider still enforces
 * its own context and output window, while NIMBL does not abort a useful child
 * just because it crossed an arbitrary application-level total.
 */
export interface TaskBudget { maxTokens: number; maxSteps: number; maxProcesses: number }
export interface TaskEvent { id: string; taskID: string; time: number; type: "status" | "text" | "tool" | "approval" | "result" | "error"; payload: unknown }
export interface TaskRecord<T = unknown> {
  id: string
  sessionID?: string
  parentTaskID?: string
  kind: TaskKind
  status: TaskStatus
  created: number
  started?: number
  ended?: number
  budget: TaskBudget
  usedTokens: number
  usedSteps: number
  result?: T
  error?: string
  events: TaskEvent[]
}

export class TaskRegistry {
  private readonly tasks = new Map<string, TaskRecord>()
  private readonly controllers = new Map<string, AbortController>()

  create(options: { sessionID?: string; parentTaskID?: string; kind?: TaskKind; budget?: Partial<TaskBudget> }) {
    const id = randomUUID()
    const kind = options.kind || "agent"
    const record: TaskRecord = { id, sessionID: options.sessionID, parentTaskID: options.parentTaskID, kind, status: "queued", created: Date.now(), budget: { maxTokens: options.budget?.maxTokens ?? (kind === "subagent" ? Number.POSITIVE_INFINITY : 64_000), maxSteps: options.budget?.maxSteps ?? 100, maxProcesses: options.budget?.maxProcesses ?? 4 }, usedTokens: 0, usedSteps: 0, events: [] }
    this.tasks.set(id, record)
    this.emit(id, "status", { status: "queued" })
    return record
  }

  start(id: string) { const task = this.require(id); if (task.status !== "queued") throw new Error("Only queued tasks can start."); task.status = "running"; task.started = Date.now(); this.controllers.set(id, new AbortController()); this.emit(id, "status", { status: task.status }); return { task, signal: this.controllers.get(id)!.signal } }
  cancel(id: string) { const task = this.require(id); if (["completed", "failed", "cancelled"].includes(task.status)) return task; task.status = "cancelled"; task.ended = Date.now(); this.controllers.get(id)?.abort(); this.emit(id, "status", { status: task.status }); return task }
  interrupt(id: string) { const task = this.require(id); task.status = "interrupted"; task.ended = Date.now(); this.controllers.get(id)?.abort(); this.emit(id, "status", { status: task.status }); return task }
  complete<T>(id: string, result: T) { const task = this.require(id) as TaskRecord<T>; task.status = "completed"; task.ended = Date.now(); task.result = result; this.emit(id, "result", result); this.emit(id, "status", { status: task.status }); this.controllers.delete(id); return task }
  fail(id: string, error: unknown) { const task = this.require(id); task.status = "failed"; task.ended = Date.now(); task.error = error instanceof Error ? error.message : String(error); this.emit(id, "error", task.error); this.emit(id, "status", { status: task.status }); this.controllers.delete(id); return task }
  addUsage(id: string, usage: { tokens?: number; steps?: number }) {
    const task = this.require(id)
    task.usedTokens += usage.tokens || 0
    task.usedSteps += usage.steps || 0
    const tokenLimitExceeded = Number.isFinite(task.budget.maxTokens) && task.usedTokens > task.budget.maxTokens
    const stepLimitExceeded = Number.isFinite(task.budget.maxSteps) && task.usedSteps > task.budget.maxSteps
    if (tokenLimitExceeded || stepLimitExceeded) {
      this.cancel(id)
      throw new Error("Task budget exceeded.")
    }
    return task
  }
  emit(id: string, type: TaskEvent["type"], payload: unknown) { const task = this.require(id); const event = { id: randomUUID(), taskID: id, time: Date.now(), type, payload }; task.events.push(event); if (task.events.length > 500) task.events.splice(0, task.events.length - 500); return event }
  get(id: string) { return this.tasks.get(id) }
  signal(id: string) { return this.controllers.get(id)?.signal }
  list(sessionID?: string) { return [...this.tasks.values()].filter((task) => !sessionID || task.sessionID === sessionID).sort((a, b) => b.created - a.created) }
  children(parentTaskID: string) { return [...this.tasks.values()].filter((task) => task.parentTaskID === parentTaskID) }
  clearFinished() { for (const [id, task] of this.tasks) if (["completed", "failed", "cancelled"].includes(task.status)) this.tasks.delete(id) }
  private require(id: string) { const task = this.tasks.get(id); if (!task) throw new Error(`Task "${id}" was not found.`); return task }
}

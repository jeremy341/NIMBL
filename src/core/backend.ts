import { existsSync } from "node:fs"
import { join } from "node:path"
import { compactSession, dequeuePrompt, forkSession, navigateDraft, popDraft, queuePrompt, recordSnapshot, recordSnapshotGroup, redoSnapshot, renameSession, revertToMessage, setDraft, setTodos, snapshotUnifiedDiff, stashDraft, undoSnapshot, type FileSnapshot } from "./session-actions"
import { createProjectContextIndex, type ContextRetrievalTelemetry, type ProjectContextIndex } from "./context"
import { createGoal, createQuiz, dueReviews, exportLearning, loadLearning, observeLearning, recordLearningAttempt, resetLearning, saveLearning, scoreQuiz, type LearningState } from "./learning"
import { loadSettings, saveSettings, type NimblSettings } from "./settings"
import {
  backupInvalidSessionStore,
  loadSessionStore,
  saveSessionStore,
  SessionStoreConflictError,
  type SessionStore,
  type StoredMessage,
  type StoredSession,
  sessionSummary,
  sessionUsage,
} from "./sessions"
import { findSession, latestSession } from "./session-lifecycle"
import { defaultModelFor, modelContextWindow, type ProviderDefinition } from "./providers"
import { runAgent, type AgentEvent, type AgentMessage, type AgentRunOptions, type AgentRunResult } from "./agent"
import { reduceAssistantEvents } from "./transcript"
import { effectiveAgent, effectivePermissions, type AgentConfigInput, type AgentDefinition } from "./agent-config"
import { exportSession, writeSessionExport, type ExportOptions } from "./export"
import { NotificationCenter } from "./notifications"
import { routeProviderWithRationale, type ProviderRoute, type RoutingSignals } from "./routing"
import { TaskRegistry, type TaskRecord } from "./tasks"
import { WorkspaceManager } from "./workspace"
import { GitCheckpointManager } from "./git-checkpoints"
import { AuthRegistry, type AuthSession } from "./auth"
import { credentialDiagnostics, discoverProviderModels, resolveCredential } from "./credentials"
import { loadProjectConfig, validateSettings, watchProjectConfig, type ConfigDiagnostic } from "./config-schema"
import { getProvider, PROVIDERS } from "./providers"
import { captureFilesystemSnapshot, restoreFilesystemSnapshot, type FilesystemSnapshot } from "./filesystem-snapshot"
import { createHostedShare, deleteHostedShare } from "./share"
import { syncRemoteSkills } from "./skills"

export interface BackendWorkspace {
  root: string
  stateDirectory: string
  sessionFile: string
  settingsFile: string
  hasInstructions: boolean
  hasGit: boolean
}

export interface BackendSnapshotChange {
  path: string
  before: string
  after: string
  beforeExists?: boolean
  afterExists?: boolean
  messageID?: string
}

export interface BackendLoad {
  store: SessionStore
  settings: NimblSettings
  learning: LearningState
  recoveryNotice?: string
  recoveryFingerprint?: string
}

export interface BackendContextDiagnostics {
  tokens: number
  contextWindow: number
  percent: number
  retrieval?: ContextRetrievalTelemetry
  categories?: { input: number; output: number; cacheRead: number; cacheWrite: number; reasoning: number; retrieval: number; history: number }
}

/**
 * NIMBL's application backend. The TUI is a client of this service: it owns
 * project state, session lifecycle, context indexing, learning persistence and
 * agent execution while deliberately excluding MCP, plugins and LSP.
 */
export class NimblBackend {
  readonly root: string
  readonly workspace: BackendWorkspace
  readonly contextIndex: ProjectContextIndex
  private revision = 0
  private recoveryFingerprint: string | undefined
  private blocked = false
  readonly tasks = new TaskRegistry()
  readonly notifications = new NotificationCenter()
  readonly workspaceManager: WorkspaceManager
  readonly checkpoints: GitCheckpointManager
  readonly auth = new AuthRegistry()
  settings: NimblSettings

  constructor(root: string, options: { watch?: boolean; hybrid?: boolean; graph?: boolean } = {}) {
    this.root = root
    this.workspace = {
      root,
      stateDirectory: join(root, ".nimbl"),
      sessionFile: join(root, ".nimbl", "sessions.json"),
      settingsFile: join(root, ".nimbl", "settings.json"),
      hasInstructions: existsSync(join(root, "AGENTS.md")) || existsSync(join(root, "NIMBL.md")),
      hasGit: existsSync(join(root, ".git")),
    }
    this.contextIndex = createProjectContextIndex(root, { watch: options.watch ?? true, hybrid: options.hybrid, graph: options.graph })
    this.workspaceManager = new WorkspaceManager(root)
    this.checkpoints = new GitCheckpointManager(root)
    this.settings = loadSettings(root)
    if (this.settings.skills?.urls?.length) void syncRemoteSkills(this.settings)
  }

  syncRemoteSkillRegistries() {
    if (this.settings.skills?.urls?.length) return syncRemoteSkills(this.settings)
    return Promise.resolve([])
  }

  close() {
    this.contextIndex.close()
  }

  adoptPersistedState(revision: number, recoveryFingerprint?: string) {
    this.revision = revision
    this.recoveryFingerprint = recoveryFingerprint
    this.blocked = false
  }

  load(): BackendLoad {
    const result = loadSessionStore(this.root)
    let store: SessionStore
    let recoveryNotice: string | undefined
    if (result.status === "valid") {
      store = result.store
    } else if (result.status === "invalid") {
      this.recoveryFingerprint = result.fingerprint
      const backup = backupInvalidSessionStore(result)
      recoveryNotice = `Invalid session data was preserved at ${backup}. A recovery session was created.`
      store = this.emptyStore()
    } else {
      store = this.emptyStore()
    }
    this.revision = store.revision
    return {
      store,
      settings: loadSettings(this.root),
      learning: loadLearning(this.root),
      recoveryNotice,
      recoveryFingerprint: this.recoveryFingerprint,
    }
  }

  emptyStore(provider = "freellmapi", model = defaultModelFor(provider)): SessionStore {
    const session: StoredSession = { id: crypto.randomUUID(), title: "New session", messages: [], agent: "build", created: Date.now() }
    return { version: 2, revision: 0, activeID: session.id, provider, model, sessions: [session] }
  }

  save(store: SessionStore): SessionStore {
    if (this.blocked) throw new Error("Session persistence is paused after a concurrent writer conflict.")
    try {
      const saved = saveSessionStore(this.root, { ...store, revision: this.revision }, {
        expectedRevision: this.revision,
        recoveryFingerprint: this.recoveryFingerprint,
      })
      this.revision = saved.revision
      this.recoveryFingerprint = undefined
      return saved
    } catch (error) {
      if (error instanceof SessionStoreConflictError) this.blocked = true
      throw error
    }
  }

  saveSettings(settings: NimblSettings) { saveSettings(this.root, settings); return settings }
  configDiagnostics(settings: NimblSettings): ConfigDiagnostic[] { return validateSettings(settings) }
  projectConfig() { return loadProjectConfig(this.root) }
  watchProjectConfig(onChange: (result: ReturnType<typeof loadProjectConfig>) => void) { return watchProjectConfig(this.root, onChange) }
  credentialDiagnostics() { return credentialDiagnostics(PROVIDERS) }
  credential(providerID: string, apiKey?: string) { const provider = getProvider(providerID); return resolveCredential(provider, { apiKey }) }
  async discoverModels(providerID: string, apiKey: string, signal?: AbortSignal) { return discoverProviderModels(getProvider(providerID), apiKey, signal) }
  loginProvider(session: Omit<AuthSession, "created" | "updated">) { return this.auth.login(session) }
  logoutProvider(providerID: string) { return this.auth.logout(providerID) }

  effectiveAgent(id: string, custom: Record<string, AgentConfigInput> = {}) { return effectiveAgent(id, Object.values(custom)) }
  effectiveAgentPermissions(agent: AgentDefinition, settings: NimblSettings) { return effectivePermissions(agent, settings.permissions) }

  route(prompt: string, settings: NimblSettings, signals: RoutingSignals = {}): ProviderRoute | undefined {
    return routeProviderWithRationale(prompt, settings, signals)
  }

  searchSessions(sessions: readonly StoredSession[], query: string): StoredSession[] {
    const needle = query.trim().toLowerCase()
    if (!needle) return [...sessions]
    const score = (session: StoredSession) => {
      const title = session.title.toLowerCase()
      const body = session.messages.slice(-8).map((message) => message.text).join(" ").toLowerCase()
      return (title === needle ? 100 : title.startsWith(needle) ? 50 : title.includes(needle) ? 25 : 0)
        + (body.includes(needle) ? 10 : 0)
    }
    return [...sessions].filter((session) => score(session) > 0).sort((left, right) => score(right) - score(left) || (right.updated || right.created) - (left.updated || left.created))
  }

  continue(store: SessionStore, sessionID?: string): StoredSession | undefined {
    return sessionID ? findSession(store.sessions, sessionID) : latestSession(store.sessions)
  }

  createSession(store: SessionStore, agent: StoredSession["agent"] = "build"): StoredSession {
    const session: StoredSession = { id: crypto.randomUUID(), title: "New session", messages: [], agent, created: Date.now() }
    store.sessions = [session, ...store.sessions]
    store.activeID = session.id
    return session
  }

  createChildSession(store: SessionStore, parentID: string, agent: StoredSession["agent"] = "build"): StoredSession {
    const parent = store.sessions.find((session) => session.id === parentID)
    if (!parent) throw new Error(`Parent session ${parentID} was not found.`)
    const child = forkSession({ ...parent, messages: [] }, crypto.randomUUID())
    child.title = `${parent.title} · child`
    child.agent = agent
    child.parentID = parentID
    store.sessions = [child, ...store.sessions]
    return child
  }

  async delegate(store: SessionStore, parentSessionID: string, options: AgentRunOptions & { maxDepth?: number }) {
    const parent = store.sessions.find((session) => session.id === parentSessionID); if (!parent) throw new Error(`Parent session ${parentSessionID} was not found.`)
    let depth = 0; let cursor: StoredSession | undefined = parent; while (cursor?.parentID) { depth += 1; cursor = store.sessions.find((session) => session.id === cursor!.parentID) }
    if (depth >= (options.maxDepth ?? 3)) throw new Error("Subagent delegation depth limit reached.")
    const child = this.createChildSession(store, parentSessionID, options.mode)
    // Persist the child's conversation so it can be reopened later.
    const userMessage: StoredMessage = { id: crypto.randomUUID(), role: "user", text: options.messages.at(-1)?.text || "", time: Date.now() }
    const assistantMessage: StoredMessage = { id: crypto.randomUUID(), role: "assistant", text: "", time: Date.now(), provider: options.provider, model: options.model, parts: [] }
    const indexed = store.sessions.findIndex((session) => session.id === child.id)
    store.sessions[indexed] = { ...store.sessions[indexed]!, messages: [userMessage, assistantMessage], runState: "running" as const, updated: Date.now() }
    const events: AgentEvent[] = []
    try {
      // Delegated agents are not capped by an aggregate NIMBL token budget. The
      // provider's context/output window and the step/depth guards remain active.
      const task = this.createTask({ sessionID: child.id, parentTaskID: options.runID, kind: "subagent", budget: { maxTokens: Number.POSITIVE_INFINITY, maxSteps: options.maxToolSteps } })
      const result = await this.runTask({ ...options, taskID: task.id, parentTaskID: options.runID, messages: options.messages, runID: task.id, maxTokens: undefined, onEvent: (event) => events.push(event) })
      store.sessions[indexed] = {
        ...store.sessions[indexed]!,
        runState: "idle" as const,
        updated: Date.now(),
        messages: store.sessions[indexed]!.messages.map((message) => message.id === assistantMessage.id
          ? reduceAssistantEvents({ ...message, text: message.text || result.text }, events, () => crypto.randomUUID())
          : message),
      }
      return { child, task: this.tasks.get(task.id), result }
    } catch (error) {
      store.sessions[indexed] = { ...store.sessions[indexed]!, runState: "failed" as const, updated: Date.now(), messages: store.sessions[indexed]!.messages.map((message) => message.id === assistantMessage.id ? { ...message, error: error instanceof Error ? error.message : String(error) } : message) }
      throw error
    }
  }

  children(store: SessionStore, parentID: string) {
    return store.sessions.filter((session) => session.parentID === parentID)
  }

  setDraft(store: SessionStore, sessionID: string, draft: string) { store.sessions = store.sessions.map((session) => session.id === sessionID ? setDraft(session, draft) : session); return store.sessions.find((session) => session.id === sessionID) }
  navigateDraft(store: SessionStore, sessionID: string, direction: "previous" | "next") { store.sessions = store.sessions.map((session) => session.id === sessionID ? navigateDraft(session, direction) : session); return store.sessions.find((session) => session.id === sessionID) }
  stashDraft(store: SessionStore, sessionID: string) { store.sessions = store.sessions.map((session) => session.id === sessionID ? stashDraft(session) : session); return store.sessions.find((session) => session.id === sessionID) }
  popDraft(store: SessionStore, sessionID: string) { store.sessions = store.sessions.map((session) => session.id === sessionID ? popDraft(session) : session); return store.sessions.find((session) => session.id === sessionID) }
  queuePrompt(store: SessionStore, sessionID: string, text: string, limit = 20) { store.sessions = store.sessions.map((session) => session.id === sessionID ? queuePrompt(session, text, limit) : session); return store.sessions.find((session) => session.id === sessionID) }
  dequeuePrompt(store: SessionStore, sessionID: string) { let prompt: string | undefined; store.sessions = store.sessions.map((session) => { if (session.id !== sessionID) return session; const result = dequeuePrompt(session); prompt = result.prompt; return result.session }); return { session: store.sessions.find((session) => session.id === sessionID), prompt } }
  setTodos(store: SessionStore, sessionID: string, todos: NonNullable<StoredSession["todos"]>) { store.sessions = store.sessions.map((session) => session.id === sessionID ? setTodos(session, todos) : session); return store.sessions.find((session) => session.id === sessionID) }

  rename(store: SessionStore, sessionID: string, title: string) {
    store.sessions = store.sessions.map((session) => session.id === sessionID ? renameSession(session, title) : session)
    return store.sessions.find((session) => session.id === sessionID)
  }

  fork(store: SessionStore, sessionID: string) {
    const source = store.sessions.find((session) => session.id === sessionID)
    if (!source) throw new Error(`Session ${sessionID} was not found.`)
    const child = forkSession(source, crypto.randomUUID())
    store.sessions = [child, ...store.sessions]
    return child
  }

  appendMessage(store: SessionStore, sessionID: string, message: StoredMessage) {
    store.sessions = store.sessions.map((session) => session.id === sessionID
      ? { ...session, messages: [...session.messages, message], updated: Date.now() }
      : session)
  }

  beginSessionRun(store: SessionStore, sessionID: string) { store.sessions = store.sessions.map((session) => session.id === sessionID ? { ...session, runState: "running", unread: false, updated: Date.now() } : session); return store.sessions.find((session) => session.id === sessionID) }
  finishSessionRun(store: SessionStore, sessionID: string, state: "idle" | "failed" | "interrupted" = "idle") { store.sessions = store.sessions.map((session) => session.id === sessionID ? { ...session, runState: state, updated: Date.now() } : session); return store.sessions.find((session) => session.id === sessionID) }
  recoverInterruptedRuns(store: SessionStore) { store.sessions = store.sessions.map((session) => session.runState === "running" || session.runState === "queued" ? { ...session, runState: "interrupted" as const, unread: true } : session); return store }
  generateSessionTitle(store: SessionStore, sessionID: string) { const session = store.sessions.find((item) => item.id === sessionID); if (!session) throw new Error(`Session "${sessionID}" was not found.`); const first = session.messages.find((message) => message.role === "user")?.text || "New session"; const title = first.replace(/^\s*\/\w+\s*/, "").replace(/\s+/g, " ").trim().slice(0, 64) || "New session"; return this.rename(store, sessionID, title) }
  generateSessionSummary(store: SessionStore, sessionID: string) { const session = store.sessions.find((item) => item.id === sessionID); if (!session) throw new Error(`Session "${sessionID}" was not found.`); const lines = session.messages.filter((message) => message.role === "user" || message.role === "assistant").slice(-8).map((message) => `${message.role}: ${message.text.replace(/\s+/g, " ").trim().slice(0, 240)}`); const summary = lines.join("\n").slice(0, 2_000); store.sessions = store.sessions.map((item) => item.id === sessionID ? { ...item, summary, updated: Date.now() } : item); return summary }
  sessionMetadata(store: SessionStore, sessionID: string) { const session = store.sessions.find((item) => item.id === sessionID); if (!session) throw new Error(`Session "${sessionID}" was not found.`); return { id: session.id, title: session.title, summary: sessionSummary(session), parentID: session.parentID, children: this.children(store, session.id).map((child) => child.id), runState: session.runState || "idle", unread: Boolean(session.unread), pinned: Boolean(session.pinned), tags: session.tags || [], usage: sessionUsage(session) } }

  recordSnapshot(store: SessionStore, sessionID: string, change: BackendSnapshotChange) {
    store.sessions = store.sessions.map((session) => session.id === sessionID ? recordSnapshot(session, { ...change, time: Date.now() }) : session)
  }

  recordSnapshotGroup(store: SessionStore, sessionID: string, changes: BackendSnapshotChange[]) {
    store.sessions = store.sessions.map((session) => session.id === sessionID ? recordSnapshotGroup(session, changes, Date.now()) : session)
  }

  undo(store: SessionStore, sessionID: string) {
    const current = store.sessions.find((session) => session.id === sessionID)
    if (!current) throw new Error(`Session ${sessionID} was not found.`)
    const result = undoSnapshot(this.root, current)
    store.sessions = store.sessions.map((session) => session.id === sessionID ? result.session : session)
    return result.snapshot
  }

  redo(store: SessionStore, sessionID: string) {
    const current = store.sessions.find((session) => session.id === sessionID)
    if (!current) throw new Error(`Session ${sessionID} was not found.`)
    const result = redoSnapshot(this.root, current)
    store.sessions = store.sessions.map((session) => session.id === sessionID ? result.session : session)
    return result.snapshot
  }

  revertMessage(store: SessionStore, sessionID: string, messageID: string) {
    const current = store.sessions.find((session) => session.id === sessionID)
    if (!current) throw new Error(`Session ${sessionID} was not found.`)
    const result = revertToMessage(this.root, current, messageID)
    store.sessions = store.sessions.map((session) => session.id === sessionID ? result.session : session)
    return result
  }

  snapshotDiff(snapshot: FileSnapshot) { return snapshotUnifiedDiff(snapshot) }

  compact(store: SessionStore, sessionID: string, learningState: LearningState) {
    store.sessions = store.sessions.map((session) => session.id === sessionID ? compactSession(session, { learningState: Object.entries(learningState.concepts).map(([key, value]) => `${key}: ${value.confidence.toFixed(2)}`) }) : session)
    return store.sessions.find((session) => session.id === sessionID)
  }

  contextDiagnostics(session: StoredSession, provider: ProviderDefinition, model: string): BackendContextDiagnostics {
    const usage = session.messages.findLast((message) => message.usage)?.usage
    const contextWindow = usage?.contextWindow || modelContextWindow(provider.id, model)
    const tokens = usage?.inputContextTokens || usage?.inputTokens || 0
    return { tokens, contextWindow, percent: contextWindow ? Math.round(tokens / contextWindow * 100) : 0, retrieval: usage?.retrieval, categories: { input: usage?.inputTokens || 0, output: usage?.outputTokens || 0, cacheRead: usage?.cacheReadTokens || 0, cacheWrite: usage?.cacheWriteTokens || 0, reasoning: usage?.reasoningTokens || 0, retrieval: usage?.budget?.retrieval || 0, history: usage?.budget?.history || 0 } }
  }

  saveLearning(state: LearningState) {
    saveLearning(this.root, state)
  }

  observeLearning(state: LearningState, prompt: string, successful = true) { const next = observeLearning(state, prompt, successful); this.saveLearning(next); return next }
  recordLearningAttempt(state: LearningState, conceptID: string, input: Parameters<typeof recordLearningAttempt>[2]) { const result = recordLearningAttempt(state, conceptID, input); this.saveLearning(result.state); return result }
  createLearningGoal(state: LearningState, label: string, concepts: string[], target?: number) { const result = createGoal(state, label, concepts, target); this.saveLearning(result.state); return result }
  createLearningQuiz(state: LearningState, conceptID: string, prompt: string, options?: string[], answer?: string) { const result = createQuiz(state, conceptID, prompt, options, answer); this.saveLearning(result.state); return result }
  scoreLearningQuiz(state: LearningState, quizID: string, score: number) { const next = scoreQuiz(state, quizID, score); this.saveLearning(next); return next }
  dueLearningReviews(state: LearningState, at?: number) { return dueReviews(state, at) }
  resetLearning(state: LearningState) { const next = resetLearning(state); this.saveLearning(next); return next }
  exportLearning(state: LearningState) { return exportLearning(state) }

  export(store: SessionStore, sessionID = store.activeID, options: ExportOptions = {}, destination?: string) { const content = exportSession(store, sessionID, options); return destination ? writeSessionExport(destination, content) : content }
  async share(store: SessionStore, serviceURL: string, sessionID = store.activeID) { const share = await createHostedShare(serviceURL, store, sessionID); store.sessions = store.sessions.map((session) => session.id === sessionID ? { ...session, share, updated: Date.now() } : session); return share }
  async unshare(store: SessionStore, serviceURL: string, sessionID = store.activeID) { const session = store.sessions.find((item) => item.id === sessionID); if (!session) throw new Error(`Session ${sessionID} was not found.`); if (!session.share) return false; await deleteHostedShare(serviceURL, session.share); store.sessions = store.sessions.map((item) => item.id === sessionID ? { ...item, share: undefined, updated: Date.now() } : item); return true }

  createTask(options: Parameters<TaskRegistry["create"]>[0] = {}) { return this.tasks.create(options) }
  cancelTask(taskID: string) { const task = this.tasks.cancel(taskID); this.notifications.notify("info", "Task cancelled", task.id); return task }
  listTasks(sessionID?: string) { return this.tasks.list(sessionID) }
  async runTask(options: AgentRunOptions & { taskID?: string; taskKind?: "agent" | "subagent" | "background"; budget?: { maxTokens?: number; maxSteps?: number; maxProcesses?: number } }): Promise<AgentRunResult> {
    const task = options.taskID ? this.tasks.get(options.taskID) || this.createTask({ kind: options.taskKind, budget: options.budget }) : this.createTask({ kind: options.taskKind, budget: options.budget })
    if (task.status === "queued") this.tasks.start(task.id)
    const active = this.tasks.get(task.id)!; const controllerSignal = this.tasks.signal(task.id)
    try {
      const taskMaxTokens = Number.isFinite(active.budget.maxTokens) ? active.budget.maxTokens : undefined
      const result = await this.run({ ...options, abortSignal: options.abortSignal || controllerSignal, maxTokens: options.maxTokens ?? taskMaxTokens, maxToolSteps: options.maxToolSteps ?? active.budget.maxSteps, runID: task.id, onTaskEvent: (event) => { this.tasks.emit(task.id, event.type === "doom-loop" ? "error" : "status", event); options.onTaskEvent?.(event) } })
      this.tasks.addUsage(task.id, { tokens: result.usage.totalTokens, steps: 1 }); this.tasks.complete(task.id, result); this.notifications.notify("completion", "Task completed"); return result
    } catch (error) { this.tasks.fail(task.id, error); this.notifications.notify("failure", "Task failed", error instanceof Error ? error.message : String(error)); throw error }
  }

  worktreeStatus() { return this.workspaceManager.status() }
  worktrees() { return this.workspaceManager.list() }
  createWorktree(options: Parameters<WorkspaceManager["create"]>[0]) { return this.workspaceManager.create(options) }
  removeWorktree(path: string, force = false) { return this.workspaceManager.remove(path, force) }
  pruneWorktrees() { return this.workspaceManager.prune() }
  createCheckpoint(label: string, sessionID?: string) { if (!this.workspace.hasGit) throw new Error("Git checkpoints require a Git workspace."); return this.checkpoints.create(label, sessionID) }
  listCheckpoints(sessionID?: string) { return this.checkpoints.list(sessionID) }
  restoreCheckpoint(id: string, force = false) { return this.checkpoints.restore(id, { force }) }
  removeCheckpoint(id: string) { return this.checkpoints.remove(id) }
  captureFilesystemSnapshot(paths: string[]) { return captureFilesystemSnapshot(this.root, paths) }
  restoreFilesystemSnapshot(snapshot: FilesystemSnapshot, removeUnlisted: string[] = []) { return restoreFilesystemSnapshot(this.root, snapshot, { removeUnlisted }) }

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    if (options.root !== this.root) throw new Error("Agent root must match the backend workspace.")
    return runAgent({ ...options, compression: options.compression || "structural", contextIndex: options.contextIndex || this.contextIndex, settings: options.settings || loadSettings(this.root) })
  }
}

export type { AgentMessage, AgentRunOptions, AgentRunResult, FileSnapshot }

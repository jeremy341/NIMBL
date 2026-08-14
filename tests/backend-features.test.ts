import { describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { effectiveAgent, validateAgentDefinition } from "@/core/agent-config"
import { exportSession, redactSecrets } from "@/core/export"
import { createGoal, createQuiz, normalizeLearning, recordLearningAttempt, scoreQuiz } from "@/core/learning"
import { NotificationCenter } from "@/core/notifications"
import { parseAttachmentReferences } from "@/core/prompt-context"
import { permissionDecision, removePermission, updatePermission } from "@/core/permissions"
import { rankProviders } from "@/core/routing"
import { setDraft, popDraft, queuePrompt, stashDraft, type SessionWithSnapshots } from "@/core/session-actions"
import { TaskRegistry } from "@/core/tasks"
import { compressSource } from "@/core/token-compression"
import { getModel } from "@/core/providers"
import { AuthRegistry, createOAuthChallenge, oauthCodeChallenge } from "@/core/auth"
import { loadProjectConfig, validateSettings } from "@/core/config-schema"
import { DEFAULT_SETTINGS } from "@/core/settings"
import { captureFilesystemSnapshot, restoreFilesystemSnapshot } from "@/core/filesystem-snapshot"
import { createHostedShare, deleteHostedShare } from "@/core/share"
import { WorkspaceManager } from "@/core/workspace"

describe("backend feature foundations", () => {
  it("validates configurable agents and keeps built-ins safe", () => {
    expect(effectiveAgent("plan").tools).not.toContain("bash")
    expect(validateAgentDefinition({ id: "review", mode: "explain", tools: ["read"], maxSteps: 4, maxTokens: 512 }).maxSteps).toBe(4)
    expect(() => validateAgentDefinition({ id: "bad agent", maxSteps: 1, maxTokens: 512 })).toThrow()
  })

  it("tracks bounded task lifecycle and cancellation", () => {
    const registry = new TaskRegistry(); const task = registry.create({ budget: { maxTokens: 10, maxSteps: 2 } }); registry.start(task.id); registry.addUsage(task.id, { tokens: 3, steps: 1 }); expect(registry.get(task.id)?.status).toBe("running"); registry.cancel(task.id); expect(registry.get(task.id)?.status).toBe("cancelled")
  })

  it("allows delegated tasks to exceed the application token budget", () => {
    const registry = new TaskRegistry(); const task = registry.create({ kind: "subagent", budget: { maxSteps: 2 } }); registry.start(task.id)
    registry.addUsage(task.id, { tokens: 10_000_000, steps: 1 })
    expect(registry.get(task.id)?.status).toBe("running")
    expect(registry.get(task.id)?.budget.maxTokens).toBe(Number.POSITIVE_INFINITY)
  })

  it("redacts secrets from export output", () => {
    expect(redactSecrets("Authorization: Bearer secret-value sk-abcdefghijklmnop")).toContain("[REDACTED]")
    const store = { version: 2 as const, revision: 0, activeID: "s", provider: "openai", model: "gpt-4.1", sessions: [{ id: "s", title: "Demo", agent: "build" as const, created: 1, messages: [{ id: "m", role: "user" as const, text: "api_key=secret", time: 1 }] }] }
    expect(exportSession(store)).toContain("[REDACTED]")
  })

  it("supports learning evidence, goals and scored quizzes", () => {
    const base = normalizeLearning({ concepts: {} }); const attempted = recordLearningAttempt(base, "typescript", { kind: "assessment", score: 0.2, misconception: "confuses types" }); expect(attempted.state.concepts.typescript?.misconception?.status).toBe("open"); const goal = createGoal(attempted.state, "Types", ["typescript"]); const quiz = createQuiz(goal.state, "typescript", "What is a type?"); const scored = scoreQuiz(quiz.state, quiz.quiz.id, 1); expect(scored.concepts.typescript?.confidence).toBeGreaterThan(0); expect(scored.goals?.[goal.goal.id]?.label).toBe("Types")
  })

  it("provides permission rationale and editable policy rules", () => {
    const settings = updatePermission({ "*": "ask" }, "write", "allow", "src/*"); expect(permissionDecision(settings, { tool: "write", target: "src/a.ts" }).value).toBe("allow"); expect(permissionDecision(settings, { tool: "write", target: "other/a.ts" }).requiresApproval).toBe(true); expect(removePermission(settings, "write", "src/*").write).toBeUndefined()
  })

  it("parses quoted attachments and line ranges", () => {
    expect(parseAttachmentReferences('Read @"src/my file.ts":4-8 and @README.md')).toEqual([{ path: "src/my file.ts", startLine: 4, endLine: 8 }, { path: "README.md", startLine: undefined, endLine: undefined }])
  })

  it("ranks providers with visible routing reasons", () => {
    const route = rankProviders("keep this private and offline", { providerRouting: { preferLocal: false, preferLowCost: false, preferFast: false }, providerDenylist: [] }, { privateData: true })[0]
    expect(route?.provider.local).toBe(true); expect(route?.rationale.length).toBeGreaterThan(0)
  })

  it("compresses source while preserving structural declarations", () => {
    const result = compressSource("import x from 'x';\n// comment\nexport function hello() {\n  return x;\n}", getModel("openai", "gpt-4.1"), "structural")
    expect(result.text).toContain("import"); expect(result.text).toContain("function"); expect(result.compressedTokens).toBeLessThanOrEqual(result.originalTokens)
  })

  it("supports draft stash and queued prompt workflow", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-workflow-")); writeFileSync(join(root, "x"), "")
    let session: SessionWithSnapshots = { id: "s", title: "S", agent: "build", created: 1, messages: [] }
    session = setDraft(session, "first"); session = stashDraft(session); session = setDraft(session, "second"); session = popDraft(session); expect(session.draft).toBe("first"); session = queuePrompt(session, "next"); expect(session.queuedPrompts).toHaveLength(1)
  })

  it("emits redacted notifications and tracks unread attention", () => {
    const center = new NotificationCenter(); const item = center.notify("failure", "failed", "api_key=secret"); expect(item.body).toContain("[REDACTED]"); expect(center.list(true)).toHaveLength(1); center.markRead(item.id); expect(center.list(true)).toHaveLength(0)
  })

  it("supports provider auth metadata without exposing tokens", () => {
    const challenge = createOAuthChallenge("http://127.0.0.1/callback"); expect(challenge.state).toBeTruthy(); expect(oauthCodeChallenge(challenge.verifier)).toHaveLength(43); const auth = new AuthRegistry(); auth.login({ provider: "openai", accessToken: "secret", account: "dev" }); expect(auth.get("openai")?.accessToken).toBe("secret"); expect(auth.exportMetadata()).not.toContain("secret"); auth.logout("openai"); expect(auth.get("openai")).toBeUndefined()
  })

  it("validates config conflicts and project config defaults", () => {
    const diagnostics = validateSettings({ ...DEFAULT_SETTINGS, keybinds: { one: "ctrl+x", two: "ctrl+x" } }); expect(diagnostics.some((item) => item.message.includes("also bound"))).toBe(true); const root = mkdtempSync(join(tmpdir(), "nimbl-config-")); expect(loadProjectConfig(root).settings.theme).toBe("nimbl")
  })

  it("captures and restores binary files with metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-fs-snapshot-")); writeFileSync(join(root, "data.bin"), Buffer.from([0, 1, 255])); const snapshot = captureFilesystemSnapshot(root, ["data.bin"]); writeFileSync(join(root, "data.bin"), Buffer.from([9])); restoreFilesystemSnapshot(root, snapshot); expect([...readFileSync(join(root, "data.bin"))]).toEqual([0, 1, 255]); expect(existsSync(join(root, ".nimbl"))).toBe(true)
  })

  it("creates and removes a redacted hosted share through a configured service", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      if (init?.method === "DELETE") return new Response(null, { status: 204 })
      return Response.json({ id: "share-1", url: "https://share.example/s/share-1", deleteToken: "delete-me" })
    }
    const store = { version: 2 as const, revision: 0, activeID: "s", provider: "openai", model: "gpt-4.1", sessions: [{ id: "s", title: "Demo", agent: "build" as const, created: 1, messages: [{ id: "m", role: "user" as const, text: "api_key=secret", time: 1 }] }] }
    const shared = await createHostedShare("https://share.example/api", store, "s", { fetcher })
    expect(String(requests[0]!.init?.body)).toContain("[REDACTED]")
    await deleteHostedShare("https://share.example/api", shared, { fetcher })
    expect(requests[1]?.init?.headers).toEqual({ Authorization: "Bearer delete-me" })
  })

  it("removes a clean registered worktree without requiring force", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-worktree-root-"))
    const target = root + "-child"
    const git = (args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" })
    git(["init"]); writeFileSync(join(root, "README.md"), "demo\n"); git(["add", "."]); git(["-c", "user.name=NIMBL Test", "-c", "user.email=nimbl@example.invalid", "commit", "-m", "init"])
    const manager = new WorkspaceManager(root)
    manager.create({ path: target, branch: "feature/test" })
    expect(existsSync(target)).toBe(true)
    manager.remove(target)
    expect(existsSync(target)).toBe(false)
  })
})

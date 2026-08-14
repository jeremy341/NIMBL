import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"

export interface WorktreeInfo { path: string; branch?: string; head?: string; bare: boolean }
export interface WorktreeOptions { path: string; branch?: string; startPoint?: string; allowDirty?: boolean }

function git(root: string, args: string[]) { try { return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() } catch (error) { const detail = error instanceof Error ? error.message : String(error); throw new Error(`Git operation failed: ${detail}`) } }
function assertRepo(root: string) { if (!existsSync(join(root, ".git"))) throw new Error("Workspace is not a Git repository.") }

export class WorkspaceManager {
  constructor(readonly root: string) {}
  status() { assertRepo(this.root); return { dirty: Boolean(git(this.root, ["status", "--porcelain"])), branch: git(this.root, ["branch", "--show-current"]), head: git(this.root, ["rev-parse", "HEAD"]) } }
  list() { assertRepo(this.root); return git(this.root, ["worktree", "list", "--porcelain"]).split(/\n\s*\n/).filter(Boolean).map((block) => { const path = block.match(/^worktree (.+)$/m)?.[1]; const head = block.match(/^HEAD (.+)$/m)?.[1]; const branch = block.match(/^branch refs\/heads\/(.+)$/m)?.[1]; return { path: path || "", head, branch, bare: block.includes("bare") } }).filter((item) => item.path) }
  create(options: WorktreeOptions) { assertRepo(this.root); const target = resolve(this.root, options.path); if (target === resolve(this.root) || target.startsWith(`${resolve(this.root)}${requireSeparator()}`)) throw new Error("Worktree path must be outside the main workspace."); if (existsSync(target)) throw new Error("Worktree destination already exists."); if (!options.allowDirty && this.status().dirty) throw new Error("Refusing to create a worktree from a dirty workspace without allowDirty."); mkdirSync(target, { recursive: true }); try { const args = ["worktree", "add"]; if (options.branch) args.push("-b", options.branch); args.push(target, options.startPoint || "HEAD"); git(this.root, args); return this.list().find((worktree) => resolve(worktree.path) === target) || { path: target, branch: options.branch, bare: false } } catch (error) { rmSync(target, { recursive: true, force: true }); throw error } }
  remove(path: string, force = false) { assertRepo(this.root); const target = resolve(path); if (target === resolve(this.root)) throw new Error("The main workspace cannot be removed."); if (!this.list().some((item) => resolve(item.path) === target)) throw new Error("Worktree is not registered in this repository."); if (!force && git(target, ["status", "--porcelain"])) throw new Error("Refusing to remove a worktree with uncommitted changes without force."); git(this.root, ["worktree", "remove", ...(force ? ["--force"] : []), target]); }
  prune() { assertRepo(this.root); git(this.root, ["worktree", "prune"]); }
}

function requireSeparator() { return process.platform === "win32" ? "\\" : "/" }

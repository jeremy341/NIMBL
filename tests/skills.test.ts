import { describe, expect, it } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { availableSkillGuidance, canonicalSkillFile, discoverSkills, globalSkillsDir, listSkillFiles, loadSkill, parseSkillFrontmatter } from "@/core/skills"

describe("skills", () => {
  it("parses name, description, and body from frontmatter", () => {
    const parsed = parseSkillFrontmatter("---\nname: review\ndescription: Review code changes\n---\n# Review\nBody")
    expect(parsed.name).toBe("review")
    expect(parsed.description).toBe("Review code changes")
    expect(parsed.body).toContain("# Review")
  })

  it("falls back to the full body when frontmatter is missing", () => {
    const parsed = parseSkillFrontmatter("plain skill text")
    expect(parsed.name).toBeUndefined()
    expect(parsed.description).toBeUndefined()
    expect(parsed.body).toBe("plain skill text")
  })

  it("discovers project and global skills with their descriptions", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-skills-discover-"))
    const projectDir = join(root, ".nimbl", "skills")
    const globalDir = join(globalSkillsDir(), "test-skill")
    mkdirSync(join(projectDir, "local"), { recursive: true })
    mkdirSync(join(projectDir, "local", "scripts"), { recursive: true })
    mkdirSync(globalDir, { recursive: true })
    writeFileSync(join(projectDir, "local", "SKILL.md"), "---\ndescription: A project skill\n---\nlocal body")
    writeFileSync(join(projectDir, "local", "scripts", "run.sh"), "echo hi")
    writeFileSync(join(globalDir, "SKILL.md"), "---\ndescription: A global skill\n---\nglobal body")

    const skills = discoverSkills(root)
    const local = skills.find((skill) => skill.name === "local")
    const global = skills.find((skill) => skill.name === "test-skill")
    expect(local).toBeDefined()
    expect(local!.description).toBe("A project skill")
    expect(local!.source).toBe("project")
    expect(global).toBeDefined()
    expect(global!.description).toBe("A global skill")
    expect(global!.source).toBe("global")
  })

  it("loads skill content, base directory, and related files", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-skills-load-"))
    const dir = join(root, ".nimbl", "skills", "guide")
    mkdirSync(join(dir, "reference"), { recursive: true })
    writeFileSync(join(dir, "SKILL.md"), "---\ndescription: Guide skill\n---\nGuide body")
    writeFileSync(join(dir, "reference", "api.md"), "API")

    const loaded = loadSkill(root, "guide")
    expect(loaded.name).toBe("guide")
    expect(loaded.content).toBe("Guide body")
    expect(loaded.directory).toBe(dir)
    expect(loaded.files).toContain("reference/api.md")
    expect(loaded.files).toContain("SKILL.md")
  })

  it("rejects invalid skill names", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-skills-invalid-"))
    expect(() => canonicalSkillFile(root, "../escape")).toThrow("letters, numbers")
    expect(() => canonicalSkillFile(root, "a/b")).toThrow("letters, numbers")
  })

  it("throws a canonical-path error when a skill name resolves through a symlink", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-skills-symlink-"))
    mkdirSync(join(root, ".git"))
    mkdirSync(join(root, ".nimbl", "skills"), { recursive: true })
    writeFileSync(join(root, ".git", "SKILL.md"), "escaped")
    symlinkSync(join(root, ".git"), join(root, ".nimbl", "skills", "evil"), "junction")
    expect(() => canonicalSkillFile(root, "evil")).toThrow("canonical project skill file")
  })

  it("lists files under a skill directory up to a limit", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-skills-files-"))
    mkdirSync(join(root, "a", "b"), { recursive: true })
    writeFileSync(join(root, "a", "one.md"), "1")
    writeFileSync(join(root, "a", "b", "two.md"), "2")
    const files = listSkillFiles(join(root, "a"))
    expect(files).toEqual(["b/two.md", "one.md"])
  })

  it("renders available-skill guidance with names and descriptions", () => {
    const guidance = availableSkillGuidance([{ name: "review", description: "Reviews changes", location: "", directory: "", source: "project" }])
    expect(guidance).toContain("<available_skills>")
    expect(guidance).toContain("<name>review</name>")
    expect(guidance).toContain("<description>Reviews changes</description>")
  })

  it("renders a no-skills message when none are available", () => {
    expect(availableSkillGuidance([])).toContain("No skills are currently available")
  })

  it("resolves global skills through the canonical path", () => {
    const root = mkdtempSync(join(tmpdir(), "nimbl-skills-global-"))
    const dir = join(globalSkillsDir(), "my-global-skill")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "SKILL.md"), "global")
    try {
      const resolved = canonicalSkillFile(root, "my-global-skill")
      expect(resolved.source).toBe("global")
      expect(resolved.file).toBe(join(dir, "SKILL.md"))
    } finally {
      // Best-effort cleanup; the OS config dir is user-owned.
      const testFile = join(dir, "SKILL.md")
      if (existsSync(testFile)) {
        try { require("node:fs").rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
      }
    }
  })
})

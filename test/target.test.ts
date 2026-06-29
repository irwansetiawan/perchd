import { describe, it, expect } from "vitest";
import { resolveDevTarget } from "../src/core/target.js";
import type { Worktree } from "../src/core/git.js";

const wt = (path: string, branch: string | null, head = "abc1234"): Worktree =>
  ({ path, branch, head, detached: false, locked: false, bare: false });

const main = wt("/repo", "master");
const auth = wt("/repo-wt/auth", "feature/auth");
const list = [main, auth];

describe("resolveDevTarget", () => {
  it("defaults to the worktree containing cwd", () => {
    expect(resolveDevTarget({ worktrees: list, repoRoot: "/repo", cwd: "/repo-wt/auth/src" }))
      .toBe(auth);
  });

  it("defaults to repoRoot when cwd is outside any worktree", () => {
    expect(resolveDevTarget({ worktrees: list, repoRoot: "/repo", cwd: "/somewhere/else" }))
      .toBe(main);
  });

  it("matches an explicit branch name", () => {
    expect(resolveDevTarget({ worktrees: list, repoRoot: "/repo", cwd: "/x", target: "feature/auth" }))
      .toBe(auth);
  });

  it("matches an explicit branch slug", () => {
    expect(resolveDevTarget({ worktrees: list, repoRoot: "/repo", cwd: "/x", target: "feature-auth" }))
      .toBe(auth);
  });

  it("matches an explicit path", () => {
    expect(resolveDevTarget({ worktrees: list, repoRoot: "/repo", cwd: "/x", target: "/repo-wt/auth" }))
      .toBe(auth);
  });

  it("maps literal 'main' to the primary checkout", () => {
    expect(resolveDevTarget({ worktrees: list, repoRoot: "/repo", cwd: "/x", target: "main" }))
      .toBe(main);
  });

  it("throws on an unknown explicit target", () => {
    expect(() => resolveDevTarget({ worktrees: list, repoRoot: "/repo", cwd: "/x", target: "nope" }))
      .toThrow('No worktree matches "nope"');
  });

  it("picks the longest matching worktree path for nested worktrees", () => {
    const nested = wt("/repo/packages/web", "web");
    const withNested = [main, nested];
    expect(resolveDevTarget({ worktrees: withNested, repoRoot: "/repo", cwd: "/repo/packages/web/app" }))
      .toBe(nested);
  });
});

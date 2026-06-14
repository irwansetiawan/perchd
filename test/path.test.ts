import { describe, it, expect } from "vitest";
import { resolveTargetPath } from "../src/commands/path.js";
import type { Worktree } from "../src/core/git.js";

const wts: Worktree[] = [
  { path: "/repo/main", branch: "main", head: "a1b2c3d", detached: false, locked: false, bare: false },
  { path: "/repo/.wt/auth", branch: "feature/auth", head: "d4e5f6a", detached: false, locked: false, bare: false },
];

describe("resolveTargetPath", () => {
  it("matches by branch name", () => {
    expect(resolveTargetPath(wts, "feature/auth", null)).toBe("/repo/.wt/auth");
  });
  it("matches by slug", () => {
    expect(resolveTargetPath(wts, "feature-auth", null)).toBe("/repo/.wt/auth");
  });
  it("matches by path", () => {
    expect(resolveTargetPath(wts, "/repo/main", null)).toBe("/repo/main");
  });
  it("falls back to the active path when no target given", () => {
    expect(resolveTargetPath(wts, undefined, "/repo/.wt/auth")).toBe("/repo/.wt/auth");
  });
  it("returns null when no target and nothing active", () => {
    expect(resolveTargetPath(wts, undefined, null)).toBeNull();
  });
  it("returns null when target matches nothing", () => {
    expect(resolveTargetPath(wts, "nope", null)).toBeNull();
  });
});

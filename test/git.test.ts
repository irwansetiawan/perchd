import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseWorktreeList, branchSlug } from "../src/core/git.js";

const porcelain = readFileSync(
  fileURLToPath(new URL("./fixtures/worktree-list.txt", import.meta.url)),
  "utf8",
);

describe("parseWorktreeList", () => {
  it("parses path, branch, head for each worktree", () => {
    const wts = parseWorktreeList(porcelain);
    expect(wts).toHaveLength(4);
    expect(wts[0]).toMatchObject({ path: "/repo/main", branch: "main", detached: false, locked: false });
    expect(wts[1]).toMatchObject({ path: "/repo/.worktrees/feature-auth", branch: "feature/auth" });
  });

  it("marks detached and locked worktrees", () => {
    const wts = parseWorktreeList(porcelain);
    expect(wts[2]).toMatchObject({ branch: null, detached: true });
    expect(wts[3]).toMatchObject({ locked: true });
  });
});

describe("branchSlug", () => {
  it("lowercases and replaces non-alphanumerics with dashes", () => {
    expect(branchSlug("feature/auth")).toBe("feature-auth");
    expect(branchSlug("Fix_Bug #2")).toBe("fix-bug-2");
  });
  it("falls back to short sha for detached", () => {
    expect(branchSlug(null, "9999aaa9999aaa")).toBe("9999aaa");
  });
});

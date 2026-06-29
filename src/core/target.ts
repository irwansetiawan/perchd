import { sep } from "node:path";
import { branchSlug, type Worktree } from "./git.js";

export interface ResolveDevTargetInput {
  worktrees: Worktree[];
  repoRoot: string;
  cwd: string;
  target?: string;
}

function containingWorktree(worktrees: Worktree[], cwd: string): Worktree | null {
  // longest path that is a prefix of cwd (handles nested worktrees)
  let best: Worktree | null = null;
  for (const w of worktrees) {
    if (w.bare) continue;
    if (cwd === w.path || cwd.startsWith(w.path + sep)) {
      if (!best || w.path.length > best.path.length) best = w;
    }
  }
  return best;
}

export function resolveDevTarget(input: ResolveDevTargetInput): Worktree {
  const { worktrees, repoRoot, cwd, target } = input;
  const primary = worktrees.find((w) => w.path === repoRoot) ?? worktrees.find((w) => !w.bare) ?? worktrees[0];

  if (!target) {
    return containingWorktree(worktrees, cwd) ?? primary;
  }

  const matched = worktrees.find(
    (w) => w.path === target || w.branch === target || branchSlug(w.branch, w.head) === target,
  );
  if (matched) return matched;

  if (target === "main") return primary;

  throw new Error(`No worktree matches "${target}"`);
}

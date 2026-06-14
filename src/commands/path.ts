import type { Worktree } from "../core/git.js";
import { branchSlug } from "../core/git.js";
import { loadContext } from "../core/context.js";
import { readState } from "../core/state.js";

export function resolveTargetPath(
  worktrees: Worktree[],
  target: string | undefined,
  activePath: string | null,
): string | null {
  if (!target) return activePath;
  const wt = worktrees.find(
    (w) => w.path === target || w.branch === target || branchSlug(w.branch, w.head) === target,
  );
  return wt ? wt.path : null;
}

export async function runPath(cwd: string, target: string | undefined): Promise<void> {
  const ctx = await loadContext(cwd);
  const active = readState(ctx.commonDir).active;
  const p = resolveTargetPath(ctx.worktrees, target, active?.worktreePath ?? null);
  if (!p) {
    throw new Error(target ? `No worktree matches "${target}"` : "no active server");
  }
  // Plain stdout (no color/prefix): consumed by the shell `cd` function.
  process.stdout.write(p + "\n");
}

import type { ActiveServer } from "./state.js";

export interface ReconcileInput {
  active: ActiveServer | null;
  worktreePaths: string[];
  stopActive: () => Promise<void>;
  clear: () => void;
}

/** Lazy auto-stop: if the active worktree was deleted, stop the server and clear state. */
export async function reconcile(input: ReconcileInput): Promise<boolean> {
  const { active, worktreePaths, stopActive, clear } = input;
  if (!active) return false;
  if (worktreePaths.includes(active.worktreePath)) return false;
  await stopActive();
  clear();
  return true;
}

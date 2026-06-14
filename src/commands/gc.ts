import pc from "picocolors";
import { loadContext } from "../core/context.js";
import { reconcile } from "../core/reconcile.js";
import { readState, clearActive, isPidAlive } from "../core/state.js";
import { stopGroup } from "../core/process.js";
import { needsReap } from "../core/reap.js";

export async function runGc(cwd: string): Promise<void> {
  const ctx = await loadContext(cwd);
  const { commonDir, config, worktrees } = ctx;
  const state = readState(commonDir);

  // (a) deleted active worktree → stop + clear
  const reconciled = await reconcile({
    active: state.active,
    worktreePaths: worktrees.map((w) => w.path),
    stopActive: async () => { if (state.active) await stopGroup(state.active.pgid, config.stop_timeout * 1000); },
    clear: () => clearActive(commonDir),
  });
  if (reconciled) { console.log(pc.green("✓ stopped server for a deleted worktree")); return; }

  // (b) stale pid → clear state
  const fresh = readState(commonDir);
  if (needsReap(fresh.active, fresh.active ? isPidAlive(fresh.active.pid) : false)) {
    clearActive(commonDir);
    console.log(pc.green("✓ cleared stale state (process had already exited)"));
    return;
  }
  console.log(pc.dim("nothing to clean up"));
}

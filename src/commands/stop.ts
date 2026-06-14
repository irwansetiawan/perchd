import pc from "picocolors";
import { loadContext } from "../core/context.js";
import { readState, clearActive } from "../core/state.js";
import { stopGroup } from "../core/process.js";

export async function runStop(cwd: string): Promise<void> {
  const ctx = await loadContext(cwd);
  const state = readState(ctx.commonDir);
  if (!state.active) {
    console.log(pc.dim("nothing active"));
    return;
  }
  await stopGroup(state.active.pgid, ctx.config.stop_timeout * 1000);
  clearActive(ctx.commonDir);
  console.log(pc.green(`✓ stopped ${state.active.branch ?? state.active.worktreePath}`));
}

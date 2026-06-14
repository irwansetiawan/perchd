import pc from "picocolors";
import { loadContext } from "../core/context.js";
import { readState } from "../core/state.js";
import { runSwitch } from "./switch.js";

export async function runRestart(cwd: string, nowIso: string): Promise<void> {
  const ctx = await loadContext(cwd);
  const active = readState(ctx.commonDir).active;
  if (!active) {
    console.log(pc.dim("nothing active to restart"));
    return;
  }
  // Switch to the active worktree by path; runSwitch stops it first, then restarts.
  // Pass the stored command/port so a server launched with `switch --cmd` (which
  // detection can't reproduce) still restarts correctly.
  await runSwitch({ target: active.worktreePath, cmd: active.command, port: active.port, nowIso, cwd });
}

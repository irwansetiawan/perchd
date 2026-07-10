import { existsSync } from "node:fs";
import pc from "picocolors";
import { loadContext } from "../core/context.js";
import { readState } from "../core/state.js";
import { attachViewport } from "../core/viewport.js";
import { runSwitch } from "./switch.js";

/**
 * Attach to the active server, or switch to `target` first and attach to that.
 * Returns a process exit code. Ctrl-C inside the viewport detaches; it never
 * stops the server.
 */
export async function runAttach(cwd: string, target?: string): Promise<number> {
  const ctx = await loadContext(cwd);

  // `attach` never stops on Ctrl-C: you're peeking at a server meant to persist.
  const stopTimeoutMs = ctx.config.stop_timeout * 1000;

  if (target) {
    const active = await runSwitch({ target, quiet: true, nowIso: new Date().toISOString(), cwd });
    if (!active) return 1;
    // Freshly started: replay the log from the top so the startup banner shows.
    return attachViewport(active, ctx.commonDir, { fromStart: true, stopOnInterrupt: false, stopTimeoutMs });
  }

  const active = readState(ctx.commonDir).active;
  if (!active) {
    console.log(pc.dim("nothing active"));
    return 0;
  }
  if (!active.logPath || !existsSync(active.logPath)) {
    console.log(pc.yellow("this server has no log file (started by an older perchd) — run `perchd restart` to attach"));
    return 1;
  }
  // Re-attaching to a server that has been up a while: show recent lines only.
  return attachViewport(active, ctx.commonDir, { fromStart: false, stopOnInterrupt: false, stopTimeoutMs });
}

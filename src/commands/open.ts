import pc from "picocolors";
import { loadContext } from "../core/context.js";
import { readState } from "../core/state.js";
import { openUrl } from "../core/system.js";

export async function runOpen(cwd: string): Promise<void> {
  const ctx = await loadContext(cwd);
  const active = readState(ctx.commonDir).active;
  if (!active) {
    console.log(pc.dim("nothing active"));
    return;
  }
  console.log(pc.green(`opening ${active.url}`));
  await openUrl(active.url);
}

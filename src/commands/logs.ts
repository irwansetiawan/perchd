import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import pc from "picocolors";
import { loadContext } from "../core/context.js";
import { readState } from "../core/state.js";

export async function runLogs(cwd: string, follow: boolean): Promise<void> {
  const ctx = await loadContext(cwd);
  const active = readState(ctx.commonDir).active;
  if (!active) {
    console.log(pc.dim("nothing active"));
    return;
  }
  if (active.foreground) {
    console.log(pc.dim("foreground server — logs stream to its terminal"));
    return;
  }
  if (!existsSync(active.logPath)) {
    console.log(pc.dim(`no log yet at ${active.logPath}`));
    return;
  }
  if (!follow) {
    process.stdout.write(readFileSync(active.logPath, "utf8"));
    return;
  }
  // Follow mode: hand stdio to `tail -f` and stay attached until the user quits.
  await new Promise<void>((resolve) => {
    const child = spawn("tail", ["-f", active.logPath], { stdio: ["ignore", "inherit", "inherit"] });
    child.on("exit", () => resolve());
    process.on("SIGINT", () => { child.kill("SIGTERM"); resolve(); });
  });
}

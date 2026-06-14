import { execa, execaSync } from "execa";

/** Browser-opener binary for a platform (process.platform value). */
export function openerCommand(platform: NodeJS.Platform): string {
  return platform === "darwin" ? "open" : "xdg-open";
}

/** Open a URL in the default browser. Best-effort; never throws. */
export async function openUrl(url: string, platform: NodeJS.Platform = process.platform): Promise<void> {
  try { await execa(openerCommand(platform), [url], { reject: false }); } catch { /* ignore */ }
}

/**
 * Kill whatever foreign process is bound to a TCP port (lsof + kill).
 * Returns the pids it tried to kill. macOS/Linux only. Never throws.
 */
export function killPort(port: number): number[] {
  try {
    const { stdout } = execaSync("lsof", ["-ti", `tcp:${port}`], { reject: false });
    const pids = stdout.split("\n").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
    for (const pid of pids) {
      try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
    }
    return pids;
  } catch {
    return [];
  }
}

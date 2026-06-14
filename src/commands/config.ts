import { loadContext } from "../core/context.js";
import { detectRunner } from "../detect/index.js";
import { resolveRunner } from "../core/resolve.js";
import { branchSlug } from "../core/git.js";

export interface ConfigRow {
  name: string;
  command: string | null;
  port: number | null;
  type: string | null;
}

export function formatConfigReport(
  timeouts: { ready_timeout: number; stop_timeout: number },
  rows: ConfigRow[],
): string {
  const lines: string[] = [];
  lines.push(`ready_timeout = ${timeouts.ready_timeout}`);
  lines.push(`stop_timeout = ${timeouts.stop_timeout}`);
  lines.push("");
  for (const r of rows) {
    if (r.command) {
      lines.push(`${r.name}: ${r.type} — ${r.command} (port ${r.port})`);
    } else {
      lines.push(`${r.name}: undetected`);
    }
  }
  return lines.join("\n");
}

export async function runConfig(cwd: string): Promise<void> {
  const ctx = await loadContext(cwd);
  const { config, worktrees } = ctx;
  const rows: ConfigRow[] = [];
  for (const wt of worktrees) {
    if (wt.bare) continue;
    const detected = detectRunner(wt.path);
    const runner = resolveRunner({ worktreeRoot: wt.path, branch: wt.branch, cfg: config, detected });
    rows.push({
      name: wt.branch ?? `(${branchSlug(null, wt.head)})`,
      command: runner?.command ?? null,
      port: runner?.port ?? null,
      type: runner?.type ?? null,
    });
  }
  console.log(formatConfigReport(
    { ready_timeout: config.ready_timeout, stop_timeout: config.stop_timeout },
    rows,
  ));
}

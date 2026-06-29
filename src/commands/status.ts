import pc from "picocolors";
import type { Worktree } from "../core/git.js";
import { branchSlug } from "../core/git.js";
import { loadContext } from "../core/context.js";
import { detectRunner } from "../detect/index.js";
import { resolveRunner } from "../core/resolve.js";
import { reconcile } from "../core/reconcile.js";
import { readState, clearActive, isPidAlive } from "../core/state.js";
import { stopGroup } from "../core/process.js";

export function formatStatusRow(
  wt: Worktree,
  runner: { type: string; port: number } | null,
  active: boolean,
  proc: { pid: number; uptime: string } | null,
  foreground = false,
): string {
  const marker = active ? pc.green("●") : " ";
  const name = wt.branch ?? `(${branchSlug(null, wt.head)})`;
  const type = runner ? runner.type : pc.dim("undetected");
  const port = runner ? String(runner.port) : "-";
  const fg = active && foreground ? " (fg)" : "";
  const procInfo = active && proc ? `pid ${proc.pid} up ${proc.uptime}${fg}` : "";
  return `${marker} ${name.padEnd(24)} ${type.padEnd(12)} ${port.padEnd(6)} ${procInfo}`;
}

function uptime(startedAt: string, nowMs: number): string {
  const secs = Math.max(0, Math.floor((nowMs - Date.parse(startedAt)) / 1000));
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h`;
}

export async function runStatus(cwd: string, nowMs: number): Promise<void> {
  const ctx = await loadContext(cwd);
  const { commonDir, config, worktrees } = ctx;
  const state = readState(commonDir);

  await reconcile({
    active: state.active,
    worktreePaths: worktrees.map((w) => w.path),
    stopActive: async () => { if (state.active) await stopGroup(state.active.pgid, config.stop_timeout * 1000); },
    clear: () => clearActive(commonDir),
  });
  const fresh = readState(commonDir);

  for (const wt of worktrees) {
    if (wt.bare) continue;
    const detected = detectRunner(wt.path);
    const runner = resolveRunner({ worktreeRoot: wt.path, branch: wt.branch, cfg: config, detected });
    const isActive = !!fresh.active && fresh.active.worktreePath === wt.path && isPidAlive(fresh.active.pid);
    const proc = isActive && fresh.active
      ? { pid: fresh.active.pid, uptime: uptime(fresh.active.startedAt, nowMs) }
      : null;
    console.log(formatStatusRow(
      wt,
      runner ? { type: runner.type, port: runner.port } : null,
      isActive,
      proc,
      isActive ? !!fresh.active?.foreground : false,
    ));
  }
}

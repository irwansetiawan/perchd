import pc from "picocolors";
import type { ChildProcess } from "node:child_process";
import { loadContext } from "../core/context.js";
import { detectRunner } from "../detect/index.js";
import { resolveRunner } from "../core/resolve.js";
import { resolveDevTarget } from "../core/target.js";
import { appendPassthrough } from "../core/passthrough.js";
import { reconcile } from "../core/reconcile.js";
import {
  readState, writeState, clearActive, type ActiveServer,
} from "../core/state.js";
import { startForeground, stopGroup, waitForPortFree } from "../core/process.js";
import { killPort } from "../core/system.js";

export interface DevOptions {
  target?: string;
  cmd?: string;
  port?: number;
  force?: boolean;
  args?: string[];     // verbatim passthrough appended after `--`
  nowIso: string;      // injected timestamp for testability
  cwd: string;
}

export interface DevSession {
  active: ActiveServer;
  child: ChildProcess;
  commonDir: string;
  stopTimeoutMs: number;
}

export async function startDev(opts: DevOptions): Promise<DevSession> {
  const ctx = await loadContext(opts.cwd);
  const { commonDir, repoRoot, config, worktrees } = ctx;
  const stopTimeoutMs = config.stop_timeout * 1000;
  const state = readState(commonDir);

  // Lazy reconcile against current worktrees (same as switch).
  await reconcile({
    active: state.active,
    worktreePaths: worktrees.map((w) => w.path),
    stopActive: async () => { if (state.active) await stopGroup(state.active.pgid, stopTimeoutMs); },
    clear: () => clearActive(commonDir),
  });

  const target = resolveDevTarget({ worktrees, repoRoot, cwd: opts.cwd, target: opts.target });
  if (target.locked) console.warn(pc.yellow(`warning: ${target.branch} is locked`));

  const detected = detectRunner(target.path);
  const runner = resolveRunner({
    worktreeRoot: target.path,
    branch: target.branch,
    cfg: config,
    detected,
    cli: { command: opts.cmd, port: opts.port },
  });
  if (!runner) {
    throw new Error(
      `${target.branch ?? target.path} is undetected. Add a [worktrees."${target.branch}"] block to .perchd.toml with command/port.`,
    );
  }

  // Stop the current active server (single-active handoff).
  const fresh = readState(commonDir);
  if (fresh.active) {
    await stopGroup(fresh.active.pgid, stopTimeoutMs);
    clearActive(commonDir);
  }

  // Wait for the port to free; --force kills a foreign holder.
  let freed = await waitForPortFree(runner.port, stopTimeoutMs);
  if (!freed && opts.force) {
    const killed = killPort(runner.port);
    if (killed.length) console.warn(pc.yellow(`--force: killed pid(s) ${killed.join(", ")} holding port ${runner.port}`));
    freed = await waitForPortFree(runner.port, stopTimeoutMs);
  }
  if (!freed) {
    console.warn(pc.yellow(`warning: port ${runner.port} is still in use${opts.force ? "" : " (use --force to kill the holder)"}; the server may fail to bind`));
  }

  const command = appendPassthrough(runner.command, opts.args ?? []);
  const { child, pgid } = startForeground(command, { cwd: runner.cwd, env: runner.env });

  const active: ActiveServer = {
    branch: target.branch,
    worktreePath: target.path,
    type: runner.type,
    command,
    cwd: runner.cwd,
    pid: child.pid as number,
    pgid,
    port: runner.port,
    url: runner.url,
    logPath: "",          // foreground: logs stream to the terminal, no file
    startedAt: opts.nowIso,
    foreground: true,
  };
  writeState(commonDir, active);
  console.log(pc.green(`▶ ${active.branch ?? active.worktreePath} → ${active.url} (foreground, Ctrl-C to stop)`));
  return { active, child, commonDir, stopTimeoutMs };
}

// Idempotent, identity-guarded: clear the active record only if it's still ours.
export function finishDev(session: DevSession): void {
  const cur = readState(session.commonDir).active;
  if (cur && cur.pid === session.active.pid) clearActive(session.commonDir);
}

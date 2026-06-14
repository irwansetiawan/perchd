import { mkdirSync, openSync, closeSync } from "node:fs";
import { dirname } from "node:path";
import pc from "picocolors";
import { loadContext } from "../core/context.js";
import { detectRunner } from "../detect/index.js";
import { resolveRunner } from "../core/resolve.js";
import { reconcile } from "../core/reconcile.js";
import { branchSlug } from "../core/git.js";
import {
  readState, writeState, clearActive, logPathFor, type ActiveServer,
} from "../core/state.js";
import {
  startServer, stopGroup, waitForPort, waitForPortFree,
} from "../core/process.js";

export interface SwitchOptions {
  target?: string;        // branch or path
  cmd?: string;
  port?: number;
  noWait?: boolean;
  nowIso: string;         // injected timestamp for testability
  cwd: string;
}

export async function runSwitch(opts: SwitchOptions): Promise<ActiveServer | null> {
  const ctx = await loadContext(opts.cwd);
  const { commonDir, config, worktrees } = ctx;
  const state = readState(commonDir);

  // Lazy reconcile against current worktrees.
  await reconcile({
    active: state.active,
    worktreePaths: worktrees.map((w) => w.path),
    stopActive: async () => {
      if (state.active) await stopGroup(state.active.pgid, config.stop_timeout * 1000);
    },
    clear: () => clearActive(commonDir),
  });
  const fresh = readState(commonDir);

  // Pick target worktree.
  const target = worktrees.find(
    (w) => w.path === opts.target || w.branch === opts.target || branchSlug(w.branch, w.head) === opts.target,
  );
  if (!target) throw new Error(`No worktree matches "${opts.target}"`);
  if (target.locked) console.warn(pc.yellow(`warning: ${target.branch} is locked`));

  // Resolve runner.
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

  // Stop current active.
  if (fresh.active) {
    await stopGroup(fresh.active.pgid, config.stop_timeout * 1000);
    clearActive(commonDir);
  }

  // Wait for the new port to be free (handles shared default port).
  const freed = await waitForPortFree(runner.port, config.stop_timeout * 1000);
  if (!freed) {
    console.warn(pc.yellow(`warning: port ${runner.port} is still in use by another process; the server may fail to bind`));
  }

  // Start detached.
  const slug = branchSlug(target.branch, target.head);
  const logPath = logPathFor(commonDir, slug);
  mkdirSync(dirname(logPath), { recursive: true });
  const logFd = openSync(logPath, "a");
  let started;
  try {
    started = startServer(runner.command, { cwd: runner.cwd, logFd, env: runner.env });
  } finally {
    closeSync(logFd);
  }

  const active: ActiveServer = {
    branch: target.branch,
    worktreePath: target.path,
    type: runner.type,
    command: runner.command,
    cwd: runner.cwd,
    pid: started.pid,
    pgid: started.pgid,
    port: runner.port,
    url: runner.url,
    logPath,
    startedAt: opts.nowIso,
  };
  writeState(commonDir, active);

  if (!opts.noWait) {
    const ready = await waitForPort(runner.port, config.ready_timeout * 1000);
    if (ready) console.log(pc.green(`✓ ${active.branch} → ${active.url}`));
    else console.warn(pc.yellow(`started but not ready in ${config.ready_timeout}s — see ${logPath}`));
  } else {
    console.log(pc.green(`✓ ${active.branch} starting → ${active.url}`));
  }
  return active;
}

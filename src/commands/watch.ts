import chokidar from "chokidar";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import pc from "picocolors";
import { loadContext } from "../core/context.js";
import { statePath, readState, clearActive } from "../core/state.js";
import { stopGroup } from "../core/process.js";

export interface Watcher {
  close(): Promise<void>;
}

export interface StartWatchOptions {
  debounceMs?: number;
  /** Called at the end of every completed sync cycle (test hook). */
  onSync?: () => void;
}

/**
 * Watch for the active server's worktree disappearing and auto-stop it.
 * Watches the state file (to follow the current active across switches) and the
 * active worktree's PARENT dir (to catch the worktree dir's own deletion).
 */
export async function startWatch(cwd: string, opts: StartWatchOptions = {}): Promise<Watcher> {
  const debounceMs = opts.debounceMs ?? 300;
  const ctx = await loadContext(cwd);
  const commonDir = ctx.commonDir;
  const stopTimeoutMs = ctx.config.stop_timeout * 1000;

  const watcher = chokidar.watch(statePath(commonDir), { ignoreInitial: true, depth: 0 });

  let watchedParent: string | null = null;
  let timer: NodeJS.Timeout | null = null;
  let closed = false;
  let running = false;
  let pending = false;

  const repoint = (parent: string | null) => {
    if (parent === watchedParent) return;
    if (watchedParent) watcher.unwatch(watchedParent);
    if (parent) watcher.add(parent);
    watchedParent = parent;
  };

  const sync = async () => {
    if (closed) return;
    if (running) { pending = true; return; }
    running = true;
    try {
      const active = readState(commonDir).active;
      if (active && !existsSync(active.worktreePath)) {
        await stopGroup(active.pgid, stopTimeoutMs);
        clearActive(commonDir);
        console.log(pc.green(`✓ ${active.branch ?? active.worktreePath} worktree gone — stopped its server`));
        repoint(null);
      } else if (active) {
        repoint(dirname(active.worktreePath));
      } else {
        repoint(null);
      }
    } finally {
      running = false;
      opts.onSync?.();
      if (pending) { pending = false; schedule(); }
    }
  };

  const schedule = () => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void sync(); }, debounceMs);
  };

  watcher.on("all", schedule);
  watcher.on("error", (e: unknown) => {
    console.error(pc.red(`watch error: ${e instanceof Error ? e.message : String(e)}`));
  });

  // Initial pass: pick up the current active and point the watcher (also handles
  // the case where the worktree was already deleted before `watch` started).
  await sync();

  return {
    async close() {
      closed = true;
      if (timer) clearTimeout(timer);
      await watcher.close();
    },
  };
}

/** Blocking CLI entry: watch until SIGINT (Ctrl-C). */
export async function runWatch(cwd: string): Promise<void> {
  console.log(pc.dim("watching for worktree changes (Ctrl-C to stop)"));
  const w = await startWatch(cwd);
  await new Promise<void>((resolve) => {
    process.once("SIGINT", () => resolve());
  });
  await w.close();
}

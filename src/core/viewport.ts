import { spawn, type ChildProcess } from "node:child_process";
import pc from "picocolors";
import { clearActive, isPidAlive, readState, type ActiveServer } from "./state.js";

export type ViewportExit =
  | { reason: "detached" }
  | { reason: "stopped" }
  | { reason: "perch-moved"; to: string | null }
  | { reason: "server-exited" };

export interface ViewportDeps {
  readActive: () => ActiveServer | null;
  isAlive: (pid: number) => boolean;
  startTail: (logPath: string, fromStart: boolean) => ChildProcess;
  fromStart?: boolean;
  pollMs?: number;
  /**
   * How long to keep watching after our server disappears before concluding it
   * is really gone. A switch tears the old server down *before* writing the new
   * record, so the state file transiently points at a dead pid and then at
   * nothing at all. Without this window every switch would look like a crash.
   */
  graceMs?: number;
  now?: () => number;
  /** Register a SIGINT handler; returns an unregister function. */
  onSigint?: (handler: () => void) => () => void;
}

/** `tail -f` the log. `-n +1` replays from the top; otherwise show the recent tail. */
export function defaultTail(logPath: string, fromStart: boolean): ChildProcess {
  const range = fromStart ? ["-n", "+1"] : ["-n", "50"];
  return spawn("tail", [...range, "-f", logPath], { stdio: ["ignore", "inherit", "inherit"] });
}

/**
 * Stream a server's log until the viewport ends. Ending the viewport never
 * signals the server — that is the whole point of the model.
 */
export async function runViewport(active: ActiveServer, deps: ViewportDeps): Promise<ViewportExit> {
  const pollMs = deps.pollMs ?? 400;
  const graceMs = deps.graceMs ?? 2500;
  const now = deps.now ?? Date.now;
  const tail = deps.startTail(active.logPath, deps.fromStart ?? true);

  let settled = false;
  let settle!: (e: ViewportExit) => void;
  const done = new Promise<ViewportExit>((resolve) => {
    settle = (e) => { if (!settled) { settled = true; resolve(e); } };
  });

  const onInt = () => settle({ reason: "detached" });
  const unregister = deps.onSigint
    ? deps.onSigint(onInt)
    : (process.on("SIGINT", onInt), () => { process.off("SIGINT", onInt); });

  // If the tail dies (log rotated, file removed), treat it as a detach.
  tail.once("exit", () => settle({ reason: "detached" }));

  // Timestamp of the first poll at which our server looked gone, or null.
  let goneSince: number | null = null;

  const timer = setInterval(() => {
    const cur = deps.readActive();

    // Someone else's pid owns the record: the perch moved. Unambiguous — settle now.
    if (cur && cur.pid !== active.pid) return settle({ reason: "perch-moved", to: cur.branch });

    const gone = !cur || !deps.isAlive(active.pid);
    if (!gone) { goneSince = null; return; }

    // Our server is gone. That is ambiguous: a switch kills the old server and
    // clears the record *before* starting the new one, so `stopped`/`server-exited`
    // and `perch-moved` look identical for a few hundred ms. Wait the window out —
    // a new pid appearing during it wins (handled above).
    if (goneSince === null) { goneSince = now(); return; }
    if (now() - goneSince < graceMs) return;

    settle(cur ? { reason: "server-exited" } : { reason: "stopped" });
  }, pollMs);

  const exit = await done;
  clearInterval(timer);
  unregister();
  if (!tail.killed) { try { tail.kill("SIGTERM"); } catch { /* already gone */ } }
  return exit;
}

const name = (a: ActiveServer) => a.branch ?? a.worktreePath;

/** Print the banner + discovery hint, run the viewport, report why it ended. */
export async function attachViewport(
  active: ActiveServer,
  commonDir: string,
  opts: { fromStart: boolean },
): Promise<number> {
  console.log(pc.green(`▶ ${name(active)} → ${active.url}`));
  console.log(pc.dim("  ^C detaches (the server keeps running) · `perchd <branch>` moves the perch · `-d` skips attaching"));

  const exit = await runViewport(active, {
    readActive: () => readState(commonDir).active,
    isAlive: isPidAlive,
    startTail: defaultTail,
    fromStart: opts.fromStart,
  });

  switch (exit.reason) {
    case "detached":
      console.log(pc.dim(`\n▸ detached — ${name(active)} still running at ${active.url}. \`perchd stop\` to terminate.`));
      return 0;
    case "perch-moved":
      console.log(pc.dim(`\n▸ perch moved to ${exit.to ?? "another worktree"}.`));
      return 0;
    case "stopped":
      console.log(pc.dim(`\n▸ ${name(active)} stopped.`));
      return 0;
    case "server-exited": {
      // The server died on its own; clear the record if it is still ours.
      const cur = readState(commonDir).active;
      if (cur && cur.pid === active.pid) clearActive(commonDir);
      console.log(pc.yellow(`\n▸ ${name(active)} exited.`));
      return 1;
    }
  }
}

import { spawn } from "node:child_process";
import { connect } from "node:net";

export interface StartResult { pid: number; pgid: number; }

export function startServer(
  command: string,
  opts: { cwd: string; logFd: number; env?: Record<string, string> },
): StartResult {
  // Native spawn (not execa): we want a detached child that inherits the log fd
  // directly so it keeps writing after the CLI exits.
  const child = spawn(command, {
    shell: true,
    cwd: opts.cwd,
    detached: true,
    stdio: ["ignore", opts.logFd, opts.logFd],
    env: { ...process.env, ...opts.env },
  });
  child.unref();
  if (child.pid === undefined) throw new Error(`failed to spawn: ${command}`);
  // detached:true makes the child its own process-group leader → pgid === pid
  return { pid: child.pid, pgid: child.pid };
}

function tcpOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect({ port, host });
    const done = (ok: boolean) => { sock.destroy(); resolve(ok); };
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
    sock.setTimeout(1000, () => done(false));
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True if something is listening on the TCP port (single probe). */
export async function tcpListening(port: number): Promise<boolean> {
  return tcpOpen(port);
}

export async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await tcpOpen(port)) return true;
    await sleep(200);
  }
  return false;
}

export async function waitForPortFree(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await tcpOpen(port))) return true;
    await sleep(200);
  }
  return false;
}

function groupAlive(pgid: number): boolean {
  try { process.kill(-pgid, 0); return true; } catch { return false; }
}

/** SIGTERM the whole group, poll up to timeout, then SIGKILL. */
export async function stopGroup(pgid: number, timeoutMs: number): Promise<void> {
  try { process.kill(-pgid, "SIGTERM"); } catch { return; }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!groupAlive(pgid)) return;
    await sleep(200);
  }
  try { process.kill(-pgid, "SIGKILL"); } catch { /* already gone */ }
}

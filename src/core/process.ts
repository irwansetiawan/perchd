import { execa } from "execa";
import { connect } from "node:net";

export interface StartResult { pid: number; pgid: number; }

export function startServer(
  command: string,
  opts: { cwd: string; logFd: number; env?: Record<string, string> },
): StartResult {
  const child = execa(command, {
    shell: true,
    cwd: opts.cwd,
    detached: true,
    stdio: ["ignore", opts.logFd, opts.logFd],
    env: { ...process.env, ...opts.env },
    reject: false,
  });
  child.unref();
  const pid = child.pid!;
  // detached:true makes the child its own process-group leader → pgid === pid
  return { pid, pgid: pid };
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

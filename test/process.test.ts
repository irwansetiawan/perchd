import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, openSync, closeSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer, stopGroup, waitForPort, waitForPortFree } from "../src/core/process.js";

const PORT = 39517;
const serverCmd = `node -e "require('http').createServer((_,r)=>r.end('ok')).listen(${PORT})"`;

describe("process control", () => {
  it("starts a server, becomes ready, stops it cleanly", async () => {
    const dir = mkdtempSync(join(tmpdir(), "perchd-proc-"));
    const logFd = openSync(join(dir, "out.log"), "a");
    try {
      const { pid, pgid } = startServer(serverCmd, { cwd: dir, logFd });
      expect(pid).toBeGreaterThan(0);
      expect(await waitForPort(PORT, 8000)).toBe(true);
      await stopGroup(pgid, 5000);
      expect(await waitForPortFree(PORT, 5000)).toBe(true);
    } finally {
      closeSync(logFd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("waitForPort times out on a closed port", async () => {
    expect(await waitForPort(39599, 500)).toBe(false);
  });
});

const GROUP_PORT = 39518;

describe("whole-group teardown", () => {
  it("tears down a server's fanned-out children, not just the group leader", async () => {
    const dir = mkdtempSync(join(tmpdir(), "perchd-group-"));
    const pidfile = join(dir, "child.pid");
    const fixture = fileURLToPath(new URL("./fixtures/multiproc-server/server.js", import.meta.url));
    const logFd = openSync(join(dir, "out.log"), "a");
    try {
      const { pid, pgid } = startServer(`node ${fixture}`, {
        cwd: dir,
        logFd,
        env: { PORT: String(GROUP_PORT), CHILD_PIDFILE: pidfile },
      });
      expect(pid).toBeGreaterThan(0);
      expect(pgid).toBe(pid); // detached ⇒ group leader
      expect(await waitForPort(GROUP_PORT, 8000)).toBe(true);
      expect(existsSync(pidfile)).toBe(true);
      const childPid = Number(readFileSync(pidfile, "utf8"));

      await stopGroup(pgid, 5000);
      expect(await waitForPortFree(GROUP_PORT, 5000)).toBe(true);
      // the fanned-out child is also dead (whole-group teardown)
      let childAlive = true;
      try { process.kill(childPid, 0); } catch { childAlive = false; }
      expect(childAlive).toBe(false);
    } finally {
      closeSync(logFd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

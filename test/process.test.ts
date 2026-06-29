import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, openSync, closeSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer, startForeground, stopGroup, waitForPort, waitForPortFree } from "../src/core/process.js";

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

const FG_PORT = 39518;

describe("startForeground", () => {
  it("starts a foreground server, becomes ready, and stopGroup tears down the whole group", async () => {
    const dir = mkdtempSync(join(tmpdir(), "perchd-fg-"));
    const pidfile = join(dir, "child.pid");
    const fixture = fileURLToPath(new URL("./fixtures/multiproc-server/server.js", import.meta.url));
    try {
      const { child, pgid } = startForeground(`node ${fixture}`, {
        cwd: dir,
        env: { PORT: String(FG_PORT), CHILD_PIDFILE: pidfile },
      });
      expect(child.pid).toBeGreaterThan(0);
      expect(pgid).toBe(child.pid); // detached ⇒ group leader
      expect(await waitForPort(FG_PORT, 8000)).toBe(true);
      expect(existsSync(pidfile)).toBe(true);
      const childPid = Number(readFileSync(pidfile, "utf8"));

      await stopGroup(pgid, 5000);
      expect(await waitForPortFree(FG_PORT, 5000)).toBe(true);
      // the fanned-out child is also dead (whole-group teardown)
      let childAlive = true;
      try { process.kill(childPid, 0); } catch { childAlive = false; }
      expect(childAlive).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("spawns a pid for a valid command", () => {
    // empty command still spawns a shell; assert the happy-path shape instead:
    const dir = mkdtempSync(join(tmpdir(), "perchd-fg2-"));
    try {
      const { child } = startForeground(`node -e "setTimeout(()=>{},200)"`, { cwd: dir });
      expect(child.pid).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

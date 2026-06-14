import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, openSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

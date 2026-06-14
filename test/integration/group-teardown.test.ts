import { describe, it, expect, afterAll } from "vitest";
import { execa } from "execa";
import { mkdtempSync, rmSync, cpSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runSwitch } from "../../src/commands/switch.js";
import { runStop } from "../../src/commands/stop.js";
import { readState } from "../../src/core/state.js";
import { gitCommonDir } from "../../src/core/git.js";
import { waitForPort, waitForPortFree } from "../../src/core/process.js";

const fixture = fileURLToPath(new URL("../fixtures/multiproc-server", import.meta.url));

async function realPath(cwd: string): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], { cwd });
  return stdout.trim();
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (e: any) { return e?.code === "EPERM"; }
}

describe("process-group teardown (multi-process server)", () => {
  const dirs: string[] = [];
  afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

  it("stop reaps the spawned child too (whole group dies), like vite→esbuild", async () => {
    const P = 39611;
    const root = mkdtempSync(join(tmpdir(), "perchd-grp-"));
    dirs.push(root);
    await execa("git", ["init", "-q", "-b", "main"], { cwd: root });
    await execa("git", ["config", "user.email", "t@t"], { cwd: root });
    await execa("git", ["config", "user.name", "t"], { cwd: root });
    cpSync(fixture, root, { recursive: true });
    await execa("git", ["add", "-A"], { cwd: root });
    await execa("git", ["commit", "-qm", "init"], { cwd: root });

    const mainPath = await realPath(root);
    const common = await gitCommonDir(mainPath);
    const childPidFile = join(root, "child.pid");

    await runSwitch({
      target: mainPath,
      cmd: `PORT=${P} CHILD_PIDFILE=${childPidFile} node server.js`,
      port: P,
      nowIso: "2026-06-14T00:00:00Z",
      cwd: mainPath,
    });
    expect(await waitForPort(P, 8000)).toBe(true);

    // The server recorded its spawned child's pid; it must be alive now...
    const childPid = Number(readFileSync(childPidFile, "utf8").trim());
    expect(childPid).toBeGreaterThan(0);
    expect(alive(childPid)).toBe(true);

    await runStop(mainPath);

    // ...and dead after stop — proving the whole process group was reaped.
    // Poll briefly: SIGTERM→exit can lag a moment.
    let stillAlive = alive(childPid);
    for (let i = 0; i < 25 && stillAlive; i++) {
      await new Promise((r) => setTimeout(r, 100));
      stillAlive = alive(childPid);
    }
    expect(stillAlive).toBe(false);
    expect(readState(common).active).toBeNull();
    expect(await waitForPortFree(P, 5000)).toBe(true);
  });
});

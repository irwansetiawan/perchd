import { describe, it, expect, afterAll } from "vitest";
import { execa } from "execa";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runSwitch } from "../../src/commands/switch.js";
import { runViewport } from "../../src/core/viewport.js";
import { readState, writeState, isPidAlive } from "../../src/core/state.js";
import { gitCommonDir } from "../../src/core/git.js";
import { stopGroup, waitForPort, waitForPortFree } from "../../src/core/process.js";

const fixture = fileURLToPath(new URL("../fixtures/mini-server", import.meta.url));

async function setupRepo(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "perchd-attach-it-"));
  await execa("git", ["init", "-q"], { cwd: root });
  await execa("git", ["config", "user.email", "t@t"], { cwd: root });
  await execa("git", ["config", "user.name", "t"], { cwd: root });
  cpSync(fixture, root, { recursive: true });
  await execa("git", ["add", "-A"], { cwd: root });
  await execa("git", ["commit", "-qm", "init"], { cwd: root });
  const { stdout } = await execa(
    "git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], { cwd: root },
  );
  return stdout.trim();
}

/** A quiet tail so test output stays readable. */
const quietTail = (logPath: string) =>
  spawn("tail", ["-f", logPath], { stdio: ["ignore", "ignore", "ignore"] });

describe("attach flow", () => {
  let wtPath: string;
  afterAll(async () => { if (wtPath) rmSync(wtPath, { recursive: true, force: true }); });

  it("detaching the viewport leaves the server running; stop then kills it", async () => {
    wtPath = await setupRepo();
    const active = await runSwitch({
      target: wtPath, cmd: "PORT=3021 node server.js", port: 3021,
      nowIso: "2026-07-09T00:00:00Z", cwd: wtPath,
    });
    expect(active).not.toBeNull();
    expect(await waitForPort(3021, 8000)).toBe(true);

    const common = await gitCommonDir(wtPath);
    // Every server is background now: it always has a real log file.
    expect(readState(common).active?.logPath).toBeTruthy();

    // Simulate Ctrl-C on the viewport.
    const exit = await runViewport(active!, {
      readActive: () => readState(common).active,
      isAlive: isPidAlive,
      startTail: quietTail,
      pollMs: 50,
      onSigint: (h) => { setTimeout(h, 100); return () => {}; },
    });
    expect(exit).toEqual({ reason: "detached" });

    // THE POINT OF THE WHOLE REDESIGN: the server survived the detach.
    expect(isPidAlive(active!.pid)).toBe(true);
    expect(await waitForPort(3021, 2000)).toBe(true);

    await stopGroup(active!.pgid, 5000);
    expect(await waitForPortFree(3021, 5000)).toBe(true);
  });

  // Regression: a REAL switch stops the old server and clears the record before
  // writing the new one. An earlier version of this test faked the transition
  // atomically, so it passed while the real flow printed "server exited".
  it("a real cross-terminal switch ends an attached viewport with perch-moved", async () => {
    const active = await runSwitch({
      target: wtPath, cmd: "PORT=3022 node server.js", port: 3022,
      nowIso: "2026-07-09T00:00:00Z", cwd: wtPath,
    });
    expect(active).not.toBeNull();
    expect(await waitForPort(3022, 8000)).toBe(true);
    const common = await gitCommonDir(wtPath);

    // Another terminal genuinely moves the perch, gap and all. Hold the promise:
    // the viewport returns as soon as the new record lands, while runSwitch is
    // still in its readiness wait. Racing it (assigning via .then) is flaky.
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const switching = (async () => {
      await sleep(100);
      return runSwitch({
        target: wtPath, cmd: "PORT=3024 node server.js", port: 3024,
        nowIso: "2026-07-09T00:00:01Z", cwd: wtPath,
      });
    })();

    const exit = await runViewport(active!, {
      readActive: () => readState(common).active,
      isAlive: isPidAlive,
      startTail: quietTail,
      pollMs: 50,
      onSigint: () => () => {},
    });
    expect(exit.reason).toBe("perch-moved");

    // Let the switch finish before touching its server, so cleanup can't race it.
    const moved = await switching;
    expect(moved).not.toBeNull();
    expect(moved!.port).toBe(3024);

    await stopGroup(moved!.pgid, 5000);
    writeState(common, null);
    expect(await waitForPortFree(3024, 5000)).toBe(true);
    expect(await waitForPortFree(3022, 5000)).toBe(true);
  });

  it("reports server-exited when the server dies on its own", async () => {
    const active = await runSwitch({
      target: wtPath, cmd: "PORT=3023 node server.js", port: 3023,
      nowIso: "2026-07-09T00:00:00Z", cwd: wtPath,
    });
    expect(await waitForPort(3023, 8000)).toBe(true);
    const common = await gitCommonDir(wtPath);

    setTimeout(() => { void stopGroup(active!.pgid, 5000); }, 100);

    const exit = await runViewport(active!, {
      readActive: () => readState(common).active,
      isAlive: isPidAlive,
      startTail: quietTail,
      pollMs: 50,
      onSigint: () => () => {},
    });
    expect(exit).toEqual({ reason: "server-exited" });

    writeState(common, null);
    expect(await waitForPortFree(3023, 5000)).toBe(true);
  });
});

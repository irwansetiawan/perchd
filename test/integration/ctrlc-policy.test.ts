import { describe, it, expect, afterAll } from "vitest";
import { execa } from "execa";
import { mkdtempSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runSwitch } from "../../src/commands/switch.js";
import { attachViewport, type ViewportExit } from "../../src/core/viewport.js";
import { readState, isPidAlive } from "../../src/core/state.js";
import { gitCommonDir } from "../../src/core/git.js";
import { stopGroup, waitForPort, waitForPortFree } from "../../src/core/process.js";

const fixture = fileURLToPath(new URL("../fixtures/mini-server", import.meta.url));

async function setupRepo(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "perchd-ctrlc-it-"));
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

// Inject a runViewport that immediately reports a user interrupt, so we exercise
// the real stop/detach teardown against a real server without racing signals.
const interruptWith = (signal: "SIGINT" | "SIGHUP") =>
  (async (): Promise<ViewportExit> => ({ reason: "interrupted", signal })) as any;

describe("Ctrl-C policy (hybrid)", () => {
  let wtPath: string;
  afterAll(async () => { if (wtPath) rmSync(wtPath, { recursive: true, force: true }); });

  it("a server you STARTED is stopped on Ctrl-C (drop-in behaviour)", async () => {
    wtPath = await setupRepo();
    const active = await runSwitch({
      target: wtPath, cmd: "PORT=3051 node server.js", port: 3051,
      nowIso: "2026-07-11T00:00:00Z", cwd: wtPath,
    });
    expect(await waitForPort(3051, 8000)).toBe(true);
    const common = await gitCommonDir(wtPath);

    const code = await attachViewport(
      active!, common,
      { fromStart: true, stopOnInterrupt: true, stopTimeoutMs: 5000 },
      interruptWith("SIGINT"),
    );

    expect(code).toBe(0);
    expect(isPidAlive(active!.pid)).toBe(false);          // server really died
    expect(await waitForPortFree(3051, 5000)).toBe(true);
    expect(readState(common).active).toBeNull();          // record cleared
  });

  it("window-close (SIGHUP) also stops a server you started", async () => {
    const active = await runSwitch({
      target: wtPath, cmd: "PORT=3052 node server.js", port: 3052,
      nowIso: "2026-07-11T00:00:00Z", cwd: wtPath,
    });
    expect(await waitForPort(3052, 8000)).toBe(true);
    const common = await gitCommonDir(wtPath);

    const code = await attachViewport(
      active!, common,
      { fromStart: true, stopOnInterrupt: true, stopTimeoutMs: 5000 },
      interruptWith("SIGHUP"),
    );

    expect(code).toBe(0);
    expect(await waitForPortFree(3052, 6000)).toBe(true);  // SIGTERM'd on hangup
    expect(readState(common).active).toBeNull();
  });

  it("a server you ATTACHED to survives Ctrl-C (detach only)", async () => {
    const active = await runSwitch({
      target: wtPath, cmd: "PORT=3053 node server.js", port: 3053,
      nowIso: "2026-07-11T00:00:00Z", cwd: wtPath,
    });
    expect(await waitForPort(3053, 8000)).toBe(true);
    const common = await gitCommonDir(wtPath);

    const code = await attachViewport(
      active!, common,
      { fromStart: false, stopOnInterrupt: false, stopTimeoutMs: 5000 },
      interruptWith("SIGINT"),
    );

    expect(code).toBe(0);
    expect(isPidAlive(active!.pid)).toBe(true);            // still alive
    expect(await waitForPort(3053, 2000)).toBe(true);      // still serving
    expect(readState(common).active?.pid).toBe(active!.pid); // record intact

    // cleanup
    await stopGroup(active!.pgid, 5000);
    expect(await waitForPortFree(3053, 5000)).toBe(true);
  });
});

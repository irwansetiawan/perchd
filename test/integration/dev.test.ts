import { describe, it, expect, afterAll } from "vitest";
import { execa } from "execa";
import { mkdtempSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startDev, finishDev } from "../../src/commands/dev.js";
import { readState, writeState } from "../../src/core/state.js";
import { gitCommonDir } from "../../src/core/git.js";
import { stopGroup, waitForPort, waitForPortFree } from "../../src/core/process.js";

const fixture = fileURLToPath(new URL("../fixtures/mini-server", import.meta.url));

async function setupRepo(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "perchd-dev-it-"));
  await execa("git", ["init", "-q"], { cwd: root });
  await execa("git", ["config", "user.email", "t@t"], { cwd: root });
  await execa("git", ["config", "user.name", "t"], { cwd: root });
  cpSync(fixture, root, { recursive: true });
  await execa("git", ["add", "-A"], { cwd: root });
  await execa("git", ["commit", "-qm", "init"], { cwd: root });
  const { stdout } = await execa("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], { cwd: root });
  return stdout.trim();
}

describe("perchd dev integration", () => {
  let wtPath: string;
  afterAll(async () => { if (wtPath) rmSync(wtPath, { recursive: true, force: true }); });

  it("starts foreground, records active(foreground), and finishDev clears it after teardown", async () => {
    wtPath = await setupRepo();
    const session = await startDev({
      target: wtPath, cmd: "PORT=3017 node server.js", port: 3017,
      nowIso: "2026-06-29T00:00:00Z", cwd: wtPath,
    });
    expect(session.active.port).toBe(3017);
    expect(session.active.foreground).toBe(true);
    expect(await waitForPort(3017, 8000)).toBe(true);

    const common = await gitCommonDir(wtPath);
    expect(readState(common).active?.port).toBe(3017);
    expect(readState(common).active?.foreground).toBe(true);

    // simulate external/Ctrl-C teardown: stop the group, then finalize.
    await stopGroup(session.active.pgid, 5000);
    finishDev(session);

    expect(readState(common).active).toBeNull();
    expect(await waitForPortFree(3017, 5000)).toBe(true);
  });

  it("finishDev is idempotent and does not clobber a newer active record", async () => {
    const session = await startDev({
      target: wtPath, cmd: "PORT=3018 node server.js", port: 3018,
      nowIso: "2026-06-29T00:00:00Z", cwd: wtPath,
    });
    const common = await gitCommonDir(wtPath);
    await stopGroup(session.active.pgid, 5000);
    finishDev(session);
    expect(readState(common).active).toBeNull();
    // calling again is a no-op (no throw, stays null)
    finishDev(session);
    expect(readState(common).active).toBeNull();

    // pid-mismatch guard: a *different* (newer) session now owns the record.
    const newer = { ...session.active, pid: session.active.pid + 99999, pgid: session.active.pgid + 99999 };
    writeState(common, newer);
    finishDev(session);                 // stale session must NOT clobber the newer record
    expect(readState(common).active?.pid).toBe(newer.pid);
    // cleanup the synthetic record so it doesn't leak into other state
    writeState(common, null);

    expect(await waitForPortFree(3018, 5000)).toBe(true);
  });
});

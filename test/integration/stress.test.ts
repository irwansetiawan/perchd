import { describe, it, expect, afterAll, vi } from "vitest";
import { execa } from "execa";
import { mkdtempSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runSwitch } from "../../src/commands/switch.js";
import { runStop } from "../../src/commands/stop.js";
import { readState } from "../../src/core/state.js";
import { gitCommonDir } from "../../src/core/git.js";
import { waitForPort, waitForPortFree } from "../../src/core/process.js";

const fixture = fileURLToPath(new URL("../fixtures/mini-server", import.meta.url));

async function realPath(cwd: string): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], { cwd });
  return stdout.trim();
}

function groupAlive(pgid: number): boolean {
  try { process.kill(-pgid, 0); return true; } catch { return false; }
}

describe("rapid-switch stress", () => {
  const dirs: string[] = [];
  afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

  it("10x A<->B on a shared port leaves no orphan process groups", async () => {
    const P = 39591;
    const root = mkdtempSync(join(tmpdir(), "perchd-stress-"));
    dirs.push(root);
    await execa("git", ["init", "-q", "-b", "main"], { cwd: root });
    await execa("git", ["config", "user.email", "t@t"], { cwd: root });
    await execa("git", ["config", "user.name", "t"], { cwd: root });
    cpSync(fixture, root, { recursive: true });
    await execa("git", ["add", "-A"], { cwd: root });
    await execa("git", ["commit", "-qm", "init"], { cwd: root });
    const wtB = `${root}-b`;
    dirs.push(wtB);
    await execa("git", ["worktree", "add", "-q", "-b", "feat", wtB], { cwd: root });

    const pathA = await realPath(root);
    const pathB = await realPath(wtB);
    const common = await gitCommonDir(pathA);
    const cmd = `PORT=${P} node server.js`;

    // Quiet the per-switch console output during the loop.
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const seenPgids: number[] = [];
    let last: string | undefined;
    for (let i = 0; i < 10; i++) {
      const target = i % 2 === 0 ? pathA : pathB;
      last = target;
      const active = await runSwitch({ target, cmd, port: P, nowIso: "2026-06-14T00:00:00Z", cwd: target });
      expect(active?.worktreePath).toBe(target);
      seenPgids.push(active!.pgid);
    }
    logSpy.mockRestore();
    warnSpy.mockRestore();

    // Final state points at the last target and that server answers.
    const finalState = readState(common);
    expect(finalState.active?.worktreePath).toBe(last);
    expect(await waitForPort(P, 8000)).toBe(true);

    // Every earlier server's process group is dead — no orphans.
    const finalPgid = finalState.active!.pgid;
    const orphans = seenPgids.filter((pg) => pg !== finalPgid && groupAlive(pg));
    expect(orphans).toEqual([]);

    // Teardown is clean.
    await runStop(pathA);
    expect(readState(common).active).toBeNull();
    expect(await waitForPortFree(P, 5000)).toBe(true);
  });
});

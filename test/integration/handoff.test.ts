import { describe, it, expect, afterAll } from "vitest";
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
const SHARED_PORT = 39531; // A and B both want this — the collision the design handles

function groupAlive(pgid: number): boolean {
  try { process.kill(-pgid, 0); return true; } catch { return false; }
}

async function realPath(cwd: string): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], { cwd });
  return stdout.trim();
}

describe("M1 acceptance: A→B switch on a shared port", () => {
  let rootA = "";
  let rootB = "";
  afterAll(async () => {
    for (const d of [rootA, rootB]) if (d) rmSync(d, { recursive: true, force: true });
  });

  it("stops A and frees the port before B comes up; no orphans", async () => {
    // Repo with the app committed at the root worktree...
    rootA = mkdtempSync(join(tmpdir(), "perchd-A-"));
    await execa("git", ["init", "-q", "-b", "main"], { cwd: rootA });
    await execa("git", ["config", "user.email", "t@t"], { cwd: rootA });
    await execa("git", ["config", "user.name", "t"], { cwd: rootA });
    cpSync(fixture, rootA, { recursive: true });
    await execa("git", ["add", "-A"], { cwd: rootA });
    await execa("git", ["commit", "-qm", "init"], { cwd: rootA });

    // ...plus a second worktree on its own branch (same committed app files).
    rootB = `${rootA}-b`;
    await execa("git", ["worktree", "add", "-q", "-b", "feature-b", rootB], { cwd: rootA });

    const pathA = await realPath(rootA);
    const pathB = await realPath(rootB);
    const common = await gitCommonDir(pathA);
    const cmd = `PORT=${SHARED_PORT} node server.js`;

    // Switch to A on the shared port.
    const a = await runSwitch({ target: pathA, cmd, port: SHARED_PORT, nowIso: "2026-06-14T00:00:00Z", cwd: pathA });
    expect(a?.worktreePath).toBe(pathA);
    expect(await waitForPort(SHARED_PORT, 8000)).toBe(true);
    const pgidA = readState(common).active!.pgid;

    // Switch to B — must stop A, wait for the port to free, then start B on the SAME port.
    const b = await runSwitch({ target: pathB, cmd, port: SHARED_PORT, nowIso: "2026-06-14T00:01:00Z", cwd: pathB });
    expect(b?.worktreePath).toBe(pathB);

    // A's process group is gone; state now points at B; B answers on the shared port.
    expect(groupAlive(pgidA)).toBe(false);
    expect(readState(common).active!.worktreePath).toBe(pathB);
    expect(await waitForPort(SHARED_PORT, 8000)).toBe(true);

    // Teardown leaves nothing behind.
    await runStop(pathB);
    expect(readState(common).active).toBeNull();
    expect(await waitForPortFree(SHARED_PORT, 5000)).toBe(true);
  });
});

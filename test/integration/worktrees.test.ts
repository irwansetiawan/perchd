import { describe, it, expect, afterAll, vi } from "vitest";
import { execa } from "execa";
import { mkdtempSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runSwitch } from "../../src/commands/switch.js";
import { runStop } from "../../src/commands/stop.js";
import { runStatus } from "../../src/commands/status.js";
import { readState } from "../../src/core/state.js";
import { gitCommonDir, listWorktrees } from "../../src/core/git.js";

const fixture = fileURLToPath(new URL("../fixtures/mini-server", import.meta.url));

async function realPath(cwd: string): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], { cwd });
  return stdout.trim();
}

describe("locked & detached worktrees", () => {
  const dirs: string[] = [];
  afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

  it("lists locked+detached gracefully; switch to locked warns but proceeds; detached keyed by sha", async () => {
    const root = mkdtempSync(join(tmpdir(), "perchd-wt-"));
    dirs.push(root);
    await execa("git", ["init", "-q", "-b", "main"], { cwd: root });
    await execa("git", ["config", "user.email", "t@t"], { cwd: root });
    await execa("git", ["config", "user.name", "t"], { cwd: root });
    cpSync(fixture, root, { recursive: true });
    await execa("git", ["add", "-A"], { cwd: root });
    await execa("git", ["commit", "-qm", "init"], { cwd: root });

    // A locked worktree on its own branch...
    const lockedPath = `${root}-locked`;
    dirs.push(lockedPath);
    await execa("git", ["worktree", "add", "-q", "-b", "feat/locked", lockedPath], { cwd: root });
    await execa("git", ["worktree", "lock", lockedPath], { cwd: root });
    // ...and a detached worktree.
    const detachedPath = `${root}-det`;
    dirs.push(detachedPath);
    await execa("git", ["worktree", "add", "-q", "--detach", detachedPath], { cwd: root });

    const mainPath = await realPath(root);
    const common = await gitCommonDir(mainPath);

    // git metadata is parsed correctly.
    const wts = await listWorktrees(mainPath);
    const locked = wts.find((w) => w.branch === "feat/locked");
    const detached = wts.find((w) => w.detached);
    expect(locked?.locked).toBe(true);
    expect(detached?.branch).toBeNull();
    expect(detached?.head.length).toBeGreaterThan(7);

    // status lists everything without throwing.
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(runStatus(mainPath, Date.parse("2026-06-14T00:00:00Z"))).resolves.toBeUndefined();
    logSpy.mockRestore();

    // Switching to the LOCKED worktree warns but still starts.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const okSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const a = await runSwitch({ target: locked!.path, cmd: "PORT=39571 node server.js", port: 39571, nowIso: "2026-06-14T00:00:00Z", cwd: mainPath });
    expect(a?.branch).toBe("feat/locked");
    expect(warnSpy.mock.calls.flat().join(" ")).toMatch(/locked/i);
    await runStop(mainPath);
    expect(readState(common).active).toBeNull();

    // Switching to the DETACHED worktree by its short sha works; active.branch is null.
    const shortSha = detached!.head.slice(0, 7);
    const b = await runSwitch({ target: shortSha, cmd: "PORT=39572 node server.js", port: 39572, nowIso: "2026-06-14T00:00:00Z", cwd: mainPath });
    expect(b?.branch).toBeNull();
    expect(b?.worktreePath).toBe(detached!.path);
    expect(b?.logPath).toMatch(new RegExp(`${shortSha}\\.log$`));
    await runStop(mainPath);
    expect(readState(common).active).toBeNull();

    warnSpy.mockRestore();
    okSpy.mockRestore();
  });
});

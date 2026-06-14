import { describe, it, expect, afterAll } from "vitest";
import { execa } from "execa";
import { mkdtempSync, rmSync, cpSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runSwitch } from "../../src/commands/switch.js";
import { runStop } from "../../src/commands/stop.js";
import { startWatch } from "../../src/commands/watch.js";
import { readState } from "../../src/core/state.js";
import { gitCommonDir } from "../../src/core/git.js";
import { waitForPortFree } from "../../src/core/process.js";

const fixture = fileURLToPath(new URL("../fixtures/mini-server", import.meta.url));

async function realPath(cwd: string): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], { cwd });
  return stdout.trim();
}
function groupAlive(pgid: number): boolean {
  try { process.kill(-pgid, 0); return true; } catch { return false; }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function pollActiveNull(commonDir: string, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (readState(commonDir).active === null) return true;
    await sleep(100);
  }
  return readState(commonDir).active === null;
}

describe("perchd watch", () => {
  const containers: string[] = [];
  afterAll(() => { for (const c of containers) rmSync(c, { recursive: true, force: true }); });

  // base/ contains main/ (repo) and b/ (extra worktree) — so the watched parent
  // dir (base) is small, not the whole tmpdir.
  async function setup(): Promise<{ base: string; mainPath: string; bPath: string; common: string }> {
    const base = mkdtempSync(join(tmpdir(), "perchd-watch-"));
    containers.push(base);
    const root = join(base, "main");
    mkdirSync(root);
    await execa("git", ["init", "-q", "-b", "main"], { cwd: root });
    await execa("git", ["config", "user.email", "t@t"], { cwd: root });
    await execa("git", ["config", "user.name", "t"], { cwd: root });
    cpSync(fixture, root, { recursive: true });
    await execa("git", ["add", "-A"], { cwd: root });
    await execa("git", ["commit", "-qm", "init"], { cwd: root });
    await execa("git", ["worktree", "add", "-q", "-b", "feat", join(base, "b")], { cwd: root });
    const mainPath = await realPath(root);
    const bPath = await realPath(join(base, "b"));
    const common = await gitCommonDir(mainPath);
    return { base, mainPath, bPath, common };
  }

  it("auto-stops the active server when its worktree is rm -rf'd", async () => {
    const { mainPath, bPath, common } = await setup();
    const active = await runSwitch({ target: bPath, cmd: "PORT=39621 node server.js", port: 39621, nowIso: "2026-06-14T00:00:00Z", cwd: bPath });
    const pgid = active!.pgid;

    const w = await startWatch(mainPath, { debounceMs: 50, pollMs: 120 });
    try {
      rmSync(bPath, { recursive: true, force: true });   // raw delete — git list still shows it
      expect(await pollActiveNull(common, 5000)).toBe(true);
      expect(groupAlive(pgid)).toBe(false);
      expect(await waitForPortFree(39621, 5000)).toBe(true);
    } finally {
      await w.close();
      await runStop(mainPath); // hygiene: never leak a server if an assertion failed
    }
  });

  it("re-points to a server that becomes active after watch starts", async () => {
    const { mainPath, bPath, common } = await setup();
    // Start watching with NOTHING active.
    const w = await startWatch(mainPath, { debounceMs: 50, pollMs: 120 });
    try {
      const active = await runSwitch({ target: bPath, cmd: "PORT=39622 node server.js", port: 39622, nowIso: "2026-06-14T00:00:00Z", cwd: bPath });
      const pgid = active!.pgid;
      await sleep(400); // let the state-file event re-point the watcher to b's parent
      rmSync(bPath, { recursive: true, force: true });
      expect(await pollActiveNull(common, 5000)).toBe(true);
      expect(groupAlive(pgid)).toBe(false);
      expect(await waitForPortFree(39622, 5000)).toBe(true);
    } finally {
      await w.close();
      await runStop(mainPath); // hygiene: never leak a server if an assertion failed
    }
  });
});

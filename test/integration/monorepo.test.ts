import { describe, it, expect, afterAll } from "vitest";
import { execa } from "execa";
import { mkdtempSync, rmSync, cpSync, mkdirSync, writeFileSync } from "node:fs";
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

describe("monorepo cwd override", () => {
  const dirs: string[] = [];
  afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

  it("starts the server in the configured subdir (apps/web)", async () => {
    const P = 39581;
    const root = mkdtempSync(join(tmpdir(), "perchd-mono-"));
    dirs.push(root);
    await execa("git", ["init", "-q", "-b", "main"], { cwd: root });
    await execa("git", ["config", "user.email", "t@t"], { cwd: root });
    await execa("git", ["config", "user.name", "t"], { cwd: root });

    // App lives in apps/web — NOT at the repo root, so detection at root finds nothing.
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    cpSync(join(fixture, "server.js"), join(root, "apps", "web", "server.js"));
    // Per-worktree config points cwd at the subdir; command + port pin the run.
    writeFileSync(
      join(root, ".perchd.toml"),
      `[worktrees."main"]\ncommand = "PORT=${P} node server.js"\ncwd = "apps/web"\nport = ${P}\n`,
    );
    await execa("git", ["add", "-A"], { cwd: root });
    await execa("git", ["commit", "-qm", "init"], { cwd: root });

    const mainPath = await realPath(root);
    const common = await gitCommonDir(mainPath);

    // No --cmd here: the runner must come from .perchd.toml, including cwd.
    const active = await runSwitch({ target: mainPath, nowIso: "2026-06-14T00:00:00Z", cwd: mainPath });
    expect(active?.cwd).toBe(join(mainPath, "apps", "web"));
    // Server actually bound — proves it ran in the subdir (server.js only exists there).
    expect(await waitForPort(P, 8000)).toBe(true);

    await runStop(mainPath);
    expect(readState(common).active).toBeNull();
    expect(await waitForPortFree(P, 5000)).toBe(true);
  });
});

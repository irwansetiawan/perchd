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
import { waitForPortFree } from "../../src/core/process.js";

const fixture = fileURLToPath(new URL("../fixtures/mini-server", import.meta.url));

// Returns the repo root, which IS the (only) worktree of a fresh `git init`.
async function setupRepo(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "perchd-it-"));
  await execa("git", ["init", "-q"], { cwd: root });
  await execa("git", ["config", "user.email", "t@t"], { cwd: root });
  await execa("git", ["config", "user.name", "t"], { cwd: root });
  // App lives at the worktree ROOT so it matches a `git worktree list` entry
  // and so detectRunner (which runs against the worktree path) finds package.json.
  cpSync(fixture, root, { recursive: true });
  await execa("git", ["add", "-A"], { cwd: root });
  await execa("git", ["commit", "-qm", "init"], { cwd: root });
  return root;
}

describe("M1 switch integration", () => {
  let root: string;
  afterAll(async () => { if (root) rmSync(root, { recursive: true, force: true }); });

  it("starts a server, switch records active, stop frees the port", async () => {
    root = await setupRepo();
    // Resolve the worktree's real path from git (default branch may be main/master,
    // and macOS tmpdir is a symlink), then target BY PATH so branch-name differences don't matter.
    const { stdout } = await execa(
      "git", ["rev-parse", "--path-format=absolute", "--show-toplevel"], { cwd: root },
    );
    const wtPath = stdout.trim();

    // package.json has a fake `next` dep → detector classifies it nextjs/3000;
    // --cmd/--port override on top to pin a hermetic port (PORT env consumed by server.js).
    const active = await runSwitch({
      target: wtPath, cmd: "PORT=3007 node server.js", port: 3007,
      nowIso: "2026-06-14T00:00:00Z", cwd: wtPath,
    });
    expect(active?.port).toBe(3007);

    const common = await gitCommonDir(wtPath);
    expect(readState(common).active?.port).toBe(3007);

    await runStop(wtPath);
    expect(readState(common).active).toBeNull();
    expect(await waitForPortFree(3007, 5000)).toBe(true);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/core/config.js";
import { detectRunner } from "../src/detect/index.js";
import { resolveRunner } from "../src/core/resolve.js";

describe("config + detection precedence end-to-end", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "perchd-e2e-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("per-worktree config overrides a detected next app", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { dev: "next dev" }, dependencies: { next: "14" } }));
    writeFileSync(join(dir, ".perchd.toml"), `[worktrees."feature/auth"]\ncommand = "pnpm dev"\nport = 4000\n`);
    const cfg = loadConfig(dir);
    const detected = detectRunner(dir);
    const r = resolveRunner({ worktreeRoot: dir, branch: "feature/auth", cfg, detected });
    expect(r).toMatchObject({ command: "pnpm dev", port: 4000 });
  });

  it("config command works when nothing is detected (undetected dir)", () => {
    writeFileSync(join(dir, ".perchd.toml"), `[worktrees."weird"]\ncommand = "./run.sh"\nport = 7000\n`);
    const cfg = loadConfig(dir);
    const detected = detectRunner(dir); // null
    const r = resolveRunner({ worktreeRoot: dir, branch: "weird", cfg, detected });
    expect(r).toMatchObject({ command: "./run.sh", port: 7000, type: "custom" });
  });
});

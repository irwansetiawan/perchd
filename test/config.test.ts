import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, DEFAULTS } from "../src/core/config.js";

describe("loadConfig", () => {
  it("returns defaults when no .perchd.toml", () => {
    const dir = mkdtempSync(join(tmpdir(), "perchd-cfg-"));
    try {
      const cfg = loadConfig(dir);
      expect(cfg.ready_timeout).toBe(DEFAULTS.ready_timeout);
      expect(cfg.stop_timeout).toBe(DEFAULTS.stop_timeout);
      expect(cfg.runner).toBeUndefined();
      expect(cfg.worktrees).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("parses runner, worktrees, timeouts", () => {
    const dir = mkdtempSync(join(tmpdir(), "perchd-cfg2-"));
    try {
      writeFileSync(join(dir, ".perchd.toml"), `
ready_timeout = 45
stop_timeout = 10

[runner]
command = "make dev"
port = 3000

[worktrees."feature/auth"]
command = "pnpm dev"
cwd = "apps/web"
port = 4000
env = { DEBUG = "1" }
`);
      const cfg = loadConfig(dir);
      expect(cfg.ready_timeout).toBe(45);
      expect(cfg.stop_timeout).toBe(10);
      expect(cfg.runner).toMatchObject({ command: "make dev", port: 3000 });
      expect(cfg.worktrees["feature/auth"]).toMatchObject({ command: "pnpm dev", cwd: "apps/web", port: 4000, env: { DEBUG: "1" } });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

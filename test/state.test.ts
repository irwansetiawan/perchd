import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readState, writeState, clearActive, isPidAlive } from "../src/core/state.js";
import type { ActiveServer } from "../src/core/state.js";

let common: string;
beforeEach(() => { common = mkdtempSync(join(tmpdir(), "perchd-state-")); });
afterEach(() => { rmSync(common, { recursive: true, force: true }); });

const sample: ActiveServer = {
  branch: "feature/auth", worktreePath: "/wt", type: "nextjs",
  command: "pnpm run dev", cwd: "/wt", pid: process.pid, pgid: process.pid,
  port: 3000, url: "http://localhost:3000", logPath: "/wt/x.log",
  startedAt: "2026-06-14T09:00:00Z",
};

describe("state", () => {
  it("returns null active when no file", () => {
    expect(readState(common).active).toBeNull();
  });

  it("round-trips an active server", () => {
    writeState(common, sample);
    expect(readState(common).active).toMatchObject({ branch: "feature/auth", pid: process.pid });
  });

  it("clears active", () => {
    writeState(common, sample);
    clearActive(common);
    expect(readState(common).active).toBeNull();
  });

  it("detects a live vs dead pid", () => {
    expect(isPidAlive(process.pid)).toBe(true);
    expect(isPidAlive(2_147_483_640)).toBe(false);
  });
});

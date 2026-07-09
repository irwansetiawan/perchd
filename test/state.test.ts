import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { readState, writeState, clearActive, isPidAlive, statePath } from "../src/core/state.js";
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

describe("legacy 0.3.x state migration", () => {
  it("strips the legacy `foreground` field on read", () => {
    const p = statePath(common);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify({
      version: 1,
      active: {
        branch: "x", worktreePath: "/w", type: "vite", command: "c", cwd: "/w",
        pid: 1, pgid: 1, port: 3000, url: "http://localhost:3000",
        logPath: "", startedAt: "2026-01-01T00:00:00Z", foreground: true,
      },
    }));
    const active = readState(common).active as Record<string, unknown> | null;
    expect(active).not.toBeNull();
    expect("foreground" in (active as object)).toBe(false);
    expect((active as any).logPath).toBe(""); // legacy record: nothing to tail
  });
});

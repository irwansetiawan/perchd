import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isNewer, updateNotice, readCache, writeCache, isStale, runUpdateCheck,
  detectManager, updateCommand, autoUpdateEnabled,
} from "../src/core/update.js";
import { runUpdate } from "../src/commands/update.js";

describe("isNewer", () => {
  it("detects a newer latest", () => {
    expect(isNewer("0.5.0", "0.6.0")).toBe(true);
    expect(isNewer("0.5.0", "0.5.1")).toBe(true);
    expect(isNewer("0.5.0", "1.0.0")).toBe(true);
  });
  it("is false when equal or older", () => {
    expect(isNewer("0.5.0", "0.5.0")).toBe(false);
    expect(isNewer("0.6.0", "0.5.0")).toBe(false);
    expect(isNewer("1.0.0", "0.9.9")).toBe(false);
  });
  it("ignores a prerelease suffix on either side", () => {
    expect(isNewer("0.5.0", "0.5.0-beta.1")).toBe(false);
    expect(isNewer("0.5.0-rc.1", "0.5.0")).toBe(false);
  });
});

describe("updateNotice", () => {
  it("returns null when up to date or the cache is absent", () => {
    expect(updateNotice("0.5.0", null)).toBeNull();
    expect(updateNotice("0.5.0", { checkedAt: 1, latest: "0.5.0" })).toBeNull();
    expect(updateNotice("0.6.0", { checkedAt: 1, latest: "0.5.0" })).toBeNull();
  });
  it("names both versions and points at `perchd update` when outdated", () => {
    const n = updateNotice("0.5.0", { checkedAt: 1, latest: "0.6.0" })!;
    expect(n).toContain("0.5.0");
    expect(n).toContain("0.6.0");
    expect(n).toContain("perchd update");
    expect(n.toLowerCase()).toContain("outdated");
  });
  it("says it's auto-updating instead when auto-update is on", () => {
    const n = updateNotice("0.5.0", { checkedAt: 1, latest: "0.6.0" }, { autoUpdate: true })!;
    expect(n).toContain("0.6.0");
    expect(n.toLowerCase()).toContain("background");
    expect(n).not.toContain("perchd update");
  });
});

describe("detectManager", () => {
  it("defaults to npm", () => {
    expect(detectManager("/usr/local/lib/node_modules/perchd/dist/cli.js", {})).toBe("npm");
    expect(detectManager("/Users/x/.nvm/versions/node/v20/lib/node_modules/perchd/dist/cli.js", {})).toBe("npm");
  });
  it("detects pnpm from the path or PNPM_HOME", () => {
    expect(detectManager("/Users/x/Library/pnpm/global/5/.pnpm/perchd@0.6.0/node_modules/perchd/dist/cli.js", {})).toBe("pnpm");
    expect(detectManager("/opt/perchd/dist/cli.js", { PNPM_HOME: "/opt" })).toBe("pnpm");
  });
  it("detects bun from the path", () => {
    expect(detectManager("/Users/x/.bun/install/global/node_modules/perchd/dist/cli.js", {})).toBe("bun");
  });
});

describe("updateCommand", () => {
  it("builds the global-install command per manager", () => {
    expect(updateCommand("npm")).toEqual(["npm", "install", "-g", "perchd@latest"]);
    expect(updateCommand("pnpm")).toEqual(["pnpm", "add", "-g", "perchd@latest"]);
    expect(updateCommand("bun")).toEqual(["bun", "add", "-g", "perchd@latest"]);
  });
});

describe("autoUpdateEnabled", () => {
  it("is off by default and on for truthy values", () => {
    expect(autoUpdateEnabled({})).toBe(false);
    expect(autoUpdateEnabled({ PERCHD_AUTO_UPDATE: "0" })).toBe(false);
    expect(autoUpdateEnabled({ PERCHD_AUTO_UPDATE: "1" })).toBe(true);
    expect(autoUpdateEnabled({ PERCHD_AUTO_UPDATE: "true" })).toBe(true);
  });
});

describe("runUpdateCheck auto-update", () => {
  const p = () => join(mkdtempSync(join(tmpdir(), "perchd-au-")), "u.json");
  it("installs in the background when enabled and outdated", async () => {
    const calls: string[][] = [];
    await runUpdateCheck({
      fetchLatest: async () => "0.7.0", now: () => 1, path: p(),
      current: "0.6.0", autoUpdate: true, binPath: "/usr/local/lib/node_modules/perchd/dist/cli.js",
      exec: async (cmd) => { calls.push(cmd); return 0; },
    });
    expect(calls).toEqual([["npm", "install", "-g", "perchd@latest"]]);
  });
  it("does not install when already up to date", async () => {
    const calls: string[][] = [];
    await runUpdateCheck({
      fetchLatest: async () => "0.6.0", now: () => 1, path: p(),
      current: "0.6.0", autoUpdate: true, exec: async (cmd) => { calls.push(cmd); return 0; },
    });
    expect(calls).toEqual([]);
  });
  it("does not install when auto-update is off", async () => {
    const calls: string[][] = [];
    await runUpdateCheck({
      fetchLatest: async () => "0.7.0", now: () => 1, path: p(),
      current: "0.6.0", autoUpdate: false, exec: async (cmd) => { calls.push(cmd); return 0; },
    });
    expect(calls).toEqual([]);
  });
});

describe("runUpdate command", () => {
  it("runs the detected manager's global-install and returns its exit code", async () => {
    const calls: string[][] = [];
    const code = await runUpdate({
      binPath: "/Users/x/.bun/install/global/node_modules/perchd/dist/cli.js",
      env: {}, log: () => {}, exec: async (cmd) => { calls.push(cmd); return 0; },
    });
    expect(calls).toEqual([["bun", "add", "-g", "perchd@latest"]]);
    expect(code).toBe(0);
  });
  it("returns a non-zero exit code on failure", async () => {
    const code = await runUpdate({
      binPath: "/usr/local/lib/node_modules/perchd/dist/cli.js",
      env: {}, log: () => {}, exec: async () => 1,
    });
    expect(code).toBe(1);
  });
});

describe("cache read/write", () => {
  it("round-trips and returns null on missing or corrupt files", () => {
    const dir = mkdtempSync(join(tmpdir(), "perchd-upd-"));
    const p = join(dir, "u.json");
    try {
      expect(readCache(p)).toBeNull();
      writeCache(p, { checkedAt: 123, latest: "9.9.9" });
      expect(readCache(p)).toEqual({ checkedAt: 123, latest: "9.9.9" });
      writeFileSync(p, "not json");
      expect(readCache(p)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("isStale", () => {
  const cache = { checkedAt: 1000, latest: "0.6.0" };
  const day = 24 * 3600 * 1000;
  it("is stale when the cache is missing or past the TTL", () => {
    expect(isStale(null, 0, day)).toBe(true);
    expect(isStale(cache, 1000 + day, day)).toBe(true);
  });
  it("is fresh within the TTL", () => {
    expect(isStale(cache, 1000 + 1000, day)).toBe(false);
  });
});

describe("runUpdateCheck", () => {
  it("writes the fetched latest version to the cache", async () => {
    const dir = mkdtempSync(join(tmpdir(), "perchd-upd2-"));
    const p = join(dir, "u.json");
    try {
      await runUpdateCheck({ fetchLatest: async () => "1.2.3", now: () => 555, path: p });
      expect(readCache(p)).toEqual({ checkedAt: 555, latest: "1.2.3" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("never throws and writes nothing when the fetch fails (offline)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "perchd-upd3-"));
    const p = join(dir, "u.json");
    try {
      await expect(
        runUpdateCheck({ fetchLatest: async () => { throw new Error("offline"); }, path: p }),
      ).resolves.toBeUndefined();
      expect(readCache(p)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

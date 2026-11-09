import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isNewer, updateNotice, readCache, writeCache, isStale, runUpdateCheck,
  detectManager, resolveInstallPath, updateCommand, autoUpdateEnabled, parseRegistryLatest,
  updateCheckSuppressed, takeUpdatedNotice,
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
  it("says it will install automatically, and how to update now, when auto-update is on", () => {
    const n = updateNotice("0.5.0", { checkedAt: 1, latest: "0.6.0" }, { autoUpdate: true })!;
    expect(n).toContain("0.6.0");
    expect(n).toContain("will install");
    expect(n).toContain("perchd update");
  });
  it("admits failure once a background install of that version has failed", () => {
    const cache = { checkedAt: 1, latest: "0.6.0", autoUpdateFailed: "0.6.0" };
    const n = updateNotice("0.5.0", cache, { autoUpdate: true })!;
    expect(n).toContain("failed");
    expect(n).not.toContain("will install");
    expect(n).toContain("perchd update");
  });
  it("ignores a failure recorded against an older version", () => {
    const cache = { checkedAt: 1, latest: "0.6.0", autoUpdateFailed: "0.5.5" };
    const n = updateNotice("0.5.0", cache, { autoUpdate: true })!;
    expect(n).toContain("will install");
    expect(n).not.toContain("failed");
  });
  it("never promises or suggests a self-update for an install it can't update", () => {
    const n = updateNotice("0.5.0", { checkedAt: 1, latest: "0.6.0" }, { autoUpdate: true, selfUpdatable: false })!;
    expect(n).toContain("0.6.0");
    expect(n).toContain("installed");
    expect(n).not.toContain("perchd update");
    expect(n).not.toContain("will install");
  });
});

describe("takeUpdatedNotice", () => {
  const seed = (cache: object) => {
    const path = join(mkdtempSync(join(tmpdir(), "perchd-took-")), "u.json");
    writeFileSync(path, JSON.stringify(cache));
    return path;
  };
  const updated = { checkedAt: 1, latest: "0.7.0", autoUpdated: { from: "0.6.0", to: "0.7.0" } };

  it("names both versions on the first run of the new version", () => {
    const n = takeUpdatedNotice(seed(updated), "0.7.0")!;
    expect(n).toContain("0.6.0");
    expect(n).toContain("0.7.0");
  });
  it("is shown exactly once, and keeps the rest of the cache", () => {
    const path = seed(updated);
    expect(takeUpdatedNotice(path, "0.7.0")).not.toBeNull();
    expect(takeUpdatedNotice(path, "0.7.0")).toBeNull();
    expect(readCache(path)).toEqual({ checkedAt: 1, latest: "0.7.0" });
  });
  it("waits until the new version is the one actually running", () => {
    const path = seed(updated);
    expect(takeUpdatedNotice(path, "0.6.0")).toBeNull();
    expect(readCache(path)?.autoUpdated).toEqual({ from: "0.6.0", to: "0.7.0" });
  });
  it("stays quiet when nothing was auto-updated", () => {
    expect(takeUpdatedNotice(seed({ checkedAt: 1, latest: "0.7.0" }), "0.7.0")).toBeNull();
  });
});

describe("detectManager", () => {
  it.each([
    ["npm global (Homebrew)", "/opt/homebrew/lib/node_modules/perchd/dist/cli.js", "npm"],
    ["npm global (nvm)", "/Users/x/.nvm/versions/node/v20.11.0/lib/node_modules/perchd/dist/cli.js", "npm"],
    ["npm global under pnpm-managed node", "/Users/x/Library/pnpm/nodejs/20.11.0/lib/node_modules/perchd/dist/cli.js", "npm"],
    ["pnpm global", "/Users/x/Library/pnpm/global/5/.pnpm/perchd@0.6.0/node_modules/perchd/dist/cli.js", "pnpm"],
    ["bun global", "/Users/x/.bun/install/global/node_modules/perchd/dist/cli.js", "bun"],
    ["linked dev checkout", "/Users/x/Projects/perchd/dist/cli.js", null],
    ["yarn global", "/Users/x/.config/yarn/global/node_modules/perchd/dist/cli.js", null],
    ["npx", "/Users/x/.npm/_npx/abc123/node_modules/perchd/dist/cli.js", null],
    ["pnpm dlx", "/Users/x/Library/Caches/pnpm/dlx/abc/def/node_modules/.pnpm/perchd@0.6.0/node_modules/perchd/dist/cli.js", null],
    ["project dependency", "/Users/x/app/node_modules/perchd/dist/cli.js", null],
    ["project dependency via pnpm", "/Users/x/app/node_modules/.pnpm/perchd@0.6.0/node_modules/perchd/dist/cli.js", null],
  ])("%s", (_name, path, want) => {
    expect(detectManager(path, {})).toBe(want);
  });

  it("recognises a global under a custom PNPM_HOME", () => {
    const path = "/opt/pnpm-home/global/5/.pnpm/perchd@0.6.0/node_modules/perchd/dist/cli.js";
    expect(detectManager(path, { PNPM_HOME: "/opt/pnpm-home" })).toBe("pnpm");
    expect(detectManager(path, {})).toBeNull();
  });
  it("recognises a global under a custom BUN_INSTALL", () => {
    expect(detectManager("/opt/bun-home/install/global/node_modules/perchd/dist/cli.js", {})).toBe("bun");
  });
});

describe("resolveInstallPath", () => {
  const prefix = () => realpathSync(mkdtempSync(join(tmpdir(), "perchd-prefix-")));

  it("follows npm's bin symlink to the real package", () => {
    const root = prefix();
    mkdirSync(join(root, "lib/node_modules/perchd/dist"), { recursive: true });
    writeFileSync(join(root, "lib/node_modules/perchd/dist/cli.js"), "");
    mkdirSync(join(root, "bin"));
    symlinkSync("../lib/node_modules/perchd/dist/cli.js", join(root, "bin/perchd"));
    expect(detectManager(resolveInstallPath(join(root, "bin/perchd")), {})).toBe("npm");
  });
  it("sees through `npm link` to the checkout, which must not self-update", () => {
    const root = prefix();
    mkdirSync(join(root, "checkout/dist"), { recursive: true });
    writeFileSync(join(root, "checkout/dist/cli.js"), "");
    mkdirSync(join(root, "lib/node_modules"), { recursive: true });
    symlinkSync(join(root, "checkout"), join(root, "lib/node_modules/perchd"));
    mkdirSync(join(root, "bin"));
    symlinkSync("../lib/node_modules/perchd/dist/cli.js", join(root, "bin/perchd"));
    expect(detectManager(resolveInstallPath(join(root, "bin/perchd")), {})).toBeNull();
  });
  it("returns the input when the path can't be resolved", () => {
    expect(resolveInstallPath("/no/such/perchd")).toBe("/no/such/perchd");
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
  it("is on by default", () => {
    expect(autoUpdateEnabled({})).toBe(true);
    expect(autoUpdateEnabled({ PERCHD_AUTO_UPDATE: "" })).toBe(true);
    expect(autoUpdateEnabled({ PERCHD_AUTO_UPDATE: "1" })).toBe(true);
  });
  it.each(["0", "false", "no", "off", "OFF"])("is opted out by PERCHD_AUTO_UPDATE=%s", (value) => {
    expect(autoUpdateEnabled({ PERCHD_AUTO_UPDATE: value })).toBe(false);
  });
});

describe("parseRegistryLatest", () => {
  const doc = {
    name: "perchd",
    "dist-tags": { latest: "0.6.0" },
    time: {
      created: "2026-06-14T00:00:00.000Z",
      modified: "2026-07-12T14:38:55.000Z",
      "0.4.0": "2026-07-09T15:07:57.046Z",
      "0.6.0": "2026-07-12T14:38:54.730Z",
    },
  };
  it("reads the latest dist-tag and that version's publish time", () => {
    expect(parseRegistryLatest(doc)).toEqual({ version: "0.6.0", publishedAt: Date.UTC(2026, 6, 12, 14, 38, 54, 730) });
  });
  it("reports an unknown publish time as null", () => {
    expect(parseRegistryLatest({ "dist-tags": { latest: "0.6.0" } }).publishedAt).toBeNull();
    expect(parseRegistryLatest({ "dist-tags": { latest: "0.6.0" }, time: { "0.6.0": "garbage" } }).publishedAt).toBeNull();
  });
  it("throws when the registry names no latest version", () => {
    expect(() => parseRegistryLatest({})).toThrow();
  });
});

describe("updateCheckSuppressed", () => {
  const interactive = { argv: ["status"], isTTY: true, env: {}, script: "/usr/local/bin/perchd" };

  it("allows an ordinary interactive command", () => {
    expect(updateCheckSuppressed(interactive)).toBe(false);
  });
  it.each([
    ["`perchd update` itself", { argv: ["update"] }],
    ["captured stdout", { isTTY: false }],
    ["CI", { env: { CI: "true" } }],
    ["NO_UPDATE_NOTIFIER", { env: { NO_UPDATE_NOTIFIER: "1" } }],
    ["running from source", { script: "/repo/src/cli.ts" }],
  ])("skips for %s", (_name, over) => {
    expect(updateCheckSuppressed({ ...interactive, ...over })).toBe(true);
  });
});

describe("runUpdateCheck auto-update", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const NOW = Date.UTC(2026, 10, 10);
  const NPM_INSTALL = "/usr/local/lib/node_modules/perchd/dist/cli.js";
  const aged = { version: "0.7.0", publishedAt: NOW - 4 * DAY };

  async function check(over: Parameters<typeof runUpdateCheck>[0] = {}, seed?: object) {
    const path = join(mkdtempSync(join(tmpdir(), "perchd-au-")), "u.json");
    if (seed) writeFileSync(path, JSON.stringify(seed));
    const calls: string[][] = [];
    await runUpdateCheck({
      fetchLatest: async () => aged,
      now: () => NOW,
      path,
      current: "0.6.0",
      autoUpdate: true,
      binPath: NPM_INSTALL,
      exec: async (cmd) => { calls.push(cmd); return 0; },
      ...over,
    });
    return { calls, cache: readCache(path) };
  }

  it("installs exactly the version that passed the cooldown, not whatever is latest by then", async () => {
    const { calls } = await check();
    expect(calls).toEqual([["npm", "install", "-g", "perchd@0.7.0"]]);
  });
  it("uses the manager that owns the install", async () => {
    const { calls } = await check({ binPath: "/Users/x/.bun/install/global/node_modules/perchd/dist/cli.js" });
    expect(calls).toEqual([["bun", "add", "-g", "perchd@0.7.0"]]);
  });
  it("holds a release that is just under 3 days old", async () => {
    const { calls, cache } = await check({ fetchLatest: async () => ({ version: "0.7.0", publishedAt: NOW - 3 * DAY + 1 }) });
    expect(calls).toEqual([]);
    expect(cache?.latest).toBe("0.7.0");
  });
  it("installs a release that is exactly 3 days old", async () => {
    const { calls } = await check({ fetchLatest: async () => ({ version: "0.7.0", publishedAt: NOW - 3 * DAY }) });
    expect(calls).toHaveLength(1);
  });
  it("holds a release whose publish time is unknown", async () => {
    const { calls } = await check({ fetchLatest: async () => ({ version: "0.7.0", publishedAt: null }) });
    expect(calls).toEqual([]);
  });
  it("does nothing when already up to date", async () => {
    const { calls } = await check({ current: "0.7.0" });
    expect(calls).toEqual([]);
  });
  it("does nothing when opted out", async () => {
    const { calls } = await check({ autoUpdate: false });
    expect(calls).toEqual([]);
  });
  it("never installs over a linked dev checkout", async () => {
    const { calls } = await check({ binPath: "/Users/x/Projects/perchd/dist/cli.js" });
    expect(calls).toEqual([]);
  });
  it("records a successful install for the one-time message", async () => {
    const { cache } = await check();
    expect(cache?.autoUpdated).toEqual({ from: "0.6.0", to: "0.7.0" });
    expect(cache?.autoUpdateFailed).toBeUndefined();
  });
  it("records a failed install, and doesn't claim an update", async () => {
    const { cache } = await check({ exec: async () => 1 });
    expect(cache?.autoUpdateFailed).toBe("0.7.0");
    expect(cache?.autoUpdated).toBeUndefined();
  });
  it("keeps showing the failure while it retries, then clears it on success", async () => {
    let during: string | undefined;
    const path = join(mkdtempSync(join(tmpdir(), "perchd-au-")), "u.json");
    writeFileSync(path, JSON.stringify({ checkedAt: 1, latest: "0.7.0", autoUpdateFailed: "0.7.0" }));
    await runUpdateCheck({
      fetchLatest: async () => aged, now: () => NOW, path,
      current: "0.6.0", autoUpdate: true, binPath: NPM_INSTALL,
      exec: async () => { during = readCache(path)?.autoUpdateFailed; return 0; },
    });
    expect(during).toBe("0.7.0");
    expect(readCache(path)?.autoUpdateFailed).toBeUndefined();
  });
  it("forgets a failure once a newer version is out", async () => {
    const { cache } = await check({ autoUpdate: false }, { checkedAt: 1, latest: "0.6.5", autoUpdateFailed: "0.6.5" });
    expect(cache).toEqual({ checkedAt: NOW, latest: "0.7.0" });
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
  it("refuses an install it can't identify rather than creating a second copy", async () => {
    const calls: string[][] = [];
    const logs: string[] = [];
    const code = await runUpdate({
      binPath: "/Users/x/Projects/perchd/dist/cli.js",
      env: {}, log: (m) => logs.push(m), exec: async (cmd) => { calls.push(cmd); return 0; },
    });
    expect(calls).toEqual([]);
    expect(code).toBe(1);
    expect(logs.join("\n")).toContain("/Users/x/Projects/perchd/dist/cli.js");
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
      await runUpdateCheck({ fetchLatest: async () => ({ version: "1.2.3", publishedAt: null }), now: () => 555, path: p });
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

import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isNewer, updateNotice, readCache, writeCache, isStale, runUpdateCheck,
} from "../src/core/update.js";

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
  it("names both versions and the update command when outdated", () => {
    const n = updateNotice("0.5.0", { checkedAt: 1, latest: "0.6.0" })!;
    expect(n).toContain("0.5.0");
    expect(n).toContain("0.6.0");
    expect(n).toContain("npm i -g perchd");
    expect(n.toLowerCase()).toContain("outdated");
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

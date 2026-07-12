import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import pc from "picocolors";

export interface UpdateCache {
  checkedAt: number;
  latest: string;
}

const REGISTRY_URL = "https://registry.npmjs.org/perchd/latest";
const TTL_MS = 24 * 60 * 60 * 1000;
const HIDDEN_COMMAND = "__update-check";

/** Numeric x.y.z compare; a prerelease suffix (`-beta.1`) is ignored. Pure. */
export function isNewer(current: string, latest: string): boolean {
  const parse = (v: string) => v.split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  const a = parse(current);
  const b = parse(latest);
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (y > x) return true;
    if (y < x) return false;
  }
  return false;
}

/** The two-line notice, or null when up to date / no cache. Pure. */
export function updateNotice(current: string, cache: UpdateCache | null): string | null {
  if (!cache?.latest || !isNewer(current, cache.latest)) return null;
  return [
    pc.yellow(`⚠ Your perchd version ${current} is outdated. Latest is ${cache.latest}.`),
    pc.dim("  Update with: npm i -g perchd@latest"),
  ].join("\n");
}

export function cachePath(): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "perchd", "update-check.json");
}

export function readCache(path: string): UpdateCache | null {
  try {
    if (!existsSync(path)) return null;
    const j = JSON.parse(readFileSync(path, "utf8"));
    if (typeof j?.latest === "string" && typeof j?.checkedAt === "number") return j;
    return null;
  } catch {
    return null;
  }
}

export function writeCache(path: string, data: UpdateCache): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data));
  } catch {
    /* fail-silent: a cache we can't write just means we check again next time */
  }
}

export function isStale(cache: UpdateCache | null, now: number, ttlMs = TTL_MS): boolean {
  if (!cache) return true;
  return now - cache.checkedAt >= ttlMs;
}

export interface UpdateCheckDeps {
  fetchLatest?: () => Promise<string>;
  now?: () => number;
  path?: string;
}

async function defaultFetchLatest(): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(REGISTRY_URL, { signal: ctrl.signal });
    const json = (await res.json()) as { version?: string };
    if (!json.version) throw new Error("no version in registry response");
    return json.version;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The hidden `perchd __update-check` body: fetch the registry, write the cache,
 * exit. Never throws — offline / 404 / timeout just leaves the cache untouched.
 */
export async function runUpdateCheck(deps: UpdateCheckDeps = {}): Promise<void> {
  const fetchLatest = deps.fetchLatest ?? defaultFetchLatest;
  const now = deps.now ?? Date.now;
  const path = deps.path ?? cachePath();
  try {
    const latest = await fetchLatest();
    if (latest) writeCache(path, { checkedAt: now(), latest });
  } catch {
    /* fail-silent */
  }
}

/** Spawn a detached, unref'd refresh so it outlives — and never delays — this call. */
export function refreshInBackground(): void {
  try {
    const child = spawn(process.execPath, [process.argv[1], HIDDEN_COMMAND], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    /* fail-silent */
  }
}

/** True → skip the whole feature (no notice, no refresh). */
export function updateCheckSuppressed(): boolean {
  if (!process.stdout.isTTY) return true; // captured output ($(perchd path)), pipes, files
  if (process.env.CI || process.env.NO_UPDATE_NOTIFIER) return true;
  if ((process.argv[1] ?? "").endsWith(".ts")) return true; // running from source via tsx
  return false;
}

/**
 * Read the cache and, if it shows a newer version, print the notice to stderr on
 * exit (after command output, on every exit path). Kick off a background refresh
 * when the cache is stale, for next time. Never blocks the command.
 */
export function maybeNotifyUpdate(current: string): void {
  if (updateCheckSuppressed()) return;
  const path = cachePath();
  const cache = readCache(path);
  const notice = updateNotice(current, cache);
  if (notice) {
    process.on("exit", () => {
      try { process.stderr.write(notice + "\n"); } catch { /* stream gone */ }
    });
  }
  if (isStale(cache, Date.now())) refreshInBackground();
}

export { HIDDEN_COMMAND };

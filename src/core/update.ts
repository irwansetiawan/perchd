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

export type PackageManager = "npm" | "pnpm" | "bun";

/**
 * Which package manager owns this install, sniffed from the running binary's
 * path (and PNPM_HOME). Each manager keeps globals in its own prefix with its
 * own update command, so `npm i -g` against a pnpm/bun install would create a
 * second, shadowing copy instead of updating the real one. Best-effort; npm is
 * the default. Pure.
 */
export function detectManager(binPath: string, env: NodeJS.ProcessEnv = process.env): PackageManager {
  const p = binPath.replace(/\\/g, "/");
  if (p.includes("/.bun/") || p.includes("/bun/install/")) return "bun";
  const home = (env.PNPM_HOME ?? "").replace(/\\/g, "/");
  if (p.includes("/pnpm/") || p.includes("/.pnpm/") || (home && p.startsWith(home))) return "pnpm";
  return "npm";
}

/** The global-install argv for a manager. Pure. */
export function updateCommand(manager: PackageManager, pkg = "perchd@latest"): string[] {
  if (manager === "pnpm") return ["pnpm", "add", "-g", pkg];
  if (manager === "bun") return ["bun", "add", "-g", pkg];
  return ["npm", "install", "-g", pkg];
}

/** Opt-in background auto-update, off unless `PERCHD_AUTO_UPDATE` is truthy. Pure. */
export function autoUpdateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.PERCHD_AUTO_UPDATE ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export interface NoticeOpts {
  autoUpdate?: boolean;
}

/** The two-line notice, or null when up to date / no cache. Pure. */
export function updateNotice(
  current: string,
  cache: UpdateCache | null,
  opts: NoticeOpts = {},
): string | null {
  if (!cache?.latest || !isNewer(current, cache.latest)) return null;
  const head = pc.yellow(`⚠ Your perchd version ${current} is outdated. Latest is ${cache.latest}.`);
  const action = opts.autoUpdate
    ? pc.dim("  Auto-updating in the background — restart perchd to use it.")
    : pc.dim("  Run: perchd update");
  return [head, action].join("\n");
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
  /** Our own version, so the background check can decide whether to auto-update. */
  current?: string;
  autoUpdate?: boolean;
  binPath?: string;
  /** Injectable install runner (returns an exit code); defaults to spawning the manager. */
  exec?: (cmd: string[]) => Promise<number>;
}

/** Run a command to completion, resolving to its exit code. stdio inherited. */
export function execCommand(cmd: string[], opts: { silent?: boolean } = {}): Promise<number> {
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd[0], cmd.slice(1), {
        stdio: opts.silent ? "ignore" : "inherit",
        shell: false,
      });
      child.on("error", () => resolve(1));
      child.on("close", (code) => resolve(code ?? 1));
    } catch {
      resolve(1);
    }
  });
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
    if (!latest) return;
    writeCache(path, { checkedAt: now(), latest });

    // Opt-in auto-update: if enabled and we're behind, install the new version in
    // this already-detached process. It applies to the *next* run. Fail-silent —
    // a sudo-needing (system-node) or otherwise unwritable install just no-ops
    // and the notice keeps showing, so we never brick or block anything.
    if (deps.autoUpdate && deps.current && isNewer(deps.current, latest)) {
      const binPath = deps.binPath ?? process.argv[1] ?? "";
      const cmd = updateCommand(detectManager(binPath));
      const exec = deps.exec ?? ((c: string[]) => execCommand(c, { silent: true }));
      await exec(cmd);
    }
  } catch {
    /* fail-silent */
  }
}

/**
 * Spawn a detached, unref'd refresh so it outlives — and never delays — this
 * call. The current version rides along as an argv so the child can auto-update
 * (when opted in) without re-reading package.json.
 */
export function refreshInBackground(current?: string): void {
  try {
    const args = [process.argv[1], HIDDEN_COMMAND];
    if (current) args.push(current);
    const child = spawn(process.execPath, args, {
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
  const notice = updateNotice(current, cache, { autoUpdate: autoUpdateEnabled() });
  if (notice) {
    process.on("exit", () => {
      try { process.stderr.write(notice + "\n"); } catch { /* stream gone */ }
    });
  }
  if (isStale(cache, Date.now())) refreshInBackground(current);
}

export { HIDDEN_COMMAND };

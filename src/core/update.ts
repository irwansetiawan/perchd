import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import pc from "picocolors";

export interface UpdateCache {
  checkedAt: number;
  latest: string;
  /** The version whose background install last failed, so the notice can say so. */
  autoUpdateFailed?: string;
  /** A background install that succeeded and hasn't been announced yet. */
  autoUpdated?: { from: string; to: string };
}

export interface RegistryLatest {
  version: string;
  /** Epoch ms the version was published, or null when the registry doesn't say. */
  publishedAt: number | null;
}

// The full packument: unlike /perchd/latest it carries each version's publish time.
const REGISTRY_URL = "https://registry.npmjs.org/perchd";
const CHANGELOG_URL = "https://github.com/irwansetiawan/perchd/blob/main/CHANGELOG.md";
const TTL_MS = 24 * 60 * 60 * 1000;
/** How long a release must have been on npm before it is auto-installed. */
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
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
 * Which package manager owns this global install, from the package's real path
 * (see resolveInstallPath). Each manager keeps globals in its own prefix, so
 * installing with the wrong one creates a second, shadowing copy instead of
 * updating the real one. Null means we can't positively identify a global install
 * (a linked dev checkout, yarn, npx, a project dependency) and must not touch it. Pure.
 */
export function detectManager(installPath: string, env: NodeJS.ProcessEnv = process.env): PackageManager | null {
  if (!installPath.includes("/node_modules/perchd/")) return null;
  if (installPath.includes("/install/global/node_modules/perchd/")) return "bun";
  const pnpmHome = env.PNPM_HOME;
  if (installPath.includes("/pnpm/global/") || (pnpmHome && installPath.startsWith(`${pnpmHome}/global/`))) return "pnpm";
  if (installPath.includes("/lib/node_modules/perchd/")) return "npm";
  return null;
}

/**
 * The real path of the running script. argv[1] is the bin symlink for npm and bun,
 * which says nothing about where the package lives, and following it is also what
 * exposes an `npm link` as a checkout.
 */
export function resolveInstallPath(argv1: string = process.argv[1] ?? ""): string {
  try {
    return realpathSync(argv1);
  } catch {
    return argv1;
  }
}

/** The global-install argv for a manager. Pure. */
export function updateCommand(manager: PackageManager, pkg = "perchd@latest"): string[] {
  if (manager === "pnpm") return ["pnpm", "add", "-g", pkg];
  if (manager === "bun") return ["bun", "add", "-g", pkg];
  return ["npm", "install", "-g", pkg];
}

/** Background auto-update, on unless `PERCHD_AUTO_UPDATE` opts out. Pure. */
export function autoUpdateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.PERCHD_AUTO_UPDATE ?? "").toLowerCase();
  return !(v === "0" || v === "false" || v === "no" || v === "off");
}

export interface NoticeOpts {
  autoUpdate?: boolean;
  /** False when this install isn't one `perchd update` can act on. */
  selfUpdatable?: boolean;
}

/** The two-line notice, or null when up to date / no cache. Pure. */
export function updateNotice(
  current: string,
  cache: UpdateCache | null,
  opts: NoticeOpts = {},
): string | null {
  if (!cache?.latest || !isNewer(current, cache.latest)) return null;
  const head = pc.yellow(`⚠ Your perchd version ${current} is outdated. Latest is ${cache.latest}.`);
  return [head, pc.dim(`  ${noticeAction(cache, opts)}`)].join("\n");
}

function noticeAction(cache: UpdateCache, opts: NoticeOpts): string {
  if (opts.selfUpdatable === false) return "Update it the same way you installed it.";
  if (!opts.autoUpdate) return "Run: perchd update";
  if (cache.autoUpdateFailed === cache.latest) return "Automatic update failed. Run: perchd update";
  return "perchd will install it automatically. To update now, run: perchd update";
}

/**
 * The one-time "we updated you" message, on the first run of the version a
 * background install put in place. Consumes the record, so it prints once.
 */
export function takeUpdatedNotice(path: string, current: string): string | null {
  const cache = readCache(path);
  if (!cache?.autoUpdated || cache.autoUpdated.to !== current) return null;
  const { autoUpdated, ...rest } = cache;
  writeCache(path, rest);
  return [
    pc.green(`✓ perchd updated itself from ${autoUpdated.from} to ${autoUpdated.to}.`),
    pc.dim(`  What changed: ${CHANGELOG_URL}`),
    pc.dim("  To turn off automatic updates, set PERCHD_AUTO_UPDATE=0."),
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
  fetchLatest?: () => Promise<RegistryLatest>;
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

/** The latest version and when it was published, from a registry packument. Pure. */
export function parseRegistryLatest(doc: {
  "dist-tags"?: { latest?: string };
  time?: Record<string, string>;
}): RegistryLatest {
  const version = doc["dist-tags"]?.latest;
  if (!version) throw new Error("no latest version in registry response");
  const publishedAt = Date.parse(doc.time?.[version] ?? "");
  return { version, publishedAt: Number.isNaN(publishedAt) ? null : publishedAt };
}

async function defaultFetchLatest(): Promise<RegistryLatest> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(REGISTRY_URL, { signal: ctrl.signal });
    return parseRegistryLatest((await res.json()) as Parameters<typeof parseRegistryLatest>[0]);
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
    const previous = readCache(path);
    const { version: latest, publishedAt } = await fetchLatest();
    if (!latest) return;
    const entry: UpdateCache = { checkedAt: now(), latest };
    if (previous?.autoUpdateFailed === latest) entry.autoUpdateFailed = latest;
    writeCache(path, entry);

    // Auto-update: install in this already-detached process, applying to the *next*
    // run. Only a release past its cooldown, only an install we can positively
    // identify. Pinned to the version we vetted: `@latest` could by now be a newer
    // one that hasn't cooled down. A failure (say, a system node needing sudo) is
    // recorded so the notice stops promising an update and points at `perchd update`.
    if (!deps.autoUpdate || !deps.current || !isNewer(deps.current, latest)) return;
    if (publishedAt === null || now() - publishedAt < COOLDOWN_MS) return;
    const manager = detectManager(deps.binPath ?? resolveInstallPath());
    if (!manager) return;

    const exec = deps.exec ?? ((c: string[]) => execCommand(c, { silent: true }));
    const code = await exec(updateCommand(manager, `perchd@${latest}`));
    writeCache(path, code === 0
      ? { checkedAt: entry.checkedAt, latest, autoUpdated: { from: deps.current, to: latest } }
      : { ...entry, autoUpdateFailed: latest });
  } catch {
    /* fail-silent */
  }
}

/**
 * Spawn a detached, unref'd refresh so it outlives — and never delays — this
 * call. The current version rides along as an argv so the child can auto-update
 * without re-reading package.json.
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

export interface SuppressionContext {
  argv: string[];
  isTTY: boolean | undefined;
  env: NodeJS.ProcessEnv;
  script: string;
}

/** True → skip the whole feature (no notice, no refresh). */
export function updateCheckSuppressed(ctx: SuppressionContext = {
  argv: process.argv.slice(2),
  isTTY: process.stdout.isTTY,
  env: process.env,
  script: process.argv[1] ?? "",
}): boolean {
  if (ctx.argv[0] === "update") return true; // would say "outdated" right after updating, and race a background install
  if (!ctx.isTTY) return true; // captured output ($(perchd path)), pipes, files
  if (ctx.env.CI || ctx.env.NO_UPDATE_NOTIFIER) return true;
  if (ctx.script.endsWith(".ts")) return true; // running from source via tsx
  return false;
}

/**
 * Read the cache and, if there's news (a newer version, or a background update
 * that just landed), print it to stderr on exit (after command output, on every
 * exit path). Kick off a background refresh when the cache is stale, for next
 * time. Never blocks the command.
 */
export function maybeNotifyUpdate(current: string): void {
  if (updateCheckSuppressed()) return;
  const path = cachePath();
  const updated = takeUpdatedNotice(path, current);
  const cache = readCache(path);
  const notice = updateNotice(current, cache, {
    autoUpdate: autoUpdateEnabled(),
    selfUpdatable: detectManager(resolveInstallPath()) !== null,
  });
  const message = [updated, notice].filter(Boolean).join("\n");
  if (message) {
    process.on("exit", () => {
      try { process.stderr.write(message + "\n"); } catch { /* stream gone */ }
    });
  }
  if (isStale(cache, Date.now())) refreshInBackground(current);
}

export { HIDDEN_COMMAND };

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";

export interface RunnerOverride {
  command?: string;
  cwd?: string;
  port?: number;
  env?: Record<string, string>;
}

export interface Config {
  ready_timeout: number;
  stop_timeout: number;
  runner?: RunnerOverride;
  worktrees: Record<string, RunnerOverride>;
}

export const DEFAULTS = { ready_timeout: 30, stop_timeout: 8 };

export function loadConfig(repoRoot: string): Config {
  const p = join(repoRoot, ".perchd.toml");
  const base: Config = { ...DEFAULTS, worktrees: {} };
  if (!existsSync(p)) return base;
  const raw = parseToml(readFileSync(p, "utf8")) as any;
  return {
    ready_timeout: typeof raw.ready_timeout === "number" ? raw.ready_timeout : DEFAULTS.ready_timeout,
    stop_timeout: typeof raw.stop_timeout === "number" ? raw.stop_timeout : DEFAULTS.stop_timeout,
    runner: raw.runner,
    worktrees: raw.worktrees ?? {},
  };
}

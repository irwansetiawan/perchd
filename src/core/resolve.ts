import { isAbsolute, join } from "node:path";
import type { Config, RunnerOverride } from "./config.js";
import type { Runner } from "../detect/types.js";
import { urlFor } from "../detect/types.js";

export interface ResolveInput {
  worktreeRoot: string;
  branch: string | null;
  cfg: Config;
  detected: Runner | null;
  cli?: { command?: string; port?: number };
}

function abs(root: string, cwd?: string): string {
  if (!cwd) return root;
  return isAbsolute(cwd) ? cwd : join(root, cwd);
}

export function resolveRunner(input: ResolveInput): Runner | null {
  const { worktreeRoot, branch, cfg, detected, cli } = input;
  const branchCfg: RunnerOverride | undefined = branch ? cfg.worktrees[branch] : undefined;

  // Start from detection, or build a bare base if config OR a --cmd override provides a command.
  const haveCommand = !!(branchCfg?.command || cfg.runner?.command || cli?.command);
  let runner: Runner | null = detected
    ? { ...detected }
    : haveCommand
      ? { type: "custom", command: "", cwd: worktreeRoot, port: 3000, url: urlFor(3000) }
      : null;

  const apply = (o: RunnerOverride | undefined, type = "custom") => {
    if (!o || !runner) return;
    if (o.command) { runner.command = o.command; runner.type = type; }
    if (o.cwd) runner.cwd = abs(worktreeRoot, o.cwd);
    if (typeof o.port === "number") runner.port = o.port;
    if (o.env) runner.env = { ...runner.env, ...o.env };
  };

  apply(cfg.runner);
  apply(branchCfg);

  if (runner && cli?.command) runner.command = cli.command;
  if (runner && typeof cli?.port === "number") runner.port = cli.port;
  if (runner) runner.url = urlFor(runner.port);
  return runner;
}

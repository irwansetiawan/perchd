import pc from "picocolors";
import {
  detectManager, updateCommand, execCommand, type PackageManager,
} from "../core/update.js";

export interface UpdateDeps {
  binPath?: string;
  env?: NodeJS.ProcessEnv;
  log?: (m: string) => void;
  exec?: (cmd: string[]) => Promise<number>;
}

/**
 * `perchd update` — update perchd in place using the package manager that
 * installed it (npm/pnpm/bun), so we never create a second, shadowing copy in a
 * different global prefix. Foreground and explicit: output is inherited, and if
 * the install needs sudo (system node) the user sees the error and can re-run.
 */
export async function runUpdate(deps: UpdateDeps = {}): Promise<number> {
  const binPath = deps.binPath ?? process.argv[1] ?? "";
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((m: string) => console.log(m));
  const exec = deps.exec ?? ((cmd: string[]) => execCommand(cmd));

  const manager: PackageManager = detectManager(binPath, env);
  const cmd = updateCommand(manager);
  log(pc.dim(`Updating perchd via ${manager}: ${cmd.join(" ")}`));

  const code = await exec(cmd);
  if (code === 0) log(pc.green("✓ perchd updated — the new version applies on your next run."));
  else log(pc.red(`Update failed (exit ${code}). Try re-running it yourself: ${cmd.join(" ")}`));
  return code;
}

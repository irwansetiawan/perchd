import pc from "picocolors";
import {
  detectManager, resolveInstallPath, updateCommand, execCommand,
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
 * different global prefix. Refuses an install it can't identify for the same
 * reason. Foreground and explicit: output is inherited, and if the install needs
 * sudo (system node) the user sees the error and can re-run. Always takes `latest`:
 * the auto-update cooldown doesn't apply to an update someone asked for.
 */
export async function runUpdate(deps: UpdateDeps = {}): Promise<number> {
  const binPath = deps.binPath ?? resolveInstallPath();
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((m: string) => console.log(m));
  const exec = deps.exec ?? ((cmd: string[]) => execCommand(cmd));

  const manager = detectManager(binPath, env);
  if (!manager) {
    log(pc.red(`perchd can't update itself: ${binPath} isn't a global npm, pnpm or bun install.`));
    log(pc.dim("Update it the same way you installed it. For a linked checkout, pull and rebuild."));
    return 1;
  }
  const cmd = updateCommand(manager);
  log(pc.dim(`Updating perchd via ${manager}: ${cmd.join(" ")}`));

  const code = await exec(cmd);
  if (code === 0) log(pc.green("✓ perchd updated — the new version applies on your next run."));
  else log(pc.red(`Update failed (exit ${code}). Try re-running it yourself: ${cmd.join(" ")}`));
  return code;
}

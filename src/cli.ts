import { cac } from "cac";
import pc from "picocolors";
import { loadContext } from "./core/context.js";
import { readState } from "./core/state.js";
import { pick } from "./ui/picker.js";
import { runSwitch } from "./commands/switch.js";
import { runStatus } from "./commands/status.js";
import { runStop } from "./commands/stop.js";

const cli = cac("perchd");
const cwd = process.cwd();
const nowIso = () => new Date().toISOString();

// cac/mri may yield a string or array for repeated flags; normalize to a single number.
function toPort(v: unknown): number | undefined {
  const raw = Array.isArray(v) ? v[v.length - 1] : v;
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function fail(e: unknown): never {
  console.error(pc.red(e instanceof Error ? e.message : String(e)));
  process.exit(1);
}

cli
  .command("[target]", "switch active dev server (interactive if no target)")
  .option("--cmd <str>", "override launch command")
  .option("--port <n>", "override port")
  .option("--no-wait", "skip readiness wait")
  .action(async (target: string | undefined, flags: any) => {
    try {
      let chosen = target;
      if (!chosen) {
        const ctx = await loadContext(cwd);
        const active = readState(ctx.commonDir).active;
        const sel = await pick(ctx.worktrees, active?.worktreePath ?? null);
        if (!sel) return;
        chosen = sel;
      }
      await runSwitch({ target: chosen, cmd: flags.cmd, port: toPort(flags.port), noWait: flags.wait === false, nowIso: nowIso(), cwd });
    } catch (e) { fail(e); }
  });

cli.command("switch [target]", "switch active dev server")
  .option("--cmd <str>", "override launch command")
  .option("--port <n>", "override port")
  .option("--no-wait", "skip readiness wait")
  .action(async (target: string | undefined, flags: any) => {
    try { await runSwitch({ target, cmd: flags.cmd, port: toPort(flags.port), noWait: flags.wait === false, nowIso: nowIso(), cwd }); }
    catch (e) { fail(e); }
  });

cli.command("status", "list worktrees and the active server").alias("ls")
  .action(async () => { try { await runStatus(cwd, Date.now()); } catch (e) { fail(e); } });

cli.command("stop", "stop the active server")
  .action(async () => { try { await runStop(cwd); } catch (e) { fail(e); } });

cli.help();
cli.parse();

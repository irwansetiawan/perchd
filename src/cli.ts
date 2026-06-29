import { cac } from "cac";
import pc from "picocolors";
import { loadContext } from "./core/context.js";
import { readState } from "./core/state.js";
import { pick } from "./ui/picker.js";
import { runSwitch } from "./commands/switch.js";
import { runStatus } from "./commands/status.js";
import { runStop } from "./commands/stop.js";
import { runRestart } from "./commands/restart.js";
import { runLogs } from "./commands/logs.js";
import { runOpen } from "./commands/open.js";
import { runPath } from "./commands/path.js";
import { runGc } from "./commands/gc.js";
import { runDoctor } from "./commands/doctor.js";
import { runConfig } from "./commands/config.js";
import { runWatch } from "./commands/watch.js";
import { startDev, finishDev } from "./commands/dev.js";
import { stopGroup } from "./core/process.js";

const cli = cac("perchd");
const cwd = process.cwd();
let devPassthrough: string[] = [];
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
  .option("--force", "kill any foreign process holding the target port")
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
      await runSwitch({ target: chosen, cmd: flags.cmd, port: toPort(flags.port), noWait: flags.wait === false, force: !!flags.force, nowIso: nowIso(), cwd });
    } catch (e) { fail(e); }
  });

cli.command("switch [target]", "switch active dev server")
  .option("--cmd <str>", "override launch command")
  .option("--port <n>", "override port")
  .option("--no-wait", "skip readiness wait")
  .option("--force", "kill any foreign process holding the target port")
  .action(async (target: string | undefined, flags: any) => {
    try { await runSwitch({ target, cmd: flags.cmd, port: toPort(flags.port), noWait: flags.wait === false, force: !!flags.force, nowIso: nowIso(), cwd }); }
    catch (e) { fail(e); }
  });

cli.command("status", "list worktrees and the active server").alias("ls")
  .action(async () => { try { await runStatus(cwd, Date.now()); } catch (e) { fail(e); } });

cli.command("stop", "stop the active server")
  .action(async () => { try { await runStop(cwd); } catch (e) { fail(e); } });

cli.command("restart", "restart the active server")
  .action(async () => { try { await runRestart(cwd, nowIso()); } catch (e) { fail(e); } });

cli.command("logs", "print the active server log").option("-f, --follow", "follow the log")
  .action(async (flags: any) => { try { await runLogs(cwd, !!flags.follow); } catch (e) { fail(e); } });

cli.command("open", "open the active server URL in the browser")
  .action(async () => { try { await runOpen(cwd); } catch (e) { fail(e); } });

cli.command("path [target]", "print a worktree's absolute path (for shell cd)")
  .action(async (target: string | undefined) => { try { await runPath(cwd, target); } catch (e) { fail(e); } });

cli.command("gc", "stop+clear a deleted active worktree; reap stale pids")
  .action(async () => { try { await runGc(cwd); } catch (e) { fail(e); } });

cli.command("doctor", "diagnose stale pids, dead ports, undetected worktrees")
  .action(async () => { try { await runDoctor(cwd); } catch (e) { fail(e); } });

cli.command("config", "print resolved config + detected runner per worktree")
  .action(async () => { try { await runConfig(cwd); } catch (e) { fail(e); } });

cli.command("watch", "watch for worktree deletion and auto-stop the active server")
  .action(async () => { try { await runWatch(cwd); } catch (e) { fail(e); } });

cli.command("dev [target]", "run a worktree's dev server in the foreground (drop-in for npm run dev)")
  .option("--cmd <str>", "override launch command")
  .option("--port <n>", "override port")
  .option("--force", "kill any foreign process holding the target port")
  .example("  perchd dev                 # run the worktree you're in")
  .example("  perchd dev feature/auth    # run another worktree")
  .example("  perchd dev main            # run the main tree")
  .example("  perchd dev -- --host       # append args to the runner (npm: -- -- --host)")
  .action(async (target: string | undefined, flags: any) => {
    try {
      const session = await startDev({
        target, cmd: flags.cmd, port: toPort(flags.port), force: !!flags.force,
        args: devPassthrough, nowIso: nowIso(), cwd,
      });
      // All three teardown paths funnel through the child's 'exit':
      //  - local Ctrl-C: handler stops the group → child exits
      //  - external stop/switch/watch: stops the group → child exits
      //  - server self-exit: child exits directly
      const onSignal = () => { void stopGroup(session.active.pgid, session.stopTimeoutMs); };
      process.on("SIGINT", onSignal);
      process.on("SIGTERM", onSignal);
      const code: number = await new Promise((resolve) => {
        session.child.once("exit", (c) => resolve(c ?? 0));
      });
      finishDev(session);
      process.exit(code);
    } catch (e) { fail(e); }
  });

cli.help();

// Split argv at the first standalone `--`: everything after is verbatim
// passthrough for `perchd dev`. Parse only the front so cac doesn't choke on it.
const rawArgv = process.argv.slice(2);
const sepIdx = rawArgv.indexOf("--");
devPassthrough = sepIdx >= 0 ? rawArgv.slice(sepIdx + 1) : [];
const frontArgv = sepIdx >= 0 ? rawArgv.slice(0, sepIdx) : rawArgv;
cli.parse([process.argv[0], process.argv[1], ...frontArgv]);

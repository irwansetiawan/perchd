import { readFileSync } from "node:fs";
import { cac } from "cac";
import pc from "picocolors";
import { loadContext } from "./core/context.js";
import { readState } from "./core/state.js";
import { containingWorktree } from "./core/target.js";
import { attachViewport } from "./core/viewport.js";
import { pick } from "./ui/picker.js";
import { runSwitch } from "./commands/switch.js";
import { runAttach } from "./commands/attach.js";
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

// Read our own version from package.json. `../package.json` resolves the same
// from the entry whether it runs as src/cli.ts (tsx) or the bundled dist/cli.js
// (published tarball ships package.json at the root, one level above dist/).
const version: string = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

const cli = cac("perchd");
const cwd = process.cwd();
let passthrough: string[] = [];
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

/**
 * Bare `perchd`: show the worktree menu, with the one you're standing in
 * pre-selected. Enter re-runs where you stand (the `npm run dev` drop-in);
 * arrowing to another worktree is the switch — perchd's whole point is not
 * having to `cd` between them. The cwd worktree, else the active one, is the
 * default landing.
 */
async function bareTarget(): Promise<string | null> {
  const ctx = await loadContext(cwd);
  const active = readState(ctx.commonDir).active;
  const preselect = containingWorktree(ctx.worktrees, cwd)?.path ?? active?.worktreePath ?? null;
  return pick(ctx.worktrees, active?.worktreePath ?? null, preselect);
}

/**
 * Switch, then attach unless `-d`. This is the ONLY place attachment is
 * decided — runSwitch stays free of viewport concerns.
 */
async function switchThenMaybeAttach(target: string | undefined, flags: any): Promise<void> {
  const chosen = target ?? (await bareTarget());
  if (!chosen) return; // picker cancelled
  const active = await runSwitch({
    target: chosen,
    cmd: flags.cmd,
    port: toPort(flags.port),
    noWait: flags.wait === false,
    force: !!flags.force,
    args: passthrough,
    quiet: !flags.detach, // the viewport banner is about to say the same thing
    nowIso: nowIso(),
    cwd,
  });
  if (!active || flags.detach) return;
  const ctx = await loadContext(cwd);
  // We started the server → Ctrl-C stops it, like `npm run dev`.
  process.exit(await attachViewport(active, ctx.commonDir, {
    fromStart: true,
    stopOnInterrupt: true,
    stopTimeoutMs: ctx.config.stop_timeout * 1000,
  }));
}

type Cmd = ReturnType<typeof cli.command>;
const switchOptions = (cmd: Cmd): Cmd =>
  cmd
    .option("-d, --detach", "start in the background; don't attach")
    .option("--cmd <str>", "override launch command")
    .option("--port <n>", "override port")
    .option("--no-wait", "skip readiness wait")
    .option("--force", "kill any foreign process holding the target port");

switchOptions(cli.command("[target]", "run a worktree's dev server, attached (drop-in for npm run dev)"))
  .example("  perchd                     # this worktree, attached — ^C detaches")
  .example("  perchd feature/auth        # move the perch, attached")
  .example("  perchd feature/auth -d     # move the perch, stay in the background")
  .example("  perchd -- --host           # append args to the runner (npm: -- -- --host)")
  .action(async (target: string | undefined, flags: any) => {
    try { await switchThenMaybeAttach(target, flags); } catch (e) { fail(e); }
  });

switchOptions(cli.command("switch [target]", "switch the active dev server (alias for `perchd [target]`)"))
  .action(async (target: string | undefined, flags: any) => {
    try { await switchThenMaybeAttach(target, flags); } catch (e) { fail(e); }
  });

switchOptions(cli.command("dev [target]", "deprecated: use `perchd [target]`"))
  .action(async (target: string | undefined, flags: any) => {
    console.warn(pc.yellow("`perchd dev` is deprecated — use `perchd` (identical behavior). It will be removed in a future major."));
    try { await switchThenMaybeAttach(target, flags); } catch (e) { fail(e); }
  });

cli.command("attach [target]", "attach to the active server (^C detaches, server keeps running)")
  .action(async (target: string | undefined) => {
    try { process.exit(await runAttach(cwd, target)); } catch (e) { fail(e); }
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

cli.version(version); // adds `-v, --version`
cli.help();

// Split argv at the first standalone `--`: everything after is verbatim
// passthrough for the runner. Parse only the front so cac doesn't choke on it.
const rawArgv = process.argv.slice(2);
const sepIdx = rawArgv.indexOf("--");
passthrough = sepIdx >= 0 ? rawArgv.slice(sepIdx + 1) : [];
const frontArgv = sepIdx >= 0 ? rawArgv.slice(0, sepIdx) : rawArgv;
cli.parse([process.argv[0], process.argv[1], ...frontArgv]);

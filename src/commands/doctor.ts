import pc from "picocolors";
import { loadContext } from "../core/context.js";
import { detectRunner } from "../detect/index.js";
import { resolveRunner } from "../core/resolve.js";
import { readState, isPidAlive } from "../core/state.js";
import { tcpListening } from "../core/process.js";

export interface DoctorSnapshot {
  active: { branch: string | null; port: number; pidAlive: boolean; portListening: boolean } | null;
  undetected: string[];                         // worktree display names
  foreignPorts: Array<{ branch: string; port: number }>; // non-active worktree whose port is held
}

/** Pure: turn a snapshot into issue lines. Empty array == healthy. */
export function diagnose(snap: DoctorSnapshot): string[] {
  const issues: string[] = [];
  if (snap.active && !snap.active.pidAlive) {
    issues.push(`active server ${snap.active.branch} has a stale/dead pid — run 'perchd gc'`);
  }
  if (snap.active && snap.active.pidAlive && !snap.active.portListening) {
    issues.push(`active server ${snap.active.branch} is not responding on port ${snap.active.port}`);
  }
  for (const u of snap.undetected) {
    issues.push(`worktree ${u} is undetected — add a [worktrees."${u}"] block to .perchd.toml`);
  }
  for (const f of snap.foreignPorts) {
    issues.push(`port ${f.port} (for ${f.branch}) is held by a foreign process`);
  }
  return issues;
}

export async function runDoctor(cwd: string): Promise<void> {
  const ctx = await loadContext(cwd);
  const { commonDir, config, worktrees } = ctx;
  const state = readState(commonDir);

  const activePath = state.active?.worktreePath ?? null;
  const undetected: string[] = [];
  const foreignPorts: Array<{ branch: string; port: number }> = [];

  for (const wt of worktrees) {
    if (wt.bare) continue;
    const detected = detectRunner(wt.path);
    const runner = resolveRunner({ worktreeRoot: wt.path, branch: wt.branch, cfg: config, detected });
    const name = wt.branch ?? wt.path;
    if (!runner) { undetected.push(name); continue; }
    // A non-active worktree whose conventional port is already in use → foreign holder.
    if (wt.path !== activePath && (await tcpListening(runner.port))) {
      foreignPorts.push({ branch: name, port: runner.port });
    }
  }

  const active = state.active
    ? {
        branch: state.active.branch,
        port: state.active.port,
        pidAlive: isPidAlive(state.active.pid),
        portListening: await tcpListening(state.active.port),
      }
    : null;

  const issues = diagnose({ active, undetected, foreignPorts });
  if (issues.length === 0) {
    console.log(pc.green("✓ no issues found"));
  } else {
    for (const i of issues) console.log(pc.yellow(`• ${i}`));
  }
}

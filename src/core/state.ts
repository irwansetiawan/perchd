import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface ActiveServer {
  branch: string | null;
  worktreePath: string;
  type: string;
  command: string;
  cwd: string;
  pid: number;
  pgid: number;
  port: number;
  url: string;
  logPath: string;
  startedAt: string;
}

export interface State {
  version: 1;
  active: ActiveServer | null;
}

function stateDir(commonDir: string): string {
  return join(commonDir, "perchd");
}
export function statePath(commonDir: string): string {
  return join(stateDir(commonDir), "state.json");
}
export function logPathFor(commonDir: string, slug: string): string {
  return join(stateDir(commonDir), "logs", `${slug}.log`);
}

export function readState(commonDir: string): State {
  const p = statePath(commonDir);
  if (!existsSync(p)) return { version: 1, active: null };
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8"));
    const active = parsed.active ?? null;
    // 0.3.x wrote `foreground: true` for `perchd dev`. Servers are always
    // background now; "attached" belongs to the viewport, not the server.
    if (active && "foreground" in active) delete active.foreground;
    return { version: 1, active };
  } catch {
    return { version: 1, active: null };
  }
}

export function writeState(commonDir: string, active: ActiveServer | null): void {
  const p = statePath(commonDir);
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ version: 1, active }, null, 2));
  renameSync(tmp, p); // atomic on same filesystem
}

export function clearActive(commonDir: string): void {
  writeState(commonDir, null);
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e?.code === "EPERM"; // exists but not ours
  }
}

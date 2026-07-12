import { execaSync } from "execa";
import * as p from "@clack/prompts";
import type { Worktree } from "../core/git.js";

export interface Choice { value: string; label: string; }

export function pickerChoices(
  worktrees: Worktree[],
  activePath: string | null,
  preselectPath: string | null = null,
): Choice[] {
  const choices = worktrees
    .filter((w) => !w.bare)
    .map((w) => {
      const name = w.branch ?? `(${w.head.slice(0, 7)})`;
      const active = w.path === activePath ? "  ACTIVE" : "";
      const locked = w.locked ? " [locked]" : "";
      return { value: w.path, label: `${name}${locked}${active}` };
    });

  // Float the pre-selected worktree (usually cwd's) to the front so the cursor
  // lands on it: `perchd` then Enter re-runs where you stand (drop-in), while
  // arrowing to another worktree is the switch. Works for both backends — fzf's
  // default cursor is the first line; clack also gets an explicit initialValue.
  if (preselectPath) {
    const i = choices.findIndex((c) => c.value === preselectPath);
    if (i > 0) choices.unshift(choices.splice(i, 1)[0]);
  }
  return choices;
}

function hasFzf(): boolean {
  try { execaSync("fzf", ["--version"]); return true; } catch { return false; }
}

export async function pick(
  worktrees: Worktree[],
  activePath: string | null,
  preselectPath: string | null = null,
): Promise<string | null> {
  const choices = pickerChoices(worktrees, activePath, preselectPath);
  if (choices.length === 0) return null;

  if (hasFzf()) {
    const input = choices.map((c) => `${c.label}\t${c.value}`).join("\n");
    const res = execaSync("fzf", ["--with-nth=1", "--delimiter=\t"], { input, reject: false });
    if (res.exitCode !== 0 || !res.stdout) return null;
    return res.stdout.split("\t").pop()!.trim();
  }

  // clack needs an interactive terminal. Without one (piped, CI, a hook), fail
  // with a clear message instead of a raw `uv_tty_init` crash — name a target.
  if (!process.stdin.isTTY) {
    throw new Error("no interactive terminal for the worktree picker — name a target, e.g. `perchd main`");
  }

  const sel = await p.select({
    message: "Pick a worktree to run",
    options: choices.map((c) => ({ value: c.value, label: c.label })),
    initialValue: preselectPath ?? undefined,
  });
  return p.isCancel(sel) ? null : (sel as string);
}

import { execaSync } from "execa";
import * as p from "@clack/prompts";
import type { Worktree } from "../core/git.js";

export interface Choice { value: string; label: string; }

export function pickerChoices(worktrees: Worktree[], activePath: string | null): Choice[] {
  return worktrees
    .filter((w) => !w.bare)
    .map((w) => {
      const name = w.branch ?? `(${w.head.slice(0, 7)})`;
      const active = w.path === activePath ? "  ACTIVE" : "";
      const locked = w.locked ? " [locked]" : "";
      return { value: w.path, label: `${name}${locked}${active}` };
    });
}

function hasFzf(): boolean {
  try { execaSync("fzf", ["--version"]); return true; } catch { return false; }
}

export async function pick(worktrees: Worktree[], activePath: string | null): Promise<string | null> {
  const choices = pickerChoices(worktrees, activePath);
  if (choices.length === 0) return null;

  if (hasFzf()) {
    const input = choices.map((c) => `${c.label}\t${c.value}`).join("\n");
    const res = execaSync("fzf", ["--with-nth=1", "--delimiter=\t"], { input, reject: false });
    if (res.exitCode !== 0 || !res.stdout) return null;
    return res.stdout.split("\t").pop()!.trim();
  }

  const sel = await p.select({
    message: "Switch to worktree",
    options: choices.map((c) => ({ value: c.value, label: c.label })),
  });
  return p.isCancel(sel) ? null : (sel as string);
}

import { execa } from "execa";

export interface Worktree {
  path: string;
  branch: string | null; // short ref e.g. "feature/auth"
  head: string;
  detached: boolean;
  locked: boolean;
  bare: boolean;
}

export function parseWorktreeList(porcelain: string): Worktree[] {
  const out: Worktree[] = [];
  let cur: Partial<Worktree> | null = null;
  const flush = () => {
    if (cur?.path) {
      out.push({
        path: cur.path,
        branch: cur.branch ?? null,
        head: cur.head ?? "",
        detached: cur.detached ?? false,
        locked: cur.locked ?? false,
        bare: cur.bare ?? false,
      });
    }
    cur = null;
  };
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) {
      flush();
      cur = { path: line.slice("worktree ".length).trim() };
    } else if (!cur) {
      continue;
    } else if (line.startsWith("HEAD ")) {
      cur.head = line.slice(5).trim();
    } else if (line.startsWith("branch ")) {
      cur.branch = line.slice(7).trim().replace(/^refs\/heads\//, "");
    } else if (line === "detached") {
      cur.detached = true;
    } else if (line === "locked" || line.startsWith("locked ")) {
      cur.locked = true;
    } else if (line === "bare") {
      cur.bare = true;
    }
  }
  flush();
  return out;
}

export function branchSlug(branch: string | null, head = ""): string {
  if (branch) {
    return branch.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  return head.slice(0, 7);
}

export async function listWorktrees(cwd: string): Promise<Worktree[]> {
  const { stdout } = await execa("git", ["worktree", "list", "--porcelain"], { cwd });
  return parseWorktreeList(stdout);
}

export async function gitCommonDir(cwd: string): Promise<string> {
  const { stdout } = await execa(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd },
  );
  return stdout.trim();
}

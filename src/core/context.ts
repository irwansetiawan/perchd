import { gitCommonDir, listWorktrees, type Worktree } from "./git.js";
import { loadConfig, type Config } from "./config.js";

export interface RepoContext {
  commonDir: string;
  repoRoot: string; // main worktree root, where .perchd.toml lives
  worktrees: Worktree[];
  config: Config;
}

export async function loadContext(cwd: string): Promise<RepoContext> {
  const commonDir = await gitCommonDir(cwd);
  const worktrees = await listWorktrees(cwd);
  // .perchd.toml is read from the main worktree root: the first non-bare entry
  // of the porcelain list (git lists the primary worktree first).
  const root = (worktrees.find((w) => !w.bare) ?? worktrees[0])?.path ?? cwd;
  return { commonDir, repoRoot: root, worktrees, config: loadConfig(root) };
}

import { describe, it, expect, vi } from "vitest";
import { reconcile } from "../src/core/reconcile.js";
import type { ActiveServer } from "../src/core/state.js";

const active: ActiveServer = {
  branch: "gone", worktreePath: "/repo/.worktrees/gone", type: "nextjs",
  command: "pnpm run dev", cwd: "/repo/.worktrees/gone", pid: 1, pgid: 1,
  port: 3000, url: "http://localhost:3000", logPath: "/x.log", startedAt: "t",
};

describe("reconcile", () => {
  it("stops + clears when active worktree no longer exists", async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    const clear = vi.fn();
    const changed = await reconcile({
      active,
      worktreePaths: ["/repo/main"], // "gone" not present
      stopActive: stop,
      clear,
    });
    expect(changed).toBe(true);
    expect(stop).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
  });

  it("does nothing when active worktree still exists", async () => {
    const stop = vi.fn();
    const clear = vi.fn();
    const changed = await reconcile({
      active,
      worktreePaths: ["/repo/main", "/repo/.worktrees/gone"],
      stopActive: stop,
      clear,
    });
    expect(changed).toBe(false);
    expect(stop).not.toHaveBeenCalled();
  });

  it("no-op when nothing active", async () => {
    const changed = await reconcile({ active: null, worktreePaths: [], stopActive: vi.fn(), clear: vi.fn() });
    expect(changed).toBe(false);
  });
});

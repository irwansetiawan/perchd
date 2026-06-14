import { describe, it, expect } from "vitest";
import { needsReap } from "../src/core/reap.js";
import type { ActiveServer } from "../src/core/state.js";

const active: ActiveServer = {
  branch: "main", worktreePath: "/wt", type: "nextjs", command: "x", cwd: "/wt",
  pid: 4242, pgid: 4242, port: 3000, url: "http://localhost:3000", logPath: "/l", startedAt: "t",
};

describe("needsReap", () => {
  it("true when active exists but its pid is dead", () => {
    expect(needsReap(active, false)).toBe(true);
  });
  it("false when active pid is alive", () => {
    expect(needsReap(active, true)).toBe(false);
  });
  it("false when nothing active", () => {
    expect(needsReap(null, false)).toBe(false);
  });
});

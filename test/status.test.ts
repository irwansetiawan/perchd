import { describe, it, expect } from "vitest";
import { formatStatusRow } from "../src/commands/status.js";

describe("formatStatusRow", () => {
  it("marks the active worktree and shows runtime fields", () => {
    const row = formatStatusRow(
      { path: "/wt", branch: "feature/auth", head: "abc1234", detached: false, locked: false, bare: false },
      { type: "nextjs", port: 3000 },
      true,
      { pid: 123, uptime: "2m" },
    );
    expect(row).toContain("feature/auth");
    expect(row).toContain("nextjs");
    expect(row).toContain("3000");
    expect(row).toContain("●"); // active marker
  });

  it("shows undetected when no runner", () => {
    const row = formatStatusRow(
      { path: "/wt", branch: "x", head: "h", detached: false, locked: false, bare: false },
      null, false, null,
    );
    expect(row).toContain("undetected");
  });
});

import { describe, it, expect } from "vitest";
import { diagnose } from "../src/commands/doctor.js";

describe("diagnose", () => {
  it("reports a healthy system with no issues", () => {
    const issues = diagnose({
      active: { branch: "main", port: 3000, pidAlive: true, portListening: true },
      undetected: [],
      foreignPorts: [],
    });
    expect(issues).toEqual([]);
  });

  it("reports a dead active pid", () => {
    const issues = diagnose({
      active: { branch: "main", port: 3000, pidAlive: false, portListening: false },
      undetected: [],
      foreignPorts: [],
    });
    expect(issues.join("\n")).toMatch(/stale|dead|gc/i);
  });

  it("reports an active that is not listening on its port", () => {
    const issues = diagnose({
      active: { branch: "main", port: 3000, pidAlive: true, portListening: false },
      undetected: [],
      foreignPorts: [],
    });
    expect(issues.join("\n")).toMatch(/not responding|not listening/i);
  });

  it("reports undetected worktrees and foreign-held ports", () => {
    const issues = diagnose({
      active: null,
      undetected: ["weird-wt"],
      foreignPorts: [{ branch: "feature/x", port: 5173 }],
    });
    expect(issues.join("\n")).toMatch(/weird-wt/);
    expect(issues.join("\n")).toMatch(/5173/);
  });
});

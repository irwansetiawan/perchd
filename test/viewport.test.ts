import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { runViewport, type ViewportDeps } from "../src/core/viewport.js";
import type { ActiveServer } from "../src/core/state.js";

const active: ActiveServer = {
  branch: "feature/auth", worktreePath: "/w", type: "vite", command: "vite", cwd: "/w",
  pid: 4242, pgid: 4242, port: 3000, url: "http://localhost:3000",
  logPath: "/tmp/x.log", startedAt: "2026-01-01T00:00:00Z",
};

function fakeTail(): any {
  const e = new EventEmitter() as any;
  e.kill = vi.fn();
  e.killed = false;
  return e;
}

const deps = (over: Partial<ViewportDeps>): ViewportDeps => ({
  readActive: () => active,
  isAlive: () => true,
  startTail: fakeTail,
  pollMs: 5,
  graceMs: 0,
  onSigint: () => () => {},
  ...over,
});

describe("runViewport", () => {
  it("SIGINT reports interrupted (runViewport never signals the server itself)", async () => {
    const exit = await runViewport(active, deps({
      onSigint: (h) => { setTimeout(h, 10); return () => {}; },
    }));
    expect(exit).toEqual({ reason: "interrupted", signal: "SIGINT" });
  });

  it("SIGHUP reports interrupted with the SIGHUP signal", async () => {
    const exit = await runViewport(active, deps({
      onSighup: (h) => { setTimeout(h, 10); return () => {}; },
    }));
    expect(exit).toEqual({ reason: "interrupted", signal: "SIGHUP" });
  });

  it("a dead tail process ends the viewport as a plain detach (no signal)", async () => {
    const tail = fakeTail();
    const exit = await runViewport(active, deps({
      startTail: () => { setTimeout(() => tail.emit("exit", 0), 10); return tail; },
      onSigint: () => () => {},
    }));
    expect(exit).toEqual({ reason: "detached" });
  });

  it("reports perch-moved when another pid owns the record", async () => {
    const moved = { ...active, pid: 9999, branch: "fix/payments" };
    const exit = await runViewport(active, deps({ readActive: () => moved }));
    expect(exit).toEqual({ reason: "perch-moved", to: "fix/payments" });
  });

  it("reports stopped when the record is gone", async () => {
    const exit = await runViewport(active, deps({ readActive: () => null }));
    expect(exit).toEqual({ reason: "stopped" });
  });

  it("reports server-exited when the pid dies", async () => {
    const exit = await runViewport(active, deps({ isAlive: () => false }));
    expect(exit).toEqual({ reason: "server-exited" });
  });

  it("kills the tail process when the viewport ends", async () => {
    const tail = fakeTail();
    await runViewport(active, deps({ startTail: () => tail, readActive: () => null }));
    expect(tail.kill).toHaveBeenCalledWith("SIGTERM");
  });

  // Regression: a real switch tears the old server down and clears the record
  // BEFORE writing the new one. Without a grace window the viewport concludes
  // "server-exited"/"stopped" during that gap and never sees the new perch.
  it("rides out the switch gap (dead pid, then no record) and reports perch-moved", async () => {
    const moved = { ...active, pid: 9999, branch: "fix/payments" };
    const sequence: (ActiveServer | null)[] = [
      active,   // 0: still ours, alive
      active,   // 1: ours, but now dead  (stopGroup ran)
      null,     // 2: record cleared      (clearActive ran)
      null,     // 3: still starting...
      moved,    // 4: new record lands    (writeState ran)
    ];
    let poll = -1;
    let clock = 0;

    const exit = await runViewport(active, deps({
      readActive: () => { poll++; return sequence[Math.min(poll, sequence.length - 1)]; },
      isAlive: () => poll === 0,   // our pid is dead from the 2nd poll onward
      now: () => (clock += 100),   // 100ms per poll: never reaches graceMs
      graceMs: 2500,
      pollMs: 1,
    }));

    expect(exit).toEqual({ reason: "perch-moved", to: "fix/payments" });
    expect(poll).toBeGreaterThanOrEqual(4); // it really did ride out the gap
  });

  it("still reports stopped once the grace window expires with no new perch", async () => {
    let clock = 0;
    const exit = await runViewport(active, deps({
      readActive: () => null,
      now: () => (clock += 1000), // blows past graceMs
      graceMs: 2500,
      pollMs: 1,
    }));
    expect(exit).toEqual({ reason: "stopped" });
  });
});

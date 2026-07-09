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
  onSigint: () => () => {},
  ...over,
});

describe("runViewport", () => {
  it("SIGINT detaches (the server is never signalled)", async () => {
    const exit = await runViewport(active, deps({
      onSigint: (h) => { setTimeout(h, 10); return () => {}; },
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
});

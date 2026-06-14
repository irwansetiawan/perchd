import { describe, it, expect } from "vitest";
import { resolveRunner } from "../src/core/resolve.js";
import type { Config } from "../src/core/config.js";
import type { Runner } from "../src/detect/types.js";

const emptyCfg: Config = { ready_timeout: 30, stop_timeout: 8, worktrees: {} };
const detected: Runner = { type: "nextjs", command: "pnpm run dev", cwd: "/wt", port: 3000, url: "http://localhost:3000" };

describe("resolveRunner precedence", () => {
  it("uses detected runner when no overrides", () => {
    const r = resolveRunner({ worktreeRoot: "/wt", branch: "main", cfg: emptyCfg, detected });
    expect(r).toMatchObject({ command: "pnpm run dev", port: 3000 });
  });

  it("repo [runner] overrides detection", () => {
    const cfg: Config = { ...emptyCfg, runner: { command: "make dev", port: 4000 } };
    const r = resolveRunner({ worktreeRoot: "/wt", branch: "main", cfg, detected });
    expect(r).toMatchObject({ command: "make dev", port: 4000, type: "custom" });
  });

  it("per-branch config beats repo runner", () => {
    const cfg: Config = { ...emptyCfg, runner: { command: "make dev", port: 4000 }, worktrees: { "feature/auth": { command: "pnpm dev", cwd: "apps/web", port: 4001, env: { DEBUG: "1" } } } };
    const r = resolveRunner({ worktreeRoot: "/wt", branch: "feature/auth", cfg, detected });
    expect(r).toMatchObject({ command: "pnpm dev", port: 4001, cwd: "/wt/apps/web", env: { DEBUG: "1" } });
  });

  it("CLI flags win over everything", () => {
    const r = resolveRunner({ worktreeRoot: "/wt", branch: "main", cfg: emptyCfg, detected, cli: { command: "yarn dev", port: 9000 } });
    expect(r).toMatchObject({ command: "yarn dev", port: 9000 });
  });

  it("builds a runner from --cmd alone when nothing is detected", () => {
    const r = resolveRunner({ worktreeRoot: "/wt", branch: "x", cfg: emptyCfg, detected: null, cli: { command: "./run.sh", port: 7000 } });
    expect(r).toMatchObject({ command: "./run.sh", port: 7000, type: "custom", cwd: "/wt" });
  });

  it("returns null when nothing detected and no config or cli command", () => {
    expect(resolveRunner({ worktreeRoot: "/wt", branch: "x", cfg: emptyCfg, detected: null })).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { formatConfigReport } from "../src/commands/config.js";

describe("formatConfigReport", () => {
  it("shows timeouts and per-worktree runner/port", () => {
    const text = formatConfigReport(
      { ready_timeout: 30, stop_timeout: 8 },
      [
        { name: "main", command: "pnpm run dev", port: 3000, type: "nextjs" },
        { name: "weird", command: null, port: null, type: null },
      ],
    );
    expect(text).toMatch(/ready_timeout\s*=\s*30/);
    expect(text).toMatch(/stop_timeout\s*=\s*8/);
    expect(text).toMatch(/main/);
    expect(text).toMatch(/pnpm run dev/);
    expect(text).toMatch(/3000/);
    expect(text).toMatch(/weird/);
    expect(text).toMatch(/undetected/);
  });
});

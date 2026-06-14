import { describe, it, expect } from "vitest";
import { detectRunner } from "../src/detect/index.js";
import type { Detector } from "../src/detect/types.js";

describe("detectRunner", () => {
  it("returns first matching detector's runner", () => {
    const a: Detector = { name: "a", detect: () => null };
    const b: Detector = { name: "b", detect: (dir) => ({ type: "x", command: "run", cwd: dir, port: 1234, url: "http://localhost:1234" }) };
    const c: Detector = { name: "c", detect: () => ({ type: "y", command: "no", cwd: "/", port: 9, url: "" }) };
    const r = detectRunner("/app", [a, b, c]);
    expect(r).toMatchObject({ type: "x", port: 1234 });
  });

  it("returns null when nothing matches", () => {
    expect(detectRunner("/app", [{ name: "a", detect: () => null }])).toBeNull();
  });
});

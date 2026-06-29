import { describe, it, expect } from "vitest";
import { appendPassthrough } from "../src/core/passthrough.js";

describe("appendPassthrough", () => {
  it("returns the command unchanged when there are no args", () => {
    expect(appendPassthrough("pnpm dev", [])).toBe("pnpm dev");
  });

  it("appends simple args quoted", () => {
    expect(appendPassthrough("pnpm dev", ["--host"])).toBe("pnpm dev '--host'");
  });

  it("appends multiple args", () => {
    expect(appendPassthrough("pnpm dev", ["--host", "0.0.0.0"])).toBe("pnpm dev '--host' '0.0.0.0'");
  });

  it("preserves npm's own separator verbatim", () => {
    expect(appendPassthrough("npm run dev", ["--", "--host"])).toBe("npm run dev '--' '--host'");
  });

  it("escapes embedded single quotes safely", () => {
    expect(appendPassthrough("x", ["a'b"])).toBe(`x 'a'\\''b'`);
  });
});

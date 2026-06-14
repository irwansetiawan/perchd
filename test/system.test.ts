import { describe, it, expect } from "vitest";
import { openerCommand } from "../src/core/system.js";

describe("openerCommand", () => {
  it("uses 'open' on macOS", () => {
    expect(openerCommand("darwin")).toBe("open");
  });
  it("uses 'xdg-open' on linux", () => {
    expect(openerCommand("linux")).toBe("xdg-open");
  });
});

import { describe, it, expect } from "vitest";
import { colorEnv } from "../src/core/env.js";

describe("colorEnv", () => {
  it("forces colour when nothing is set", () => {
    expect(colorEnv({})).toEqual({ FORCE_COLOR: "1", CLICOLOR_FORCE: "1" });
  });

  it("respects NO_COLOR", () => {
    expect(colorEnv({ NO_COLOR: "1" })).toEqual({});
  });

  it("never overrides an explicit FORCE_COLOR", () => {
    expect(colorEnv({ FORCE_COLOR: "0" })).toEqual({});
  });
});

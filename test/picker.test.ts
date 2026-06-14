import { describe, it, expect } from "vitest";
import { pickerChoices } from "../src/ui/picker.js";

describe("pickerChoices", () => {
  it("builds labeled choices, marking the active one", () => {
    const choices = pickerChoices(
      [
        { path: "/wt/main", branch: "main", head: "a", detached: false, locked: false, bare: false },
        { path: "/wt/auth", branch: "feature/auth", head: "b", detached: false, locked: false, bare: false },
      ],
      "/wt/auth",
    );
    expect(choices).toHaveLength(2);
    expect(choices[1].label).toContain("feature/auth");
    expect(choices[1].label).toContain("ACTIVE");
    expect(choices[1].value).toBe("/wt/auth");
  });
});

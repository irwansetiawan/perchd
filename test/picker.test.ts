import { describe, it, expect } from "vitest";
import { pickerChoices } from "../src/ui/picker.js";

describe("pickerChoices", () => {
  const wts = [
    { path: "/wt/main", branch: "main", head: "a", detached: false, locked: false, bare: false },
    { path: "/wt/auth", branch: "feature/auth", head: "b", detached: false, locked: false, bare: false },
    { path: "/wt/pay", branch: "fix/payments", head: "c", detached: false, locked: false, bare: false },
  ];

  it("builds labeled choices, marking the active one", () => {
    const choices = pickerChoices(wts.slice(0, 2), "/wt/auth");
    expect(choices).toHaveLength(2);
    expect(choices[1].label).toContain("feature/auth");
    expect(choices[1].label).toContain("ACTIVE");
    expect(choices[1].value).toBe("/wt/auth");
  });

  it("moves the pre-selected worktree to the front (cursor lands there)", () => {
    const choices = pickerChoices(wts, "/wt/auth", "/wt/pay");
    expect(choices[0].value).toBe("/wt/pay");        // cwd worktree first
    expect(choices.map((c) => c.value)).toEqual(["/wt/pay", "/wt/main", "/wt/auth"]);
  });

  it("keeps the ACTIVE marker on the active worktree even when a different one is pre-selected", () => {
    const choices = pickerChoices(wts, "/wt/auth", "/wt/pay");
    const active = choices.find((c) => c.value === "/wt/auth");
    expect(active!.label).toContain("ACTIVE");
    expect(choices[0].label).not.toContain("ACTIVE"); // pre-selected != active
  });

  it("is a no-op ordering when the pre-select is already first or absent", () => {
    expect(pickerChoices(wts, null).map((c) => c.value)).toEqual(["/wt/main", "/wt/auth", "/wt/pay"]);
    expect(pickerChoices(wts, null, "/wt/main").map((c) => c.value)).toEqual(["/wt/main", "/wt/auth", "/wt/pay"]);
    expect(pickerChoices(wts, null, "/nope").map((c) => c.value)).toEqual(["/wt/main", "/wt/auth", "/wt/pay"]);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const readState = vi.fn<(...a: any[]) => any>();
const attachViewport = vi.fn<(...a: any[]) => Promise<number>>(async () => 0);
const runSwitch = vi.fn<(...a: any[]) => Promise<any>>();
const existsSync = vi.fn<(...a: any[]) => boolean>(() => true);

vi.mock("node:fs", () => ({ existsSync: (...a: any[]) => existsSync(...a) }));
vi.mock("../src/core/context.js", () => ({
  loadContext: vi.fn(async () => ({ commonDir: "/common", config: { stop_timeout: 8 } })),
}));
vi.mock("../src/core/state.js", () => ({ readState: (...a: any[]) => readState(...a) }));
vi.mock("../src/core/viewport.js", () => ({ attachViewport: (...a: any[]) => attachViewport(...a) }));
vi.mock("../src/commands/switch.js", () => ({ runSwitch: (...a: any[]) => runSwitch(...a) }));

const { runAttach } = await import("../src/commands/attach.js");

beforeEach(() => {
  readState.mockReset();
  attachViewport.mockClear();
  runSwitch.mockReset();
  existsSync.mockReset();
  existsSync.mockReturnValue(true);
});

describe("runAttach", () => {
  it("returns 0 and does not attach when nothing is active", async () => {
    readState.mockReturnValue({ active: null });
    expect(await runAttach("/w")).toBe(0);
    expect(attachViewport).not.toHaveBeenCalled();
  });

  it("refuses to attach to a legacy record that has no log file", async () => {
    readState.mockReturnValue({ active: { logPath: "", branch: "x" } });
    expect(await runAttach("/w")).toBe(1);
    expect(attachViewport).not.toHaveBeenCalled();
  });

  it("refuses to attach when the log file has vanished", async () => {
    readState.mockReturnValue({ active: { logPath: "/gone.log", branch: "x" } });
    existsSync.mockReturnValue(false);
    expect(await runAttach("/w")).toBe(1);
    expect(attachViewport).not.toHaveBeenCalled();
  });

  it("attaches to the active server showing recent history, not the whole log", async () => {
    readState.mockReturnValue({ active: { logPath: "/l.log", branch: "x" } });
    expect(await runAttach("/w")).toBe(0);
    expect(attachViewport).toHaveBeenCalledWith(
      expect.objectContaining({ logPath: "/l.log" }),
      "/common",
      { fromStart: false },
    );
  });

  it("with a target, switches first then attaches from the top of the log", async () => {
    runSwitch.mockResolvedValue({ logPath: "/l.log", branch: "feature/auth" });
    expect(await runAttach("/w", "feature/auth")).toBe(0);
    expect(runSwitch).toHaveBeenCalledWith(expect.objectContaining({ target: "feature/auth" }));
    expect(attachViewport).toHaveBeenCalledWith(
      expect.objectContaining({ branch: "feature/auth" }),
      "/common",
      { fromStart: true },
    );
  });

  it("returns 1 when switching to a target fails", async () => {
    runSwitch.mockResolvedValue(null);
    expect(await runAttach("/w", "nope")).toBe(1);
    expect(attachViewport).not.toHaveBeenCalled();
  });
});

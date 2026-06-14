import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { conventionDetector } from "../src/detect/convention.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "perchd-conv-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("conventionDetector", () => {
  it("mprocs.yaml → mprocs", () => {
    writeFileSync(join(dir, "mprocs.yaml"), "procs: {}");
    expect(conventionDetector.detect(dir)).toMatchObject({ type: "mprocs", command: "mprocs" });
  });
  it("process-compose.yaml → process-compose up", () => {
    writeFileSync(join(dir, "process-compose.yaml"), "");
    expect(conventionDetector.detect(dir)).toMatchObject({ type: "process-compose", command: "process-compose up" });
  });
  it("Makefile with dev target → make dev", () => {
    writeFileSync(join(dir, "Makefile"), "dev:\n\tnpm run dev\n");
    expect(conventionDetector.detect(dir)).toMatchObject({ type: "make", command: "make dev" });
  });
  it("Makefile without dev target → null", () => {
    writeFileSync(join(dir, "Makefile"), "build:\n\techo hi\n");
    expect(conventionDetector.detect(dir)).toBeNull();
  });
  it("justfile with dev recipe → just dev", () => {
    writeFileSync(join(dir, "justfile"), "dev:\n  npm run dev\n");
    expect(conventionDetector.detect(dir)).toMatchObject({ type: "just", command: "just dev" });
  });
  it("Procfile → a procfile runner", () => {
    writeFileSync(join(dir, "Procfile"), "web: node server.js");
    expect(conventionDetector.detect(dir)?.type).toBe("procfile");
  });
});

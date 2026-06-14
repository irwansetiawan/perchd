import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pythonDetector } from "../src/detect/python.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "perchd-py-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("pythonDetector", () => {
  it("detects Django via manage.py on 8000", () => {
    writeFileSync(join(dir, "manage.py"), "# django");
    expect(pythonDetector.detect(dir)).toMatchObject({
      type: "django", port: 8000, command: "python manage.py runserver",
    });
  });

  it("uses venv binary when .venv present", () => {
    writeFileSync(join(dir, "manage.py"), "# django");
    mkdirSync(join(dir, ".venv", "bin"), { recursive: true });
    writeFileSync(join(dir, ".venv", "bin", "python"), "");
    expect(pythonDetector.detect(dir)?.command).toBe(".venv/bin/python manage.py runserver");
  });

  it("detects FastAPI app and flags the guess", () => {
    writeFileSync(join(dir, "main.py"), "from fastapi import FastAPI\napp = FastAPI()\n");
    const r = pythonDetector.detect(dir);
    expect(r).toMatchObject({ type: "fastapi", port: 8000, command: "uvicorn main:app --reload", guessed: true });
  });

  it("returns null for a plain dir", () => {
    expect(pythonDetector.detect(dir)).toBeNull();
  });

  it("uses uv run when uv.lock present", () => {
    writeFileSync(join(dir, "manage.py"), "# django");
    writeFileSync(join(dir, "uv.lock"), "");
    expect(pythonDetector.detect(dir)?.command).toBe("uv run python manage.py runserver");
  });

  it("uses poetry run when poetry.lock present", () => {
    writeFileSync(join(dir, "manage.py"), "# django");
    writeFileSync(join(dir, "poetry.lock"), "");
    expect(pythonDetector.detect(dir)?.command).toBe("poetry run python manage.py runserver");
  });

  it("detects Flask on 5000", () => {
    writeFileSync(join(dir, "app.py"), "from flask import Flask\napp = Flask(__name__)\n");
    expect(pythonDetector.detect(dir)).toMatchObject({ type: "flask", port: 5000, command: "flask run" });
  });
});

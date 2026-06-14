import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Detector, Runner } from "./types.js";
import { urlFor } from "./types.js";

/** Returns the python launcher prefixes by toolchain (uv > poetry > venv > system). */
function pyPrefix(dir: string): { python: string; uvicorn: string; flask: string } {
  if (existsSync(join(dir, "uv.lock"))) {
    return { python: "uv run python", uvicorn: "uv run uvicorn", flask: "uv run flask" };
  }
  if (existsSync(join(dir, "poetry.lock"))) {
    return { python: "poetry run python", uvicorn: "poetry run uvicorn", flask: "poetry run flask" };
  }
  if (existsSync(join(dir, ".venv", "bin", "python"))) {
    return { python: ".venv/bin/python", uvicorn: ".venv/bin/uvicorn", flask: ".venv/bin/flask" };
  }
  return { python: "python", uvicorn: "uvicorn", flask: "flask" };
}

function findFastapiModule(dir: string): { module: string } | null {
  for (const f of ["main.py", "app.py"]) {
    const p = join(dir, f);
    if (existsSync(p) && /FastAPI\s*\(/.test(readFileSync(p, "utf8"))) {
      return { module: f.replace(/\.py$/, "") };
    }
  }
  return null;
}

export const pythonDetector: Detector = {
  name: "python",
  detect(dir: string): Runner | null {
    const { python, uvicorn, flask } = pyPrefix(dir);

    if (existsSync(join(dir, "manage.py"))) {
      const port = 8000;
      return { type: "django", command: `${python} manage.py runserver`, cwd: dir, port, url: urlFor(port) };
    }

    // FastAPI signal is checked before Flask; a file with both is implausible.
    const fa = findFastapiModule(dir);
    if (fa) {
      const port = 8000;
      return {
        type: "fastapi",
        command: `${uvicorn} ${fa.module}:app --reload`,
        cwd: dir, port, url: urlFor(port), guessed: true,
      };
    }

    const appPy = join(dir, "app.py");
    if (existsSync(appPy) && /Flask\s*\(/.test(readFileSync(appPy, "utf8"))) {
      const port = 5000;
      return { type: "flask", command: `${flask} run`, cwd: dir, port, url: urlFor(port) };
    }

    return null;
  },
};

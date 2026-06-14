import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execaSync } from "execa";
import type { Detector, Runner } from "./types.js";
import { urlFor } from "./types.js";

const DEFAULT_PORT = 3000;

function onPath(bin: string): boolean {
  try { execaSync(bin, ["--version"]); return true; } catch { return false; }
}

function makeHasDev(file: string): boolean {
  return /^dev:/m.test(readFileSync(file, "utf8"));
}
function justHasDev(file: string): boolean {
  return /^dev\b.*:/m.test(readFileSync(file, "utf8"));
}

export const conventionDetector: Detector = {
  name: "convention",
  detect(dir: string): Runner | null {
    const mk = (type: string, command: string, port = DEFAULT_PORT): Runner => ({
      type, command, cwd: dir, port, url: urlFor(port),
    });

    if (existsSync(join(dir, "mprocs.yaml")) || existsSync(join(dir, "mprocs.json"))) return mk("mprocs", "mprocs");
    if (existsSync(join(dir, "process-compose.yaml")) || existsSync(join(dir, "process-compose.yml")))
      return mk("process-compose", "process-compose up");
    const procfile = join(dir, "Procfile");
    if (existsSync(procfile)) {
      const cmd = onPath("overmind") ? "overmind start" : onPath("hivemind") ? "hivemind" : "foreman start";
      return mk("procfile", cmd, 5000);
    }
    const makefile = join(dir, "Makefile");
    if (existsSync(makefile) && makeHasDev(makefile)) return mk("make", "make dev");
    const justfile = join(dir, "justfile");
    if (existsSync(justfile) && justHasDev(justfile)) return mk("just", "just dev");
    return null;
  },
};

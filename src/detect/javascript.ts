import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Detector, Runner } from "./types.js";
import { urlFor } from "./types.js";

type Pkg = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: unknown;
};

function detectPm(dir: string): "pnpm" | "bun" | "yarn" | "npm" {
  if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(dir, "bun.lockb")) || existsSync(join(dir, "bun.lock"))) return "bun";
  if (existsSync(join(dir, "yarn.lock"))) return "yarn";
  return "npm";
}

// framework signal → conventional port and type. Order matters: more specific
// frameworks (which often also depend on vite) are checked before generic vite.
const FRAMEWORK_TABLE: Array<{ dep: RegExp; config?: string; type: string; port: number }> = [
  { dep: /^next$/, config: "next.config", type: "nextjs", port: 3000 },
  { dep: /^nuxt$/, config: "nuxt.config", type: "nuxt", port: 3000 },
  { dep: /^@remix-run\//, type: "remix", port: 3000 },
  { dep: /^astro$/, config: "astro.config", type: "astro", port: 4321 },
  { dep: /^@sveltejs\/kit$/, config: "svelte.config", type: "sveltekit", port: 5173 },
  { dep: /^vite$/, config: "vite.config", type: "vite", port: 5173 },
];

function hasConfig(dir: string, base: string): boolean {
  return [".js", ".ts", ".mjs", ".cjs"].some((ext) => existsSync(join(dir, base + ext)));
}

function portFromScript(cmd: string): number | null {
  const m = cmd.match(/(?:-p|--port[ =])\s*(\d{2,5})/);
  return m ? Number(m[1]) : null;
}

function portFromEnv(dir: string): number | null {
  const envPath = join(dir, ".env");
  if (!existsSync(envPath)) return null;
  const m = readFileSync(envPath, "utf8").match(/^\s*PORT\s*=\s*(\d{2,5})/m);
  return m ? Number(m[1]) : null;
}

export const javascriptDetector: Detector = {
  name: "javascript",
  detect(dir: string): Runner | null {
    const pkgPath = join(dir, "package.json");
    if (!existsSync(pkgPath)) return null;
    let pkg: Pkg;
    try { pkg = JSON.parse(readFileSync(pkgPath, "utf8")); } catch { return null; }

    const scripts = pkg.scripts ?? {};
    const script = scripts.dev ? "dev" : scripts.start ? "start" : scripts.serve ? "serve" : null;
    if (!script) return null;

    const pm = detectPm(dir);
    const command = `${pm} run ${script}`;
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    let type = "node";
    let port = 3000;
    for (const fw of FRAMEWORK_TABLE) {
      const depMatch = Object.keys(deps).some((d) => fw.dep.test(d));
      const cfgMatch = fw.config ? hasConfig(dir, fw.config) : false;
      if (depMatch || cfgMatch) { type = fw.type; port = fw.port; break; }
    }

    const override = portFromScript(scripts[script]) ?? portFromEnv(dir);
    if (override) port = override;

    return { type, command, cwd: dir, port, url: urlFor(port) };
  },
};

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { javascriptDetector } from "../src/detect/javascript.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "perchd-js-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const pkg = (o: object) => writeFileSync(join(dir, "package.json"), JSON.stringify(o));

describe("javascriptDetector", () => {
  it("returns null without package.json", () => {
    expect(javascriptDetector.detect(dir)).toBeNull();
  });

  it("detects next on port 3000 with npm by default", () => {
    pkg({ scripts: { dev: "next dev" }, dependencies: { next: "14.0.0" } });
    expect(javascriptDetector.detect(dir)).toMatchObject({
      type: "nextjs", command: "npm run dev", port: 3000, cwd: dir,
    });
  });

  it("uses pnpm when pnpm-lock.yaml present", () => {
    pkg({ scripts: { dev: "next dev" }, dependencies: { next: "1" } });
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    expect(javascriptDetector.detect(dir)?.command).toBe("pnpm run dev");
  });

  it("prefers a port hard-coded in the dev script", () => {
    pkg({ scripts: { dev: "next dev -p 4001" }, dependencies: { next: "1" } });
    expect(javascriptDetector.detect(dir)?.port).toBe(4001);
  });

  it("falls back to start then serve script", () => {
    pkg({ scripts: { start: "node server.js" } });
    expect(javascriptDetector.detect(dir)).toMatchObject({ command: "npm run start", port: 3000, type: "node" });
  });

  it("detects vite on 5173", () => {
    pkg({ scripts: { dev: "vite" }, devDependencies: { vite: "5" } });
    expect(javascriptDetector.detect(dir)).toMatchObject({ type: "vite", port: 5173 });
  });

  it("detects astro on 4321", () => {
    pkg({ scripts: { dev: "astro dev" }, dependencies: { astro: "4" } });
    expect(javascriptDetector.detect(dir)).toMatchObject({ type: "astro", port: 4321 });
  });

  it("detects sveltekit on 5173", () => {
    pkg({ scripts: { dev: "vite dev" }, devDependencies: { "@sveltejs/kit": "2" } });
    expect(javascriptDetector.detect(dir)).toMatchObject({ type: "sveltekit", port: 5173 });
  });

  it("detects remix on 3000", () => {
    pkg({ scripts: { dev: "remix dev" }, dependencies: { "@remix-run/node": "2" } });
    expect(javascriptDetector.detect(dir)).toMatchObject({ type: "remix", port: 3000 });
  });

  it("detects nuxt on 3000", () => {
    pkg({ scripts: { dev: "nuxt dev" }, dependencies: { nuxt: "3" } });
    expect(javascriptDetector.detect(dir)).toMatchObject({ type: "nuxt", port: 3000 });
  });

  it("reads PORT from .env when script has no port", () => {
    pkg({ scripts: { dev: "vite" }, devDependencies: { vite: "5" } });
    writeFileSync(join(dir, ".env"), "PORT=4500\n");
    expect(javascriptDetector.detect(dir)?.port).toBe(4500);
  });
});

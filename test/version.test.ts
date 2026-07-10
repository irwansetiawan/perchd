import { describe, it, expect } from "vitest";
import { execa } from "execa";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const cliEntry = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const pkgVersion = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
).version as string;

// Run the real CLI entry through tsx (a devDep, available in CI) so this guards
// the actual `perchd --version` path, not a stand-in.
const run = (args: string[]) =>
  execa("node", ["--import", "tsx", cliEntry, ...args], { cwd: repoRoot, reject: false });

describe("perchd --version", () => {
  it("prints the package.json version for --version", async () => {
    const { stdout, exitCode } = await run(["--version"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain(pkgVersion);
    expect(stdout).toMatch(/^perchd\//);
  });

  it("accepts the -v alias", async () => {
    const { stdout, exitCode } = await run(["-v"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain(pkgVersion);
  });

  it("does not throw 'Unknown option' (the pre-fix regression)", async () => {
    const { stderr } = await run(["--version"]);
    expect(stderr).not.toMatch(/Unknown option/);
  });
});

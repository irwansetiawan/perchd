# Contributing to perchd

Thanks for your interest! perchd is a small, focused tool — contributions that
keep it that way are very welcome.

## Dev setup

```sh
pnpm install
pnpm test          # run the vitest suite
pnpm test:watch    # watch mode
pnpm typecheck     # tsc --noEmit
pnpm build         # bundle to dist/cli.js with tsup
pnpm dev status    # run the CLI from source via tsx
```

Requires Node ≥ 20. Tests run on macOS and Linux.

## Project layout

```
src/
  cli.ts              entry; arg parsing (cac), command dispatch
  commands/           one file per CLI subcommand
  core/               git, state, process, config, resolve, context, reconcile
  detect/             the pluggable detector chain
  ui/picker.ts        fzf / @clack/prompts picker
test/                 vitest; fixtures under test/fixtures/
```

## Adding a framework

Detection is an **ordered, pluggable chain** (`src/detect/index.ts`); first
match wins. Adding support for a framework is one new module:

1. Create `src/detect/<name>.ts` exporting a `Detector`:
   ```ts
   import type { Detector } from "./types.js";
   export const myDetector: Detector = {
     name: "myframework",
     detect(dir) { /* read files in dir; return a Runner or null */ },
   };
   ```
2. Register it in `src/detect/index.ts` `defaultDetectors` in the right priority
   order (config → convention → JS → Python → yours).
3. Add a test in `test/detect-<name>.test.ts` that builds a fixture directory
   (use `mkdtempSync`) and asserts the resulting `Runner`.

Keep detectors **pure** — read the filesystem, return a `Runner`, never spawn
processes. That keeps them trivially testable.

## Conventions

- TDD: write the failing test first, then the implementation.
- ESM with `.js` extensions on relative imports (NodeNext resolution).
- Commit messages: Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`,
  `chore:`).
- Keep files focused and small; one clear responsibility each.

## Scope

Please read [`the design spec`](./the design spec) §3 (non-goals) and §9 (design
rationale) before proposing features. In particular: no simultaneous servers,
no reverse proxy, no per-worktree port hashing — single-active is the point.

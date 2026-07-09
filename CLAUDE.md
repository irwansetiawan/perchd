# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
pnpm install
pnpm test                          # vitest run (full suite)
pnpm test:watch                    # vitest watch mode
pnpm vitest run test/state.test.ts # a single test file
pnpm vitest run -t "port handoff"  # a single test by name
pnpm typecheck                     # tsc --noEmit
pnpm build                         # bundle to dist/cli.js with tsup
pnpm dev status                    # run the CLI from source via tsx (`pnpm dev <subcommand>`)
```

CI (`.github/workflows/ci.yml`) runs `pnpm typecheck` + `pnpm test` on ubuntu/macos × Node 20/22. Node ≥ 20; macOS + Linux only (Windows is out of scope).

## What perchd is

A CLI that keeps **exactly one** dev server alive across many git worktrees, on that
project's **native port**. Agents build every branch in parallel; you only ever look
at one. Single-active is the load-bearing constraint — it is what buys "no port
collisions, no reverse proxy, no port hashing, no daemon."

**Do not add features that break single-active** (simultaneous servers, per-worktree
port hashing, a proxy). `--pinned` multi-active has been repeatedly deferred for this
reason; it needs an explicit decision to break the core constraint.

## Architecture

Flow for a switch: `cli.ts` → `core/context.ts` (git worktrees + common dir) →
`core/target.ts` (resolve a branch/path arg to a worktree) → `core/resolve.ts`
(config precedence → a `Runner`) → `core/process.ts` (stop old group, start new) →
`core/state.ts` (persist the `ActiveServer`).

- **`core/state.ts`** — the single source of truth: one `ActiveServer` (or null) in
  `<git-common-dir>/perchd/state.json`, written atomically (tmp + `rename`). Logs live
  beside it at `perchd/logs/<slug>.log`.
- **`core/process.ts`** — spawn/teardown. Every server is started as its own **process
  group leader** (`detached: true`) and torn down by **process group** (SIGTERM →
  SIGKILL), because dev servers fan out children (Turbopack, esbuild, webpack). Killing
  the bare pid leaks orphans onto the port.
- **`core/reconcile.ts` + `core/reap.ts`** — there is **no daemon**. State is reconciled
  lazily on the next command: a deleted active worktree gets its server stopped and the
  state cleared. `perchd watch` is the only long-running process, and its correctness
  guarantee is the periodic poll, not chokidar (chokidar just makes it instant).
- **`detect/`** — an ordered, pluggable detector chain, first match wins:
  convention (`mprocs`, `process-compose`, `Procfile`, `Makefile dev:`, `justfile dev`)
  → JavaScript → Python. Detectors must stay **pure**: read the filesystem, return a
  `Runner`, never spawn. There is deliberately **no config detector** — explicit config
  precedence (CLI flags > per-worktree block > repo `[runner]` > detection) lives
  entirely in `core/resolve.ts`.
- **`commands/`** — one file per subcommand; `cli.ts` (cac) only parses and dispatches.

## Non-obvious constraints

- **`spawn`, not `execa`, in `core/process.ts`.** execa v9's strict stdio typing rejects
  a runtime numeric fd; native `child_process.spawn` inherits the log fd cleanly for the
  detached child. (execa is still used elsewhere.)
- **Foreground servers must keep `stdio[0] = "ignore"`.** Giving the child stdin causes
  vite/Next to be suspended with SIGTTIN/SIGTTOU when backgrounded. The cost is that the
  dev server's own keypress UI (vite `r`/`q`) is inactive — this is a known, accepted
  trade-off, not a bug to fix by handing over stdin.
- **Passthrough (`core/passthrough.ts`) is runner-agnostic.** `perchd … -- <args>` is
  appended verbatim (shell-quoted) to whatever command was resolved. npm needs its *own*
  extra `--`, so the user writes `-- -- --host`. Don't special-case npm.
- **`cli.ts` splits argv at the first standalone `--`** before handing the front half to
  cac, so cac never sees passthrough args.
- **`docs/superpowers/` and `perchd-prd.md` are gitignored and must NEVER be committed.**
  They were deliberately purged from git history (filter-repo + force-push, 2026-06-14).
  Design/spec/plan docs live there on disk, local-only. Don't reference them from tracked
  files.
- **npm versions are immutable.** A post-publish fix means a version bump, never a
  re-publish. Publishing requires 2FA passed inline: `npm publish --otp=<6 digits>`.
- **chokidar must stay in `dependencies`** — tsup externalizes it rather than bundling it
  into `dist/`.

## Conventions

- **TDD**: failing test first, then implementation.
- ESM with `.js` extensions on relative imports (NodeNext resolution).
- Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- Keep files small and single-responsibility; one file per command.
- Integration tests under `test/integration/` drive real processes against the fixtures
  in `test/fixtures/` (`mini-server`, and `multiproc-server` which mimics vite→esbuild
  for process-group teardown).

## In-flight redesign (branch `worktree-drop-in-first-redesign`, target 0.4.0)

**Not yet implemented.** The docs on this branch describe the target behavior; the code
still ships the 0.3.0 surface. Do not merge or publish the docs ahead of the code.

The model becomes **one server, detachable viewport** (tmux-for-dev-servers): the server
always lives in the background, and "foreground" is just whether a terminal is currently
attached to its log stream.

- Bare `perchd` becomes the `npm run dev` drop-in (switch here + attach foreground).
- `-d` / `--detach` flips **any** switch to background — one uniform, explicit axis.
- **Ctrl-C detaches; it does not kill.** `perchd stop` is the only way to terminate.
- `perchd dev` is demoted to a deprecated alias for bare `perchd`.
- `ActiveServer.foreground` goes away: every server has a real `logPath`, and
  "attached" becomes a property of the viewport, not the server. `gc`/reconcile must
  tolerate a 0.3.0 state file that still has `foreground: true` / `logPath: ""`.

**Open decision, must be settled before implementing:** a server that survives detach
must write to a **file**, and dev servers strip colour when `stdout` isn't a TTY
(verified: picocolors reports `isColorSupported=false` to a file, `true` with
`FORCE_COLOR=1`). Today's `perchd dev` inherits the real TTY, so colour works *now* —
a naïve move to "background + tail the logfile" would make the drop-in look plainer
than the `npm run dev` it replaces. Likely fix: inject `FORCE_COLOR=1` into the child
env (respecting `NO_COLOR`); full fidelity would need a pty and is deferred. See §6 of
the spec.

Full design: `docs/superpowers/specs/2026-07-02-perchd-drop-in-first-redesign-design.md`
(gitignored, local-only).

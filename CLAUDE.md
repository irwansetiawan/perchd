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
- **Servers must keep `stdio[0] = "ignore"`.** Giving the child stdin causes vite/Next to
  be suspended with SIGTTIN/SIGTTOU when backgrounded. The cost is that the dev server's
  own keypress UI (vite `r`/`q`) is inactive — a known, accepted trade-off, not a bug to
  fix by handing over stdin.
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

## The viewport model (0.4.0), with hybrid Ctrl-C (0.5.0)

**One server, detachable viewport** — tmux-for-dev-servers. Every server runs detached
in the background and writes to a log file. "Foreground" is not a kind of server; it is
a **viewport**: `tail -f` on that log plus a poller watching the state file
(`core/viewport.ts`).

- Bare `perchd` is the `npm run dev` drop-in: switch to cwd's worktree, then attach.
  Outside any worktree it shows the picker (`containingWorktree` decides).
- `-d` / `--detach` flips **any** switch to background. One uniform, explicit axis.
- **Hybrid Ctrl-C (`attachViewport`'s `stopOnInterrupt`):** a viewport that *started*
  the server (bare `perchd` / `switch`) **stops** it on Ctrl-C, and on window-close
  (SIGHUP) too — that is the `npm run dev` drop-in promise. A viewport that *attached*
  to an already-running server (`perchd attach`) only **detaches** on Ctrl-C; killing
  something you attached to peek at would be a footgun. **The banner must state which,
  per mode** ("^C stops" vs "^C detaches") — that is what keeps the overload legible
  rather than surprising. `perchd stop` always terminates regardless.
- **`runViewport` never signals the server itself.** It reports `{interrupted, signal}`;
  the stop-vs-detach *policy* lives in `attachViewport` (graceful `stopGroup` on SIGINT;
  best-effort synchronous `SIGTERM` to the group on SIGHUP, since the terminal is gone
  and there is no time to wait on an escalating teardown). Keeping the signal-to-reason
  mapping pure is what makes it unit-testable.
- `cli.ts` is the **only** place attachment is decided. `runSwitch` never attaches;
  keeping it that way avoids a `switch ↔ attach` import cycle.
- `perchd dev` is a deprecated alias for bare `perchd`.

A viewport ends for exactly five reasons — `interrupted` (Ctrl-C/SIGHUP; the signal is
carried so the policy can pick stop vs. detach), `detached` (the tail process died on
its own), `perch-moved` (another terminal switched), `stopped`, `server-exited` (clears
the record if the pid is still ours).

**The `graceMs` window is load-bearing, don't remove it.** `runSwitch` stops the old
server and clears the state record *before* starting the new one, so for a few hundred
ms the state file points at a dead pid and then at nothing. A poller that concluded on
first sight would report `server-exited` (exit 1!) on every ordinary switch — which is
exactly what happened before the window existed. So when our server looks gone, the
viewport keeps polling for `graceMs` (default 2.5s); a record with a *different* pid
appearing during that window wins and yields `perch-moved`. Tests that fake the
transition atomically (new record, no null gap, old pid still alive) pass while the real
flow is broken — `test/integration/attach-flow.test.ts` drives a real `runSwitch` for
this reason, and must `await` that switch rather than racing it via `.then`.

Known limitation: `graceMs` is a flat 2.5s, while the switch gap is bounded by
`stop_timeout` (a server that ignores SIGTERM is SIGKILLed only after 8s by default).
Such a server's switch would still be misreported as `server-exited`. Real servers exit
on SIGTERM in well under a second, and CI confirms the gap stays under 2.5s. The precise
fix is a handoff marker in the state file rather than a longer timeout — a longer one
would delay the `stopped` message after an ordinary `perchd stop`.

**Why `FORCE_COLOR`:** a server that survives detach must write to a **file**, and dev
servers strip colour when `stdout` isn't a TTY (verified: picocolors reports
`isColorSupported=false` to a file, `true` with `FORCE_COLOR=1`). So `core/env.ts`
injects `FORCE_COLOR=1`/`CLICOLOR_FORCE=1` into spawned servers unless `NO_COLOR` or an
explicit `FORCE_COLOR` is set — otherwise the drop-in would look plainer than the
`npm run dev` it replaces. Interactive progress re-rendering (spinners) is still not
faithful; that needs a pty and was rejected (native dependency).

`readState` strips a legacy `foreground` key from 0.3.x state files; those records have
`logPath: ""` and cannot be attached to (`perchd restart` fixes them).

Full design: `docs/superpowers/specs/2026-07-02-perchd-drop-in-first-redesign-design.md`
(gitignored, local-only).

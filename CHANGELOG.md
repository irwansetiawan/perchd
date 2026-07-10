# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0]

### Changed

- **BREAKING: Ctrl-C now stops the server you started, like `npm run dev`.** This
  reverses 0.4.0's "Ctrl-C always detaches." The behaviour is *hybrid*, keyed on whether
  your terminal started the server:
  - Bare `perchd` / `perchd <branch>` / `perchd switch` **start** the server, so Ctrl-C
    stops it — and so does closing the terminal window (SIGHUP). No orphans.
  - `perchd attach` **attaches** to a server that's meant to persist, so Ctrl-C there only
    detaches and leaves it running.
  The attach banner states which mode you're in (`^C stops` vs `^C detaches`).
  `perchd stop` still terminates the active server from anywhere.
- Internally, `runViewport` now reports `{ interrupted, signal }` and never signals the
  server itself; the stop-vs-detach policy lives in `attachViewport` (graceful `stopGroup`
  on SIGINT, best-effort group `SIGTERM` on SIGHUP since the terminal is already gone).

### Added

- **`perchd -v` / `perchd --version`** — previously threw `Unknown option`. Prints the
  installed version (read from `package.json`, so it's correct under both the published
  binary and `pnpm dev`).

## [0.4.0]

### Changed

- **`perchd` is now the drop-in for `npm run dev`.** Bare `perchd` (and
  `perchd <branch>`) switches the active server and **attaches** to it in the
  foreground with live logs. The foreground/background split is no longer two
  commands — it's one explicit flag.
- **BREAKING: Ctrl-C detaches, it no longer stops the server.** perchd's model is one
  server that always lives in the background, with your terminal as a detachable
  viewport onto its log stream. Use `perchd stop` to terminate the server.
- **`-d` / `--detach`** switches without attaching (print the URL, return the prompt) —
  the old background-switch behavior of bare `perchd`. The flag means the same thing on
  every switch, whether or not a target was passed.
- `ActiveServer.foreground` is retired: every server has a real `logPath`, and "attached"
  became a property of the viewport rather than the server. `gc`/reconcile tolerate a
  `0.3.x` state file that still carries `foreground: true` / `logPath: ""`.
- Spawned dev servers now get `FORCE_COLOR=1` / `CLICOLOR_FORCE=1` (unless `NO_COLOR` or
  an explicit `FORCE_COLOR` is set). Servers write to a log file so they can outlive the
  terminal, and dev servers strip colour when stdout is not a TTY — forcing it keeps ANSI
  codes in the log, which `tail` replays on attach. Interactive progress re-rendering
  (spinners) is still not faithfully reproduced; that would need a pty.
- `perchd status` no longer shows a `(fg)` label — no server is foreground any more.
- README repositioned around bare `perchd` as the drop-in, with the "Detach and switch.
  Attach and watch." model, a `Ctrl-C detaches` callout, and a migration table.

### Added

- **`perchd attach [branch]`** — attach to the active server's log stream (or switch to
  `branch`, then attach). Ctrl-C leaves the server running. When another terminal moves
  the perch, an attached viewport exits cleanly with `▸ perch moved to <branch>`: the
  poller rides out the window in which a switch has torn down the old server but not yet
  written the new record, so a switch is never mistaken for a crash.
- `CLAUDE.md` — architecture, invariants, and non-obvious constraints for coding agents.

### Deprecated

- **`perchd dev [target]`** — now an alias for `perchd [target]`. It behaves identically
  and prints a deprecation hint. It will be removed in a future major.

## [0.3.0]

### Added

- `perchd dev [target]` — a foreground, runner-agnostic drop-in for `npm run dev`.
  Runs any worktree (`perchd dev` = the one you're in, `perchd dev <branch>`, or
  `perchd dev main` for the primary checkout) attached to your terminal with live
  logs and Ctrl-C to stop, while honouring the single-active model: starting one
  stops whatever was running and hands off the port. Supports `--port`/`--cmd`
  overrides and verbatim, runner-agnostic `-- <args>` passthrough (npm needs its
  own extra `--`). Active foreground servers are labelled `(fg)` in `perchd status`.

### Changed

- README now leads with the `perchd dev` drop-in positioning (hero line, a "You
  already know the command" section, a `dev`-vs-switch clarifier, and an FAQ entry).

## [0.2.0]

### Added

- `perchd watch` — a foreground watcher that auto-stops the active server the
  instant its worktree directory is deleted (`git worktree remove` or a raw
  `rm -rf`), instead of waiting for the next `status`/`switch`. Uses chokidar for
  instant reaction plus a periodic safety poll so a missed filesystem event can
  never leave a server running.

## [0.1.x]

### Added

- Project scaffolding (TypeScript, tsup, vitest), MIT license, CI.
- **Worktree discovery** via `git worktree list --porcelain`, shared
  git-common-dir resolution, URL/file-safe branch slugs.
- **Pluggable detector chain** (first match wins):
  - Convention runners: `mprocs`, `process-compose`, `Procfile`
    (overmind/hivemind/foreman), `Makefile` `dev:`, `justfile` `dev`.
  - JS/TS: Next.js, Vite, Nuxt, Remix, Astro, SvelteKit, generic Node;
    package manager from lockfile; port from framework table, dev-script flag,
    or `.env` `PORT=`.
  - Python: Django, FastAPI, Flask; toolchain from `uv`/`poetry`/`.venv`/system.
- **`.perchd.toml` config** with precedence: CLI flags > per-worktree block >
  repo `[runner]` > auto-detection.
- **Single-active process model**: atomic state file, detached spawn, stop by
  process group (SIGTERM → SIGKILL), wait-for-port-free, readiness polling,
  lazy auto-reconcile when the active worktree is deleted.
- **CLI commands**: `perchd` / `switch` (interactive picker via `fzf` or
  `@clack/prompts`), `status` / `ls`, `stop`. Global flags `--cmd`, `--port`,
  `--no-wait`.
- **M3 — UX & resilience**: `restart`, `logs [-f]`, `open`, `path` (+ documented
  zsh `cd` function), `gc` (reconcile deleted worktree + reap stale pids),
  `doctor` (stale pids, dead ports, undetected worktrees, foreign port holders),
  `config` (resolved config + detected runner per worktree), and a `--force`
  flag on `switch` that kills a foreign process holding the target port.

## [0.1.2] — 2026-06-14

### Changed

- Rewrote the README around the parallel-agents workflow: ASCII header, badges,
  before/after, sharpened "why single-active" rationale, and an FAQ. Docs only —
  no behavior changes.

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

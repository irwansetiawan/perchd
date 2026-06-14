# perchd

> **perched** — the bird settled on its one branch. One active dev server per repo, on the worktree you're actually looking at.

`perchd` keeps a **single active dev server per git repository**. You run many
worktrees per repo (parallel agents, feature branches); to preview one you
normally have to `cd` into it, remember its dev command, kill whatever was
already running, and start the new one. `perchd` collapses that to:

```
perchd            # pick a worktree → it stops the old server and starts the new one
```

It stops whatever was running, detects how to run the picked worktree, and
starts it in the right directory on its **native port** — no manual `cd`, no
remembering commands, no port juggling.

## Why single-active

Agent concurrency (8 worktrees) is not preview concurrency (1 pair of eyes).
Because only one server runs at a time, every project starts on its own
conventional default port — collisions can't happen, no proxy, no port hashing,
no `.env` rewriting. Bookmarks never move.

## Install

```sh
npm i -g perchd      # or: pnpm add -g perchd
```

Requires Node ≥ 20. macOS and Linux (Windows is out of scope for v1).
If [`fzf`](https://github.com/junegunn/fzf) is on your `PATH`, the picker uses
it; otherwise a built-in prompt is used.

## Quickstart

```sh
cd any/worktree/of/your/repo
perchd                 # interactive picker → switch
perchd switch feature/auth   # non-interactive
perchd status          # table of worktrees, runners, ports, which is ACTIVE
perchd stop            # stop the active server
```

## Commands

| Command | Description |
| --- | --- |
| `perchd` / `perchd switch [branch\|path]` | Switch the active dev server (interactive when no target). |
| `perchd status` / `perchd ls` | Table: worktree, branch, runner, port, ACTIVE?, pid, uptime. |
| `perchd stop` | Stop the active server. |
| `perchd restart` | Restart the active server in place. |
| `perchd logs [-f]` | Print (or follow with `-f`) the active server's log. |
| `perchd open` | Open the active server's URL in the browser. |
| `perchd path [branch]` | Print a worktree's absolute path (for the shell `cd` function). |
| `perchd gc` | Stop+clear a deleted active worktree; reap stale pids. |
| `perchd doctor` | Diagnose stale pids, dead ports, undetected worktrees, foreign port holders. |
| `perchd config` | Print the resolved config and detected runner per worktree. |

**Global flags** (for `switch`): `--cmd <str>` and `--port <n>` (one-off
overrides), `--no-wait` (skip the readiness wait), `--force` (kill a foreign
process holding the target port).

## Supported frameworks

Auto-detected with no config:

- **JS/TS:** Next.js, Vite (React/Vue/Svelte), Nuxt, Remix, Astro, SvelteKit,
  generic Node (`dev`/`start`/`serve` script). Package manager inferred from the
  lockfile (pnpm/bun/yarn/npm).
- **Python:** Django, FastAPI, Flask. Toolchain inferred from the lockfile
  (`uv`/`poetry`/`.venv`/system).
- **Convention runners:** `mprocs`, `process-compose`, `Procfile`
  (overmind/hivemind/foreman), `Makefile` `dev:` target, `justfile` `dev` recipe.

Adding a framework is one new detector module — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Config (optional)

Everything is auto-detected; `.perchd.toml` at the repo root is only for
overrides and non-standard projects:

```toml
ready_timeout = 30           # seconds to wait for the port to listen
stop_timeout  = 8            # seconds before SIGTERM escalates to SIGKILL

[runner]                     # force the runner for the whole repo
command = "make dev"
port    = 3000

[worktrees."feature/auth"]   # per-branch override
command = "pnpm dev"
cwd     = "apps/web"         # relative to the worktree root
port    = 4000
env     = { DEBUG = "1" }
```

## Jumping into the active worktree (`cd`)

A child process can't change your shell's directory, so `perchd` ships a
`path` subcommand and a small shell function. Add this to your `~/.zshrc`:

```zsh
perchd() {
  if [[ "$1" == "cd" ]]; then
    cd "$(command perchd path "$2")"
  else
    command perchd "$@"
  fi
}
```

Then `perchd cd feature/auth` jumps you there.

## License

[MIT](./LICENSE) © Irwan Setiawan

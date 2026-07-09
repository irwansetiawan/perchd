```
                  v
                ( o)>      p e r c h d
               //\         ─────────────────────────────────
      ~~~~~~~~~~V_/_~~~~~   the one branch you actually land on

      │  >  feature/auth      next      :3000     ACTIVE
      │     fix/payments      vite      :5173
      │     spike/ai-search   fastapi   :8000
      │     chore/bump-deps   next      :3000
      │
      │  your agents build every branch · one server on the one you watch
```

<h1 align="center">perchd</h1>

<p align="center">
  <em>Eight agents. Eight branches. One perch.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/perchd?style=flat-square&color=0a7e8c&label=npm" alt="npm version">
  <img src="https://img.shields.io/badge/node-%E2%89%A520-0a7e8c?style=flat-square" alt="Node >= 20">
  <img src="https://img.shields.io/badge/built%20for-parallel%20agents-0a7e8c?style=flat-square" alt="Built for parallel agents">
  <img src="https://img.shields.io/badge/macOS%20%C2%B7%20Linux-0a7e8c?style=flat-square" alt="macOS and Linux">
  <img src="https://img.shields.io/badge/license-MIT-0a7e8c?style=flat-square" alt="MIT license">
</p>

<p align="center">
  <strong>perchd is <code>npm run dev</code>, pointed at any worktree —<br>
  and you can change which one without killing anything.</strong>
</p>

<p align="center">
  <sub>1 live server &middot; 0 port collisions &middot; 0 daemons</sub>
</p>

---

It's the agentic era. You don't write one branch at a time anymore.

You open six git worktrees, point a coding agent at each — Claude Code here, Cursor
there, Codex on the spike — and they all start typing at once. Six dev servers want
port 3000. You want to **look at one of them**.

perchd is the perch. One dev server, on its **native port**, following whichever
branch you're looking at. No `cd`. No remembering the command. No port roulette.

## You already know the command

You don't have to learn perchd to use perchd. Your dev command is `npm run dev` (or
`pnpm dev`, or `make dev`). Trade it for **`perchd`** and you get the same thing —
foreground, logs streaming — except it runs **any worktree**, always on the **same
port**:

```sh
perchd                 # the worktree you're standing in — your `npm run dev`, basically
perchd feature/auth    # a different version, same terminal, same URL
perchd main            # the main tree, without leaving your branch
```

Same muscle memory. Swap one word, and now every branch your agents touched is one
command away.

## Detach and switch. Attach and watch.

Here's the part that isn't `npm run dev`.

The server **always lives in the background**. What you call "foreground" is just a
*viewport* — your terminal, attached to the log stream. So:

```sh
perchd                 # attach: live logs in your terminal, like npm run dev
^C                     # detach: you stop watching. the server KEEPS RUNNING.
perchd fix/payments    # move the perch to another branch
perchd stop            # actually terminate it
```

> **Ctrl-C detaches. It does not kill.**
> That one rule is what makes switching safe — and it's the opposite reflex from
> `npm run dev`. To really stop the server, say `perchd stop`.

And when you'd rather not tie up a prompt at all, `-d` switches without attaching:

```sh
perchd feature/auth -d   # switch, print the URL, hand your prompt back
perchd attach            # ...come watch it whenever you like
```

One server. One port. `-d` is the only knob, and it means the same thing everywhere.

## Before / after

Without perchd, switching what you're previewing is a small ritual every time:

```sh
$ cd ../repo-feature-auth && pnpm dev     # wait — which port was this one?
^C                                        # kill the vite server from the other worktree
$ lsof -ti tcp:3000 | xargs kill          # something's *still* on 3000
$ cd ../repo-fix-payments                 # ...was it `npm run dev` or `make dev` here?
```

With perchd:

```sh
$ perchd feature/auth
# old server stops, frees its port, auth starts on :3000, logs stream
# → http://localhost:3000
```

That was it.

## Why single-active

The bottleneck moved. Agents are cheap and parallel; **your attention is not.**

> **Agent concurrency (8 worktrees) is not preview concurrency (1 pair of eyes).**

So perchd keeps exactly **one** dev server alive — the worktree you're actually
looking at — and that one assumption pays for everything:

- **No port collisions.** Only one server runs, so every project starts on its own
  conventional default port. Two Next apps both want 3000? Fine — they never run at
  the same time.
- **No proxy, no port hashing, no `.env` rewriting.** Your bookmarks never move. It's
  always `localhost:<the default for that framework>`.
- **No daemon.** perchd reconciles lazily the next time you run it. Delete the active
  worktree and the server gets stopped and cleared on your next `status` or switch —
  self-healing, no watcher.
- **No orphans.** Dev servers spawn children (Turbopack, webpack, esbuild). perchd
  starts each server as its own process group and tears down the **whole group**, so
  rapid switches never leave zombies on a port.

If a worktree needs several processes at once, point its runner at `mprocs` /
`make dev` / a `dev:all` script. perchd supervises one process group; that group can
fan out all it likes.

## Install

Install it **globally** — perchd is a CLI you run from any worktree, in any terminal,
so it belongs on your `PATH`, not in one project's `node_modules`:

```sh
npm i -g perchd       # or: pnpm add -g perchd   ·   bun add -g perchd
```

Requires **Node ≥ 20**, on **macOS or Linux** (Windows is out of scope for v1).
If [`fzf`](https://github.com/junegunn/fzf) is on your `PATH`, the picker uses it;
otherwise a clean built-in prompt takes over.

## Quickstart

```sh
cd any/worktree/of/your/repo
perchd                       # run this worktree, attached (your `npm run dev`)
^C                           # detach — it keeps running
perchd feature/auth -d       # switch to another branch, don't attach
perchd status                # table: worktree, runner, port, which is ACTIVE
perchd stop                  # stop the active server
```

## Commands

| Command | What it does |
| --- | --- |
| `perchd [branch\|path]` | Switch the active dev server **and attach** (drop-in for `npm run dev`). Interactive picker when there's no obvious target. |
| `perchd … -d` / `--detach` | Switch but stay in the background — print the URL and return the prompt. |
| `perchd switch [branch\|path]` | Explicit synonym for `perchd [branch\|path]`. Note it now **attaches** by default; add `-d` for the old background behavior. |
| `perchd attach [branch]` | Attach to the active server (or switch to `branch`, then attach). |
| `perchd stop` | Stop the active server. |
| `perchd status` / `perchd ls` | Table: worktree, branch, runner, port, ACTIVE?, pid, uptime. |
| `perchd restart` | Restart the active server in place. |
| `perchd logs [-f]` | Print (or follow with `-f`) the active server's log. |
| `perchd open` | Open the active server's URL in the browser. |
| `perchd path [branch]` | Print a worktree's absolute path (for the shell `cd` function). |
| `perchd gc` | Stop + clear a deleted active worktree; reap stale pids. |
| `perchd doctor` | Diagnose stale pids, dead ports, undetected worktrees, foreign port holders. |
| `perchd config` | Print the resolved config and detected runner per worktree. |
| `perchd watch` | Foreground watcher: auto-stops the active server the instant its worktree is deleted. |
| `perchd dev [target]` | **Deprecated** — an alias for `perchd [target]`. See [migrating](#migrating-from-perchd-dev). |

**Flags on a switch:** `-d`/`--detach` (don't attach), `--cmd <str>` and `--port <n>`
(one-off overrides), `--no-wait` (skip the readiness wait), `--force` (kill a foreign
process holding the target port).

**Passthrough is runner-agnostic** — perchd appends your `-- <args>` verbatim to
whatever command it resolved, and does not assume npm. For npm's own script
forwarding, include npm's separator yourself: `perchd -- -- --host` runs
`npm run dev -- --host`.

```sh
perchd --port 4000     # override the port
perchd -- --host       # append args to the underlying runner
```

> Note: the underlying dev server's own keypress shortcuts (e.g. vite's `r`/`q`) are
> inactive while attached — use `perchd restart` and `perchd stop`. (perchd's servers
> don't read stdin, by design: it's what keeps them from being suspended when they
> outlive your terminal.)

## Migrating from `perchd dev`

Through `0.3.x`, the foreground drop-in was a subcommand: `perchd dev`. It's now just
`perchd`. `perchd dev` still works and behaves identically — it prints a deprecation
hint and will be removed in a future major.

| Before (`≤ 0.3.x`) | Now |
| --- | --- |
| `perchd dev` | `perchd` |
| `perchd dev feature/auth` | `perchd feature/auth` |
| `perchd` (background switch) | `perchd -d` |
| `perchd switch feature/auth` (background) | `perchd feature/auth -d` |
| Ctrl-C **stopped** the server | Ctrl-C **detaches**; use `perchd stop` |

`perchd switch` still exists as an explicit synonym, but like every switch it now
**attaches** by default — pass `-d` to get the old background behavior.

The last row is the one to internalize: Ctrl-C no longer kills the dev server.

## Supported frameworks

Auto-detected with **zero config** — perchd reads the worktree and figures out how it
wants to run:

- **JS/TS:** Next.js, Vite (React/Vue/Svelte), Nuxt, Remix, Astro, SvelteKit, generic
  Node (`dev`/`start`/`serve` script). Package manager inferred from the lockfile
  (pnpm/bun/yarn/npm).
- **Python:** Django, FastAPI, Flask. Toolchain inferred from the lockfile
  (`uv`/`poetry`/`.venv`/system).
- **Convention runners:** `mprocs`, `process-compose`, `Procfile`
  (overmind/hivemind/foreman), `Makefile` `dev:` target, `justfile` `dev` recipe.

Your agent invented a framework perchd doesn't know? Adding one is a single detector
module — see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Config (optional)

Everything is auto-detected; `.perchd.toml` at the repo root is only for overrides and
non-standard projects:

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

A child process can't change your shell's directory, so perchd ships a `path`
subcommand and a small shell function. Add this to your `~/.zshrc`:

```zsh
perchd() {
  if [[ "$1" == "cd" ]]; then
    cd "$(command perchd path "$2")"
  else
    command perchd "$@"
  fi
}
```

Then `perchd cd feature/auth` drops you right where your agent has been working.

## FAQ

**Do I have to learn a new tool?**
No. `perchd` *is* your `npm run dev` — same foreground, same logs — it just aims at any
worktree (or the main tree) on the same port. Swap one word today; discover the
switching whenever you feel like it.

**Why doesn't Ctrl-C stop the server?**
Because the server isn't *yours* — it's the perch, and your terminal is just looking at
it. Detaching lets you close the terminal, switch branches, or attach from somewhere
else without a restart. `perchd stop` is the kill switch.

**Can't it just run all eight servers at once?**
No. You have two eyes. It runs the one you're looking at. That's not a limitation —
it's [the whole design](#why-single-active).

**My agent spawns Turbopack / webpack / esbuild children. Orphans on the port?**
No. perchd signals the whole process group, not the bare pid, and waits for the port
to free before starting the next one.

**Do I need a daemon running in the background?**
No daemon. perchd does its bookkeeping lazily, the next time you run it.

**Does it manage my agents (Claude Code, Cursor, Codex)?**
No. It manages dev servers. The agents are your problem — perchd just gives you a clean
window onto whatever they've built.

**I deleted the active worktree out from under it.**
Your next `status` or switch notices, stops the server, and clears the state.
Self-healing.

## License

[MIT](./LICENSE) © Irwan Setiawan

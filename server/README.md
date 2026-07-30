# Claude PM Server

Node.js backend (Express + WebSocket + Prisma) for the Claude Session Manager /
workmux monitor. Serves the REST API + WebSocket that the iOS app consumes, and
runs the workmux bridge that polls live agent state.

See `CLAUDE.md` in this directory for architecture (routes, services, WebSocket,
schema).

## Requirements

- Node 20+ (this machine runs v24.x via nvm)
- Docker Desktop — Postgres runs as the `claudepm-db` container (see the
  repo-root `docker-compose.yml`), published on **:5434**
- On `PATH` for the command endpoints: `tmux`, `workmux` (`/usr/local/bin`),
  `git`, and `claude` (`~/.local/bin`)

## Configuration

All config comes from `server/.env` (copy `.env.example` → `.env`). Key vars:

| Var | Purpose |
|-----|---------|
| `PORT` / `HOST` | Listen address (default `4847` / `0.0.0.0`) |
| `DATABASE_URL` | Postgres URL — must point at the Docker DB port (**5434**) |
| `API_KEY` | Native-app auth. **Optional but consequential** — see below |

### `API_KEY` and auth

- **Not set** → auth is off for reads, and the **workmux command endpoints
  (`merge`/`remove`/`add`) are disabled** (fail-closed: they return `401`).
- **Set** (≥32 chars; generate with `openssl rand -hex 32`) → remote callers
  must send `X-API-Key: <key>` (HTTP) / `?apiKey=<key>` (WebSocket). `localhost`
  is exempt. The iOS app stores the key in its Keychain (Settings → API Key).

Turning `API_KEY` on makes the **whole** server require it for remote callers
(agent list + WebSocket too), not just the command endpoints.

`.env` is gitignored — the key never lands in the repo.

## Running

### Development (foreground, hot reload)

```bash
npm run dev        # tsx watch src/index.ts
```

### As a background service (launchd) — no terminal required

The server runs as a per-user LaunchAgent so it starts at login, auto-restarts
on crash, and needs no open terminal.

- **Plist:** `~/Library/LaunchAgents/com.claudepm.server.plist`
- **What it runs:** `node … tsx src/index.ts` — i.e. `tsx` against the **TS
  source** (not the `dist/` build, which can be stale/incomplete). It sets
  `WorkingDirectory` to this folder so the server reads `server/.env` as the
  single source of truth, and sets a `PATH` covering node/tmux/workmux/claude/git.
- **Logs:** `~/Library/Logs/claudepm-server.log`

> Why node-direct and not a shell wrapper: this project lives under `~/Desktop`,
> a macOS TCC-protected folder. A background LaunchAgent can't reliably read/exec
> a **shell script** there (`/bin/zsh: can't open input file`), but it can exec
> the **node binary** directly. So the plist calls node with an absolute path.

#### Control

```bash
# status
launchctl print     gui/$(id -u)/com.claudepm.server

# restart (do this after changing server code — tsx runs source, no build needed)
launchctl kickstart -k gui/$(id -u)/com.claudepm.server

# stop now (comes back at next login, because RunAtLoad is set)
launchctl bootout   gui/$(id -u)/com.claudepm.server

# stop AND keep it from starting at login (persistent); `enable` to re-allow
launchctl disable   gui/$(id -u)/com.claudepm.server

# start now
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.claudepm.server.plist

# follow logs
tail -f ~/Library/Logs/claudepm-server.log
```

#### Caveats

- **Docker Desktop must be running for the DB.** `claudepm-db` is
  `restart: unless-stopped`, so set Docker Desktop to open at login (Settings →
  General). The server's `KeepAlive` retries until the DB is reachable.
- **Node version is hardcoded** in the plist (`ProgramArguments[0]` and `PATH`).
  If you upgrade node via nvm, update both paths in the plist and
  `kickstart -k`.
- The plist is machine-specific (absolute paths) and lives outside the repo, so
  it is not version-controlled.

## Other scripts

```bash
npm run typecheck   # tsc --noEmit
npm run test:run    # vitest run
npm run db:generate # regenerate Prisma client after schema changes
npm run db:studio   # Prisma Studio
```

## Troubleshooting

- **Crash loop / server not up** → `tail ~/Library/Logs/claudepm-server.log`.
  Common causes: DB not reachable (is Docker up? is `DATABASE_URL` on :5434?),
  or port already held (`lsof -nP -iTCP:4847 -sTCP:LISTEN`).
- **App shows `Command rejected — set the server API key`** → `API_KEY` isn't set
  on the server, or the app's key doesn't match. Set it in `.env`, restart the
  service, and paste the same key in the app's Settings.
- **App stuck "reconnecting" with auth on** → the key in the app doesn't match
  (a trailing space from pasting is the classic cause). Re-paste and save.

# Claude Session Manager - Project Guidelines

## Project Overview

Claude Session Manager is a tmux-based orchestration server for managing Claude Code sessions. It provides real-time monitoring, ticket workflow management, and web/mobile clients for remote control.

## Repository Structure

```
claudePM/
├── server/                    # Node.js backend (Express + WebSocket)
│   ├── src/
│   │   ├── api/              # Express routers (thin, delegates to services)
│   │   ├── services/         # Business logic (testable, no HTTP concerns)
│   │   ├── models/           # Data types and database models
│   │   ├── config/           # Configuration (Zod validated)
│   │   └── websocket/        # WebSocket handlers
│   ├── tests/                # Vitest tests (mirrors src structure)
│   ├── prisma/               # Database schema and migrations
│   └── package.json
├── apps/
│   ├── web/                  # React web client (Vite + Tailwind)
│   └── desktop/              # Tauri desktop app (React + Tailwind)
├── docs/
│   ├── jira-tickets/         # Implementation tickets
│   │   └── desktop-parity/   # Desktop app tickets (DWP-001+)
│   ├── plans/                # Design documents
│   └── ai-context/           # Handoff documents
└── README.md
```

## Tech Stack

### Server
- **Runtime**: Node.js 20+ with ESM modules
- **Language**: TypeScript 5.6 (strict mode)
- **Server**: Express 4.21
- **Database**: PostgreSQL with Prisma ORM
- **WebSocket**: ws library
- **Validation**: Zod
- **Testing**: Vitest

### Client Apps (Web & Desktop)
- **Framework**: React 18 + TypeScript
- **Styling**: Tailwind CSS v4
- **State**: React Query (TanStack Query)
- **Routing**: React Router v6
- **Build**: Vite
- **Desktop**: Tauri 2.x (Rust backend)

## Client Applications

### Web App (`apps/web/`)
Browser-based client for session monitoring and ticket management.
```bash
cd apps/web
npm run dev      # Start dev server (port 5173)
npm run build    # Production build
```

### Desktop App (`apps/desktop/`)
Native desktop app with system notifications and offline support.
```bash
cd apps/desktop
npm run dev          # Vite dev server only
npm run tauri dev    # Full Tauri app with hot reload
npm run tauri build  # Build distributable
```

See `apps/desktop/CLAUDE.md` for desktop-specific documentation.

### Running Full Stack
```bash
# Terminal 1: Server
cd server && npm run dev

# Terminal 2: Web OR Desktop
cd apps/web && npm run dev
# OR
cd apps/desktop && npm run tauri dev
```

## Code Conventions

### Naming
- **Files**: `kebab-case.ts`
- **Functions**: `camelCase`
- **Types/Interfaces**: `PascalCase`
- **Constants**: `SCREAMING_SNAKE_CASE`

### ESM Requirements
- Use `.js` extension in imports even for `.ts` files
- Use `import`/`export`, never `require`

```typescript
// Correct
import { env } from './config/env.js';
import healthRouter from './api/health.js';

// Wrong - will fail at runtime
import { env } from './config/env';
```

### Architecture Patterns
- **API routes**: Thin, delegate to services
- **Services**: Business logic, testable, no HTTP concerns
- **Validation**: Use Zod at API boundaries
- **Errors**: Services throw typed errors, global handler catches

### Import Order
```typescript
// 1. External dependencies first
import express from 'express';
import { z } from 'zod';

// 2. Internal imports
import { env } from './config/env.js';
import { TmuxError } from './services/tmux-types.js';
```

## Development Commands

```bash
cd server

# Development
npm run dev          # Start with hot reload (tsx watch)
npm run build        # Compile TypeScript
npm run start        # Run compiled code

# Testing
npm run test         # Run tests in watch mode
npm run test:run     # Run tests once
npm run typecheck    # TypeScript type checking

# Linting
npm run lint         # Check for issues
npm run lint:fix     # Auto-fix issues
npm run format       # Format with Prettier

# Database
npm run db:migrate   # Run migrations
npm run db:push      # Push schema changes
npm run db:studio    # Open Prisma Studio
npm run db:generate  # Regenerate Prisma client
```

## Implementation Status

See `docs/jira-tickets/README.md` for full roadmap.

**Completed:**
- CSM-001: Project Scaffolding
- CSM-002: Database Schema
- CSM-004: tmux Integration

**In Progress:**
- Phase 1 foundation complete, ready for Phase 2

## Key Files

| File | Purpose |
|------|---------|
| `server/src/index.ts` | Express app entry point |
| `server/src/config/env.ts` | Environment config with Zod validation |
| `server/src/config/db.ts` | Prisma client singleton |
| `server/src/services/session-supervisor.ts` | Session lifecycle, Claude spawning |
| `server/src/services/tmux.ts` | tmux integration service |
| `server/prisma/schema.prisma` | Database schema |
| `docs/api-reference.md` | **Full REST API documentation** |
| `server/CLAUDE.md` | Server-specific documentation |

## API Overview

Full API documentation: **`docs/api-reference.md`**

### Key Endpoints
| Endpoint | Purpose |
|----------|---------|
| `GET /api/projects/:id/tickets` | List tickets with filtering, pagination, sorting |
| `POST /api/tickets/:id/start` | Start Claude session for ticket |
| `POST /api/sessions/:id/input` | Send input to session |
| `GET /api/sessions/:id/output` | Get terminal output |
| `POST /api/hooks/claude` | Receive Claude Code hook events |

### Ticket Query Parameters
The ticket list endpoint supports extensive filtering:
- `prefixes=CSM,DWP` - Filter by ticket prefix
- `state=in_progress` - Filter by state
- `excludeOldDone=true` - Hide old completed tickets
- `orderBy=updatedAt&orderDir=desc` - Sorting

## Claude Session Spawning

Sessions are started in `server/src/services/session-supervisor.ts` via tmux:

```typescript
claudeCommand = `claude "${escapedPrompt}" --allowedTools Edit Read Write Bash Grep Glob`;
// Executed via: tmux split-window -t <target> -c <projectRepoPath> <claudeCommand>
```

**Key points:**
- Prompt MUST come BEFORE `--allowedTools` flag
- Working directory set to project's `repoPath` (CLAUDE.md loads from here)
- Escape `\` and `"` in prompts for shell safety
- Ticket sessions include `---TASK_COMPLETE---` marker instruction

## Terminal Architecture

The web UI displays terminal sessions via **ttyd** (embedded in an iframe). User uses `C-a` as tmux prefix (not default `C-b`).

### Key Components

| File | Purpose |
|------|---------|
| `server/src/services/ttyd-manager.ts` | Spawns/manages ttyd instances per session |
| `server/src/services/tmux.ts` | tmux commands including copy-mode scrolling |
| `apps/web/src/pages/SessionDetail.tsx` | Terminal UI with scroll controls |

### How ttyd Works

1. `POST /api/sessions/:id/ttyd` starts a ttyd instance on port 7681+
2. ttyd runs: `tmux select-pane -t {paneId}; attach-session -t {session}`
3. Frontend embeds ttyd in iframe: `<iframe src="http://host:7681" />`
4. User keystrokes go through ttyd's WebSocket directly to tmux

### Sending Keys to Terminal

**DO NOT use `tmux send-keys` for tmux prefix commands** - it sends keys to the *program* in the pane, bypassing tmux's prefix handling.

For scrolling/copy-mode, use tmux commands directly:
```typescript
// In server/src/services/tmux.ts
await execTmux(['copy-mode', '-t', paneId]);           // Enter copy mode
await execTmux(['send-keys', '-t', paneId, '-X', 'halfpage-up']);   // Scroll up
await execTmux(['send-keys', '-t', paneId, '-X', 'halfpage-down']); // Scroll down
await execTmux(['send-keys', '-t', paneId, '-X', 'cancel']);        // Exit copy mode
```

The `-X` flag sends copy-mode commands, not literal keys.

### Mobile Scroll Controls

`POST /api/sessions/:id/scroll` with `{ action: "up" | "down" | "exit" }`

Floating buttons in `SessionDetail.tsx` call this endpoint. The `up` action auto-enters copy mode if not already in it.

### PTY Fallback Mode

If ttyd fails, falls back to node-pty (`server/src/services/pty-manager.ts`) with xterm.js in the browser. Toggle button in UI switches modes.

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
DATABASE_URL=postgresql://localhost:5432/claude_session_manager
HANDOFF_THRESHOLD_PERCENT=20
LOG_LEVEL=info

# Optional: API key for native app authentication (min 32 chars)
# Generate with: openssl rand -hex 32
API_KEY=your-api-key-here
```

## Native App Integration

The server supports native iOS/macOS apps with API key authentication and push notifications.

### API Key Authentication

Protected endpoints (under `/api/devices`) require `X-API-Key` header when `API_KEY` env var is set:

```bash
curl -X POST http://localhost:4847/api/devices/register \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"token": "apns-device-token", "platform": "ios"}'
```

**Note:** When `API_KEY` is not configured, these endpoints are accessible without authentication (development mode).

### Device Token Registration

For push notifications, native apps register their APNs device tokens:

- `POST /api/devices/register` - Register/update device token
- `DELETE /api/devices/:token` - Remove device token

See `docs/api-reference.md` for full API documentation.

## Testing Guidelines

- Unit tests go in `tests/` mirroring `src/` structure
- Integration tests that need tmux: use `TMUX_INTEGRATION_TESTS=1`
- Mock external dependencies in unit tests
- Test services in isolation from HTTP layer

## Common Pitfalls

- ESM requires `.js` extension in imports (even for `.ts` files)
- Path aliases in tsconfig.json don't work at runtime without additional setup
- Don't put business logic in API routes - use services
- Prisma client must be regenerated after schema changes

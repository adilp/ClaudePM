# Claude Session Manager - Project Guidelines

## Project Overview

Claude Session Manager is a tmux-based orchestration server for managing Claude Code sessions. It provides real-time monitoring, ticket workflow management, and native apps for remote control.

## Repository Structure

```
claudePM/
├── server/                    # Node.js backend (Express + WebSocket)
│   └── CLAUDE.md              # Server-specific documentation
├── apps/
│   ├── desktop/               # Tauri desktop app (React + Tailwind)
│   │   └── CLAUDE.md          # Desktop app documentation
│   ├── ios/                   # Native iOS app (SwiftUI)
│   │   └── CLAUDE.md          # iOS app documentation
│   └── web/                   # DEPRECATED - not maintained
├── docs/
│   ├── jira-tickets/          # Implementation tickets
│   │   └── desktop-parity/    # Desktop app tickets (DWP-001+)
│   ├── plans/                 # Design documents
│   ├── ai-context/            # Handoff documents
│   └── api-reference.md       # Full REST API documentation
└── README.md
```

## Tech Stack Summary

| Component | Stack |
|-----------|-------|
| **Server** | Node.js 20+, Express, PostgreSQL + Prisma, WebSocket (ws), Zod, Vitest |
| **Desktop** | Tauri 2.x, React 18, TypeScript, Tailwind CSS v4, React Query, Vite |
| **iOS** | Swift 5.9+, SwiftUI, iOS 17+ (targeting iOS 26 Liquid Glass) |

For detailed stack information, see each component's CLAUDE.md.

## Quick Start

```bash
# Terminal 1: Start server
cd server && npm run dev

# Terminal 2: Start desktop app
cd apps/desktop && npm run tauri dev

# Or iOS: Open in Xcode
open apps/ios/ClaudePM.xcodeproj
```

## Component Documentation

Each subdirectory has its own CLAUDE.md with detailed documentation:

| Component | Documentation | Covers |
|-----------|---------------|--------|
| **Server** | `server/CLAUDE.md` | API routes, services, WebSocket, ticket system, session lifecycle, Prisma schema |
| **Desktop** | `apps/desktop/CLAUDE.md` | React patterns, styling (Tailwind v4 theme), WebSocket client, routes |
| **iOS** | `apps/ios/CLAUDE.md` | SwiftUI patterns, terminal view, Xcode project setup, API models |

## Code Conventions (Project-Wide)

### Naming
- **Files**: `kebab-case.ts` (server/desktop), `PascalCase.swift` (iOS)
- **Functions**: `camelCase`
- **Types/Interfaces**: `PascalCase`
- **Constants**: `SCREAMING_SNAKE_CASE`

### ESM Requirements (Server & Desktop)
- Use `.js` extension in imports even for `.ts` files
- Use `import`/`export`, never `require`

```typescript
// Correct
import { env } from './config/env.js';

// Wrong - will fail at runtime
import { env } from './config/env';
```

### Architecture Patterns (Server)
- **API routes**: Thin, delegate to services
- **Services**: Business logic, testable, no HTTP concerns
- **Validation**: Use Zod at API boundaries

## Key Server Endpoints

Full API documentation: **`docs/api-reference.md`**

| Endpoint | Purpose |
|----------|---------|
| `GET /api/projects/:id/tickets` | List tickets with filtering, pagination, sorting |
| `POST /api/tickets/:id/start` | Start Claude session for ticket |
| `POST /api/sessions/:id/input` | Send input to session |
| `GET /api/sessions/:id/output` | Get terminal output |
| `POST /api/hooks/claude` | Receive Claude Code hook events |
| `WS /` | WebSocket for real-time updates |

## Claude Session Spawning

Sessions are started via tmux in `server/src/services/session-supervisor.ts`:

```typescript
claudeCommand = `claude "${escapedPrompt}" --allowedTools Edit Read Write Bash Grep Glob`;
// Executed via: tmux split-window -t <target> -c <projectRepoPath> <claudeCommand>
```

**Key points:**
- Prompt MUST come BEFORE `--allowedTools` flag
- Working directory set to project's `repoPath` (CLAUDE.md loads from here)
- Escape `\` and `"` in prompts for shell safety
- Ticket sessions include `---TASK_COMPLETE---` marker instruction

## Environment Variables

Copy `.env.example` to `.env` in the server directory:

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

## Native App Authentication

When `API_KEY` env var is set on the server:
- HTTP requests require `X-API-Key` header
- WebSocket connections require `?apiKey=xxx` query parameter
- Without `API_KEY` configured, auth is disabled (development mode)

## Common Pitfalls

- **ESM imports require `.js` extension** even for `.ts` files
- **Claude CLI prompt must come BEFORE `--allowedTools`** or the flag won't work
- **Prisma client must be regenerated** after schema changes: `npm run db:generate`
- **tmux pane IDs start with `%`** (e.g., `%42`)
- **WebSocket clients must use singleton pattern** to avoid reconnect loops

## Implementation Status

See `docs/jira-tickets/README.md` for full roadmap.

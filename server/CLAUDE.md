# Claude PM Server

## Overview
Node.js backend for Claude Session Manager. Provides REST API, WebSocket real-time updates, and orchestrates Claude Code sessions via tmux.

## Quick Reference

### Directory Structure
```
src/
├── api/              # Express routers (thin, delegates to services)
│   ├── projects.ts   # CRUD for projects
│   ├── tickets.ts    # Ticket management & state transitions
│   ├── sessions.ts   # Session lifecycle (start/stop/input)
│   └── hooks.ts      # Claude Code hook receiver
├── services/         # Business logic (where most code lives)
│   ├── session-supervisor.ts    # Session lifecycle, tmux pane management
│   ├── ticket-state-machine.ts  # Ticket state transitions
│   ├── reviewer-subagent.ts     # Auto-reviews via Claude CLI
│   ├── session-analyzer.ts      # AI summaries (Claude Agent SDK)
│   ├── waiting-detector.ts      # Detects when Claude needs input
│   ├── auto-handoff.ts          # Context handoff between sessions
│   ├── notification-service.ts  # Centralized notifications
│   ├── tmux.ts                  # Low-level tmux commands
│   └── *-types.ts               # Types/errors for each service
├── websocket/        # WebSocket server
│   ├── server.ts     # WebSocketManager, message routing
│   └── types.ts      # Message schemas (Zod)
├── config/           # Configuration
│   ├── env.ts        # Environment config (Zod validated)
│   └── db.ts         # Prisma client singleton
└── utils/            # Shared utilities
    └── typed-event-emitter.ts  # Generic typed EventEmitter
```

### Most Commonly Modified Files
| Task | Primary File(s) |
|------|-----------------|
| Change Claude prompts | `session-supervisor.ts` → `buildClaudeCommand()` |
| Add new ticket states | `prisma/schema.prisma` + `ticket-state-machine.ts` |
| Modify session lifecycle | `session-supervisor.ts` |
| Add new WebSocket messages | `websocket/types.ts` + `websocket/server.ts` |
| Add new API endpoint | `api/*.ts` (router) + `services/*.ts` (logic) |
| Change review behavior | `reviewer-subagent.ts` + `reviewer-subagent-types.ts` |

## Tech Stack
- **Runtime**: Node.js 20+ with ESM
- **Framework**: Express 4.21
- **Database**: PostgreSQL + Prisma ORM
- **WebSocket**: ws library
- **Validation**: Zod

## Ticket System

### Ticket Types
Tickets have two boolean flags that affect behavior:

| Flags | Behavior | Claude Prompt |
|-------|----------|---------------|
| `isExplore=true` | Research only | "Do NOT implement anything. This is a research/exploration session only." |
| `isAdhoc=true` | Wait for confirmation | "Summarize what's being requested... wait for my confirmation before implementing." |
| Both false (regular) | Research then propose | "Research the problem... propose next steps" |

### Ticket States
```
backlog → in_progress → review → done
                ↓          ↓
            (rejected) → backlog
```

Transitions are managed by `ticketStateMachine` in `ticket-state-machine.ts`.

### Session-Ticket Relationship
- Each ticket can have multiple sessions (retries, handoffs)
- Sessions track `ticketId` (nullable for adhoc sessions)
- When a session completes, reviewer subagent evaluates the ticket

## Session System

### Session Lifecycle
```
1. Start: sessionSupervisor.startTicketSession() or startSession()
   └─ Creates tmux pane with Claude CLI command
   └─ Registers in memory + database
   └─ Starts waiting detector monitoring

2. Running: Output captured every 1s, process monitored every 2s
   └─ WebSocket broadcasts output to subscribed clients
   └─ Waiting detector checks for input prompts

3. Stop: sessionSupervisor.stopSession()
   └─ Sends Ctrl+C, waits 5s grace period, force kills if needed
   └─ Updates database status to 'completed'
```

### How Sessions Start Claude (session-supervisor.ts:buildClaudeCommand)
The `buildClaudeCommand()` method builds the CLI command based on ticket type:
```typescript
// Regular ticket example:
claude "Read the ticket at docs/tickets/CSM-001.md. The ticket is: Add feature X

1. Research the problem - understand what's being asked
2. Find relevant files and code in the codebase
3. If web research would help, use it
4. Ask any clarifying questions
5. Summarize findings and propose next steps

IMPORTANT: When you have completed ALL requirements, output exactly:
---TASK_COMPLETE---
Followed by a brief summary." --allowedTools Edit Read Write Bash Grep Glob
```

### Session Input Methods
| Method | Use Case | Implementation |
|--------|----------|----------------|
| `sendInput(sessionId, text)` | Send text + Enter | `tmux.sendText()` |
| `sendRawKeys(sessionId, keys)` | Raw terminal input | `tmux.sendRawKeys()` (hex encoded) |
| `sendKeys(sessionId, keys)` | tmux key sequences | `tmux.sendKeys()` for PgUp, C-a, etc. |

## Database Schema (Quick Reference)

### Core Models
```
Project
├── id, name, repoPath (unique)
├── tmuxSession, tmuxWindow
├── ticketsPath, handoffPath
└── has many: Tickets, Sessions

Ticket
├── id, projectId, externalId (e.g., "CSM-001")
├── title, state (backlog/in_progress/review/done)
├── filePath (markdown file location)
├── isAdhoc, isExplore (behavior flags)
└── has many: Sessions, ReviewResults

Session
├── id, projectId, ticketId (nullable)
├── type (ticket/adhoc), status (running/paused/completed/error)
├── tmuxPaneId, claudeSessionId
├── contextPercent (0-100)
└── has: SummaryCache, ReviewCache
```

### Key Enums
```typescript
TicketState: 'backlog' | 'in_progress' | 'review' | 'done'
SessionStatus: 'running' | 'paused' | 'completed' | 'error'
ReviewDecision: 'complete' | 'not_complete' | 'needs_clarification'
```

## Key Services

| Service | File | Purpose |
|---------|------|---------|
| `sessionSupervisor` | `session-supervisor.ts` | Manages Claude sessions in tmux |
| `reviewerSubagent` | `reviewer-subagent.ts` | Auto-reviews tickets on idle |
| `sessionAnalyzer` | `session-analyzer.ts` | Generates summaries/reports (Haiku) |
| `notificationService` | `notification-service.ts` | Centralized notification handling |
| `ticketStateMachine` | `ticket-state-machine.ts` | Ticket state transitions |
| `waitingDetector` | `waiting-detector.ts` | Detects Claude waiting for input |

### Service Communication Pattern
Services are singletons that communicate via events:
```typescript
// Service emits events
sessionSupervisor.emit('session:stateChange', { sessionId, newStatus });

// Other services/WebSocket listen
sessionSupervisor.on('session:stateChange', (event) => {
  wsManager.broadcast('session:status', event);
});
```

## Notification System

All notifications flow through `NotificationService` (`src/services/notification-service.ts`).

### Architecture
```
Event (review complete, handoff, etc.)
    │
    ▼
NotificationService.notifyX()
    │
    ├─► Database (Prisma)
    ├─► WebSocket broadcast (all clients)
    └─► Push notification (mobile devices)
```

### API
```typescript
// Centralized methods - use these instead of direct prisma.notification calls
notificationService.notifyReviewReady(ticketId, identifier, reasoning)
notificationService.notifyNotComplete(ticketId, identifier, reasoning)
notificationService.notifyNeedsClarification(ticketId, identifier, reasoning)
notificationService.notifyWaitingInput(sessionId, reason)
notificationService.notifyHandoffComplete(sessionId, message)
notificationService.notifyContextLow(sessionId, ticketId, percent)
notificationService.notifyError(message, sessionId?, ticketId?)
```

### WebSocket Message
When notifications are created/updated, broadcasts to all clients:
```json
{
  "type": "notification",
  "payload": {
    "id": "uuid",
    "title": "Ready for Review",
    "body": "Ticket CSM-001 is ready for review...",
    "timestamp": "2025-01-01T00:00:00Z"
  }
}
```

### Consumers
- `reviewer-subagent.ts` - Review complete/not_complete/needs_clarification
- `auto-handoff.ts` - Handoff complete/failed
- `websocket/server.ts` - Session waiting state

## WebSocket System

Real-time communication between server and clients (web/desktop apps).

### Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                     WebSocketManager                         │
│                   (singleton instance)                       │
├─────────────────────────────────────────────────────────────┤
│  connections: Map<connectionId, WebSocket>                  │
│  sessionSubscriptions: Map<sessionId, Set<WebSocket>>       │
├─────────────────────────────────────────────────────────────┤
│  Event Listeners:                                           │
│  - sessionSupervisor → session:output, session:stateChange  │
│  - waitingDetector → waiting:stateChange                    │
│  - ticketStateMachine → ticket:stateChange                  │
│  - ptyManager → pty:data, pty:exit                          │
└─────────────────────────────────────────────────────────────┘
```

### Key Files
| File | Purpose |
|------|---------|
| `src/websocket/server.ts` | WebSocketManager class, message routing |
| `src/websocket/types.ts` | Message schemas (Zod), type definitions |

### Connection Lifecycle
1. Client connects to `ws://host:port` (or `wss://` for TLS)
2. If `API_KEY` env is set, non-localhost clients must pass `?apiKey=xxx`
3. Server assigns unique `connectionId`, stores in `connections` map
4. Server pings every 30s; terminates unresponsive connections
5. On disconnect, cleanup subscriptions and PTY attachments

### Configuration (`DEFAULT_WS_CONFIG`)
```typescript
pingInterval: 30_000,        // Ping every 30s
connectionTimeout: 60_000,   // Terminate after 60s no pong
maxMessageSize: 65_536,      // 64KB max message
rateLimitMaxMessages: 100,   // Max 100 messages per window
rateLimitWindow: 10_000,     // 10s rate limit window
```

### Message Types

**Client → Server:**
| Type | Purpose |
|------|---------|
| `session:subscribe` | Subscribe to session updates |
| `session:unsubscribe` | Unsubscribe from session |
| `session:input` | Send text input to session (with Enter) |
| `session:keys` | Send raw keystrokes to session |
| `ping` | Heartbeat (server responds with `pong`) |
| `pty:attach` | Attach to session PTY for terminal emulation |
| `pty:detach` | Detach from PTY |
| `pty:data` | Send data to PTY |
| `pty:resize` | Resize PTY terminal |

**Server → Client:**
| Type | Purpose |
|------|---------|
| `session:output` | Terminal output lines |
| `session:status` | Session state change (running→completed, etc.) |
| `session:waiting` | Claude waiting for input |
| `ticket:state` | Ticket state transition |
| `notification` | User notification |
| `ai:analysis_status` | Summary/report generation status |
| `review:result` | Subagent review decision |
| `pty:attached` | PTY attach confirmation |
| `pty:output` | PTY terminal output |
| `pong` | Response to ping |
| `error` | Error message |

### Client Implementation (Important)

**Clients MUST use singleton pattern for WebSocket connection.**

Bad (causes reconnect loops):
```typescript
// DON'T: Connection in useEffect with store dependencies
function useWebSocket() {
  const updateStore = useStore(s => s.update);
  useEffect(() => {
    const ws = new WebSocket(url);  // New connection on every render
    return () => ws.close();
  }, [updateStore]);  // Re-runs when store changes!
}
```

Good (singleton manager):
```typescript
// DO: Single manager instance, hooks subscribe to it
const wsManager = new WebSocketManager();  // Module-level singleton

function useWebSocket() {
  const state = useSyncExternalStore(
    (cb) => wsManager.subscribe(cb),
    () => wsManager.getState()
  );
}
```

See `apps/desktop/src/hooks/useWebSocket.ts` for reference implementation.

## Review Flow

```
Idle 60s → Reviewer Subagent (Claude CLI)
                │
                ▼
         Decision + Reasoning
                │
    ┌───────────┼───────────┐
    ▼           ▼           ▼
 Save to    WebSocket    Notification
    DB       event        Service
                │
                ▼
        If COMPLETE:
        ├─ State → review
        ├─ Generate summary (Haiku)
        └─ Generate review report (Haiku)
```

## Common Patterns

### Error Handling
Each service has a `*-types.ts` file with custom error classes:
```typescript
// session-supervisor-types.ts
export class SessionNotFoundError extends Error { ... }
export class SessionAlreadyRunningError extends Error { ... }

// Usage in service
if (!session) throw new SessionNotFoundError(sessionId);

// API routes catch and return appropriate HTTP status
```

### Adding a New Service
1. Create `src/services/my-service.ts` and `src/services/my-service-types.ts`
2. Export singleton: `export const myService = new MyService();`
3. If it emits events, extend `TypedEventEmitter<MyServiceEvents>`
4. Initialize in `src/index.ts` if it needs startup logic

### Prisma Patterns
```typescript
// Always use the singleton
import { prisma } from '../config/db.js';

// Transactions for multi-step operations
await prisma.$transaction([
  prisma.ticket.update({ ... }),
  prisma.ticketStateHistory.create({ ... }),
]);
```

## Important Gotchas

1. **ESM imports require `.js` extension** even for `.ts` files:
   ```typescript
   import { foo } from './bar.js';  // Correct
   import { foo } from './bar';     // Wrong - will fail at runtime
   ```

2. **Claude CLI prompt must come BEFORE `--allowedTools`** or the flag won't work:
   ```bash
   claude "prompt here" --allowedTools Edit Read  # Correct
   claude --allowedTools Edit Read "prompt here"  # Wrong
   ```

3. **tmux pane IDs start with `%`** (e.g., `%42`). Placeholder IDs like `'claude-code'` indicate external sessions.

4. **Session resolution for hooks** uses multiple fallbacks (claudeSessionId → cwd → last active). See `waiting-detector.ts:resolveSessionFromHook()`.

5. **Prisma client must be regenerated** after schema changes: `npm run db:generate`

## API Reference

Full REST API documentation is in `docs/api-reference.md`. Key highlights:

### Ticket Listing (commonly used)
```
GET /api/projects/:id/tickets?prefixes=CSM,DWP&state=in_progress&excludeOldDone=true
```

Query params: `page`, `limit`, `state`, `prefixes`, `excludeOldDone`, `completedWithinDays`, date ranges, `orderBy`, `orderDir`, `sync`

### Session Control
```
POST /api/sessions/:id/input   # Send text + Enter
POST /api/sessions/:id/keys    # Send raw keys (C-c, etc.)
POST /api/sessions/:id/scroll  # Scroll terminal (up/down/exit)
GET  /api/sessions/:id/output  # Get terminal output
```

### Hooks (Claude Code integration)
```
POST /api/hooks/claude         # Notification/Stop events
POST /api/hooks/session-start  # Session registration
```

See `docs/api-reference.md` for complete endpoint documentation.

## Development
```bash
npm run dev          # Start with hot reload
npm run typecheck    # TypeScript check
npm run test:run     # Run tests
npm run db:push      # Push schema changes
npm run db:generate  # Regenerate Prisma client
npm run db:studio    # Open Prisma Studio
```

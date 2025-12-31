# Claude PM Server

## Overview
Node.js backend for Claude Session Manager. Provides REST API, WebSocket real-time updates, and orchestrates Claude Code sessions via tmux.

## Tech Stack
- **Runtime**: Node.js 20+ with ESM
- **Framework**: Express 4.21
- **Database**: PostgreSQL + Prisma ORM
- **WebSocket**: ws library
- **Validation**: Zod

## Key Services

| Service | File | Purpose |
|---------|------|---------|
| `sessionSupervisor` | `session-supervisor.ts` | Manages Claude sessions in tmux |
| `reviewerSubagent` | `reviewer-subagent.ts` | Auto-reviews tickets on idle |
| `sessionAnalyzer` | `session-analyzer.ts` | Generates summaries/reports (Haiku) |
| `notificationService` | `notification-service.ts` | Centralized notification handling |
| `ticketStateMachine` | `ticket-state-machine.ts` | Ticket state transitions |

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

## Development
```bash
npm run dev          # Start with hot reload
npm run typecheck    # TypeScript check
npm run test:run     # Run tests
npm run db:push      # Push schema changes
```

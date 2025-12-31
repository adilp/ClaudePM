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

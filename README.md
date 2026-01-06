# Claude PM

**Multi-platform orchestration system for managing Claude Code sessions with native iOS, macOS, and desktop apps.**

Control your Claude sessions from anywhere — your phone, your desktop, or the MacBook notch. Get real-time notifications when Claude needs input, manage tickets through a kanban board, and never lose context with automatic session handoff.

<p align="center">
  <img src="docs/images/CSM/CSM-001-project-scaffolding_01.png" width="280" alt="iOS Ticket View" />
  &nbsp;&nbsp;&nbsp;
  <img src="docs/images/adhoc/fix-desktop-notificaiton_01.png" width="380" alt="Desktop Notification" />
</p>

## Why Claude PM?

Running Claude Code in the terminal is great — until you step away and miss a question, or lose track of multiple sessions, or hit context limits mid-task.

Claude PM solves this by wrapping your tmux-based Claude sessions with:

- **Real-time notifications** — Get alerts on your phone or desktop when Claude needs input
- **Remote control** — Send input to any session from any device
- **Full terminal access** — Interactive PTY over WebSocket, same as being at your machine
- **Ticket workflows** — Track tasks from backlog through completion with automatic review
- **Context preservation** — Auto-handoff before overflow, with full session lineage tracking

## Native Apps

| Platform | Stack | Features |
|----------|-------|----------|
| **iOS** | SwiftUI, SwiftTerm | Full terminal, ticket kanban, real-time sync, deep linking |
| **macOS Desktop** | Tauri 2, React, TypeScript | Cross-platform, native notifications, git integration |
| **macOS Notch** | SwiftUI, DynamicNotchKit | Meeting alerts, session notifications in the notch area |

All apps share the same WebSocket connection with sub-second latency updates.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Your Mac                               │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                        tmux                             │   │
│   │   ┌───────────┐   ┌───────────┐   ┌───────────┐        │   │
│   │   │  Claude   │   │  Claude   │   │  Claude   │        │   │
│   │   │ Session 1 │   │ Session 2 │   │ Session 3 │        │   │
│   │   └───────────┘   └───────────┘   └───────────┘        │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              ↕                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │               Claude PM Server                          │   │
│   │                                                         │   │
│   │   REST API  ←→  PostgreSQL  ←→  Session Supervisor      │   │
│   │      ↓              ↓               ↓                   │   │
│   │   WebSocket     Prisma ORM      tmux I/O Capture        │   │
│   │                                 (10k line buffer)       │   │
│   └─────────────────────────────────────────────────────────┘   │
│                              ↕                                  │
└─────────────────────────────────────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ↓                     ↓                     ↓
   ┌───────────┐         ┌───────────┐         ┌───────────┐
   │    iOS    │         │  Desktop  │         │   Notch   │
   │    App    │         │   App     │         │  Center   │
   └───────────┘         └───────────┘         └───────────┘
```

## Key Features

### Session Management
- Spawn and monitor Claude Code sessions in tmux
- 10,000-line circular buffer captures all output
- Graceful shutdown with 5-second grace period
- Auto-discovery of manually created panes every 30s

### Real-Time WebSocket
- Singleton connection pattern prevents reconnect loops
- Smart subscriptions — only receive updates for sessions you're watching
- Exponential backoff reconnection (1s → 30s max)
- PTY support for full interactive terminal access

### Ticket Workflow
- State machine: `backlog` → `in_progress` → `review` → `done`
- Automated review after 60s idle — validates work against requirements
- Three ticket types: Regular, Explore (research-only), Adhoc
- Context monitoring with auto-handoff at 80% threshold

### Notifications
- Priority levels: low, normal, high, urgent
- Native notifications on desktop and iOS
- Unread badge counting
- "Input Required" alerts when Claude asks questions

## Tech Stack

| Component | Technologies |
|-----------|--------------|
| **Server** | Node.js 20+, Express, PostgreSQL, Prisma, WebSocket (ws), Zod, Vitest |
| **Desktop** | Tauri 2.x, React 18, TypeScript, Tailwind CSS v4, React Query, Vite |
| **iOS** | Swift 5.9+, SwiftUI, iOS 17+, SwiftTerm |
| **macOS Notch** | Swift 5.9+, SwiftUI, macOS 13+, DynamicNotchKit, EventKit |

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL
- tmux
- Xcode 15+ (for iOS/macOS apps)

### Server Setup

```bash
cd server
npm install
cp .env.example .env
# Edit .env with your DATABASE_URL

npm run db:migrate
npm run dev
```

### Desktop App

```bash
cd apps/desktop
npm install
npm run tauri dev
```

### iOS App

```bash
open apps/ios/ClaudePM.xcodeproj
# Build and run in Xcode
```

### Verify Installation

```bash
curl http://localhost:3000/api/health
# {"status":"ok","timestamp":"...","version":"0.1.0"}
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `HOST` | 0.0.0.0 | Server host |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `HANDOFF_THRESHOLD_PERCENT` | 20 | Context threshold for auto-handoff |
| `API_KEY` | — | Optional API key for native app auth |

When `API_KEY` is set, HTTP requests require `X-API-Key` header and WebSocket connections require `?apiKey=xxx` query parameter.

## Project Structure

```
claudePM/
├── server/                    # Node.js backend
│   ├── src/
│   │   ├── api/              # REST endpoints (60+ routes)
│   │   ├── services/         # Business logic
│   │   └── websocket/        # Real-time updates
│   └── prisma/               # Database schema
├── apps/
│   ├── desktop/              # Tauri + React desktop app
│   ├── ios/                  # Native SwiftUI iOS app
│   └── macos-notch/          # MacBook notch integration
└── docs/
    ├── api-reference.md      # Full API documentation
    └── jira-tickets/         # Implementation tickets
```

## API Highlights

| Endpoint | Description |
|----------|-------------|
| `GET /api/sessions` | List all sessions with status |
| `POST /api/sessions/:id/input` | Send input to a session |
| `GET /api/sessions/:id/output` | Get terminal output |
| `POST /api/tickets/:id/start` | Start Claude session for ticket |
| `WS /` | WebSocket for real-time updates |

See `docs/api-reference.md` for full API documentation.

## License

Private — Personal use only

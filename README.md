# Claude Session Manager

A tmux-based orchestration server for managing Claude Code sessions with real-time monitoring, ticket workflow management, and mobile/web clients.

## Features

- **Session Management**: Monitor and control Claude Code sessions running in tmux
- **Ticket Workflow**: Track ticket state from backlog through completion
- **Context Monitoring**: Track token usage and trigger auto-handoff before context overflow
- **Real-time Updates**: WebSocket-based live updates to connected clients
- **Remote Control**: Web and mobile interfaces for monitoring and input
- **Automatic Handoff**: Seamless context preservation across sessions

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Your Mac                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                     tmux                              │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐              │   │
│  │  │ Claude  │  │ Claude  │  │ Claude  │              │   │
│  │  │ Pane 1  │  │ Pane 2  │  │ Pane 3  │              │   │
│  │  └─────────┘  └─────────┘  └─────────┘              │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↕                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Session Manager Server                   │   │
│  │  • REST API    • WebSocket    • Session Supervisor   │   │
│  │  • PostgreSQL  • tmux I/O     • Notifications        │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↕                                   │
└─────────────────────────────────────────────────────────────┘
                           │
            ┌──────────────┼──────────────┐
            ↓              ↓              ↓
       ┌─────────┐   ┌─────────┐   ┌─────────┐
       │   Web   │   │ Mobile  │   │ Direct  │
       │  Client │   │   App   │   │  tmux   │
       └─────────┘   └─────────┘   └─────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL
- tmux

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd claudePM

# Install server dependencies
cd server
npm install

# Set up environment
cp .env.example .env
# Edit .env with your database URL

# Run database migrations
npm run db:migrate

# Start the server
npm run dev
```

### Verify Installation

```bash
# Server should be running
curl http://localhost:3000/api/health
# Returns: {"status":"ok","timestamp":"...","version":"0.1.0","uptime":...}
```

## Project Structure

```
claudePM/
├── server/                    # Node.js backend
│   ├── src/
│   │   ├── api/              # REST endpoints
│   │   ├── services/         # Business logic
│   │   ├── config/           # Configuration
│   │   └── websocket/        # Real-time updates
│   ├── prisma/               # Database schema
│   └── tests/                # Test suite
├── docs/
│   ├── jira-tickets/         # Implementation tickets
│   ├── plans/                # Design documents
│   └── ai-context/           # Session handoff docs
└── CLAUDE.md                 # AI assistant guidelines
```

## Development

```bash
cd server

# Development server with hot reload
npm run dev

# Run tests
npm run test:run

# Type checking
npm run typecheck

# Database management
npm run db:studio    # Open Prisma Studio
npm run db:migrate   # Run migrations
```

## Configuration

Environment variables (`.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `HOST` | 0.0.0.0 | Server host |
| `DATABASE_URL` | - | PostgreSQL connection string |
| `HANDOFF_THRESHOLD_PERCENT` | 20 | Context threshold for auto-handoff |
| `LOG_LEVEL` | info | Logging level |

## Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| 1. Foundation | Complete | Server scaffolding, database, tmux integration |
| 2. Session Core | Next | Session supervisor, context monitor, WebSocket |
| 3. Ticket Workflow | Pending | State machine, reviewer, auto-handoff |
| 4. Notifications | Pending | Push notifications, server discovery |
| 5. Web Client | Pending | React dashboard and session views |
| 6. Mobile Client | Pending | React Native app |

See `docs/jira-tickets/README.md` for detailed ticket breakdown.

## API Endpoints

### Health Check
```
GET /api/health
```

Returns server status, version, and uptime.

*More endpoints coming in subsequent tickets.*

## Contributing

1. Check `docs/jira-tickets/` for available work
2. Follow the dependency graph in `docs/jira-tickets/README.md`
3. Adhere to code conventions in `CLAUDE.md`
4. Write tests for new functionality

## License

Private - Personal use only

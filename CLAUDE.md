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
├── docs/
│   ├── jira-tickets/         # Implementation tickets (CSM-001 through CSM-025)
│   ├── plans/                # Design documents
│   └── ai-context/           # Handoff documents
└── README.md
```

## Tech Stack

- **Runtime**: Node.js 20+ with ESM modules
- **Language**: TypeScript 5.6 (strict mode)
- **Server**: Express 4.21
- **Database**: PostgreSQL with Prisma ORM
- **WebSocket**: ws library
- **Validation**: Zod
- **Testing**: Vitest

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
| `server/src/services/tmux.ts` | tmux integration service |
| `server/prisma/schema.prisma` | Database schema |

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
DATABASE_URL=postgresql://localhost:5432/claude_session_manager
HANDOFF_THRESHOLD_PERCENT=20
LOG_LEVEL=info
```

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

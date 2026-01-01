# Claude Session Manager - API Reference

This document describes the REST API endpoints for Claude Session Manager.

## Base URL

```
http://localhost:4847/api
```

## Authentication

### Public Endpoints
Most endpoints are accessible without authentication for local development.

### Protected Endpoints (Native Apps)
Endpoints under `/api/devices` require API key authentication when `API_KEY` environment variable is configured.

**Header:** `X-API-Key: <your-api-key>`

**Generating an API Key:**
```bash
openssl rand -hex 32
```

---

## Quick Reference

### Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sessions` | List all sessions |
| GET | `/sessions/:id` | Get session details |
| POST | `/projects/:id/sessions` | Start adhoc session |
| POST | `/sessions/:id/stop` | Stop session |
| POST | `/sessions/:id/input` | Send text input |
| POST | `/sessions/:id/keys` | Send raw keys |
| GET | `/sessions/:id/output` | Get terminal output |
| POST | `/sessions/sync` | Sync sessions with tmux |
| GET | `/sessions/:id/summary` | Get AI summary |
| GET | `/sessions/:id/review-report` | Get review report |
| POST | `/sessions/:id/commit-message` | Generate commit message |
| POST | `/sessions/:id/pr-description` | Generate PR description |
| GET | `/sessions/:id/activity` | Get activity events |
| POST | `/sessions/:id/ttyd` | Start ttyd instance |
| GET | `/sessions/:id/ttyd` | Get ttyd status |
| DELETE | `/sessions/:id/ttyd` | Stop ttyd instance |
| POST | `/sessions/:id/focus` | Focus tmux pane |
| POST | `/sessions/:id/scroll` | Scroll terminal |
| POST | `/sessions/:id/trigger-review` | Trigger manual review |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects` | List all projects |
| GET | `/projects/:id` | Get project details |
| POST | `/projects` | Create project |
| PATCH | `/projects/:id` | Update project |
| DELETE | `/projects/:id` | Delete project |

### Tickets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/:id/tickets` | List tickets (paginated, filterable) |
| GET | `/projects/:id/tickets/prefixes` | Get available prefixes for filtering |
| POST | `/projects/:id/sync-tickets` | Sync tickets from filesystem |
| GET | `/tickets/:id` | Get ticket details with content |
| POST | `/tickets/:id/start` | Start ticket session |
| POST | `/tickets/:id/approve` | Approve ticket |
| POST | `/tickets/:id/reject` | Reject ticket |
| PATCH | `/tickets/:id` | Update ticket state |
| GET | `/tickets/:id/sessions` | Get ticket sessions |
| GET | `/tickets/:id/history` | Get state transition history |
| POST | `/tickets/:id/restart` | Restart ticket |

### Adhoc Tickets
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects/:id/adhoc-tickets` | Create adhoc ticket |
| GET | `/tickets/:id/content` | Get ticket markdown content |
| PUT | `/tickets/:id/content` | Update ticket content |
| PATCH | `/tickets/:id/title` | Update ticket title |
| DELETE | `/tickets/:id` | Delete ticket |

### Git
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects/:id/git/diff` | Get git diff |
| GET | `/projects/:id/git/status` | Get git status |
| GET | `/projects/:id/git/branch` | Get current branch |
| POST | `/projects/:id/git/stage` | Stage specific files |
| POST | `/projects/:id/git/unstage` | Unstage specific files |
| POST | `/projects/:id/git/stage-all` | Stage all changes |
| POST | `/projects/:id/git/unstage-all` | Unstage all changes |
| POST | `/projects/:id/git/commit` | Commit staged changes |
| POST | `/projects/:id/git/push` | Push to remote |

### Hooks
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/hooks/claude` | Receive Claude hook events |
| POST | `/hooks/session-start` | Register session start |
| GET | `/hooks/health` | Hook endpoint health |

### tmux
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tmux/sessions` | List tmux sessions |
| GET | `/tmux/sessions/:name` | Get session details |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/notifications` | List notifications |
| GET | `/notifications/count` | Get unread count |
| DELETE | `/notifications/:id` | Delete notification |
| DELETE | `/notifications` | Delete all notifications |

### Devices
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/devices/register` | Register device token |
| DELETE | `/devices/:token` | Delete device token |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health check |

---

## Sessions

### List Sessions

**Endpoint:** `GET /api/sessions`

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `project_id` | string | Filter by project UUID |
| `status` | string | Filter by status: `running`, `paused`, `completed`, `error` |

**Response:** Array of session objects with project and ticket info.

---

### Get Session

**Endpoint:** `GET /api/sessions/:id`

**Response:**
```json
{
  "id": "uuid",
  "project_id": "uuid",
  "ticket_id": "uuid",
  "type": "ticket",
  "status": "running",
  "context_percent": 45,
  "pane_id": "%95",
  "started_at": "2025-12-30T18:00:00.000Z",
  "ended_at": null
}
```

---

### Start Session

Start an adhoc Claude session for a project.

**Endpoint:** `POST /api/projects/:id/sessions`

**Request Body:**
```json
{
  "initialPrompt": "Optional initial prompt for Claude"
}
```

---

### Stop Session

**Endpoint:** `POST /api/sessions/:id/stop`

**Request Body:**
```json
{
  "force": false
}
```

Gracefully stops session (Ctrl+C). If `force: true`, kills immediately.

---

### Send Input

Send text input to session (appends Enter key).

**Endpoint:** `POST /api/sessions/:id/input`

**Request Body:**
```json
{
  "text": "yes"
}
```

---

### Send Keys

Send raw keystrokes to session.

**Endpoint:** `POST /api/sessions/:id/keys`

**Request Body:**
```json
{
  "keys": "C-c"
}
```

Common keys: `C-c` (Ctrl+C), `C-d` (Ctrl+D), `Enter`, `Escape`, `C-a` (tmux prefix).

---

### Get Output

Get recent terminal output.

**Endpoint:** `GET /api/sessions/:id/output`

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `lines` | number | 50 | Number of lines to return |
| `offset` | number | 0 | Lines to skip from end |

---

### Sync Sessions

Sync session states with tmux (detects externally stopped sessions).

**Endpoint:** `POST /api/sessions/sync`

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `project_id` | string | Optional project filter |

---

### Get Summary

Get AI-generated session summary.

**Endpoint:** `GET /api/sessions/:id/summary`

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `regenerate` | boolean | Force regeneration |

---

### Get Review Report

Get AI-generated review report for ticket session.

**Endpoint:** `GET /api/sessions/:id/review-report`

---

### Generate Commit Message

**Endpoint:** `POST /api/sessions/:id/commit-message`

Returns suggested commit message based on session changes.

---

### Generate PR Description

**Endpoint:** `POST /api/sessions/:id/pr-description`

Returns suggested pull request description.

---

### Get Activity

**Endpoint:** `GET /api/sessions/:id/activity`

Returns activity events (actions taken, files changed).

---

### ttyd Management

**Start ttyd:** `POST /api/sessions/:id/ttyd`

Starts a ttyd instance for web terminal access.

**Get ttyd status:** `GET /api/sessions/:id/ttyd`

Returns `{ port: 7681, url: "http://host:7681" }` if running.

**Stop ttyd:** `DELETE /api/sessions/:id/ttyd`

---

### Focus Pane

**Endpoint:** `POST /api/sessions/:id/focus`

Focuses the tmux pane for this session.

---

### Scroll Terminal

**Endpoint:** `POST /api/sessions/:id/scroll`

**Request Body:**
```json
{
  "action": "up"
}
```

Actions: `up`, `down`, `exit` (exit scroll mode).

---

### Trigger Review

Manually trigger a review for the session.

**Endpoint:** `POST /api/sessions/:id/trigger-review`

---

## Projects

### List Projects

**Endpoint:** `GET /api/projects`

---

### Get Project

**Endpoint:** `GET /api/projects/:id`

---

### Create Project

**Endpoint:** `POST /api/projects`

**Request Body:**
```json
{
  "name": "My Project",
  "repoPath": "/path/to/repo",
  "tmuxSession": "my-session",
  "tmuxWindow": "optional-window",
  "ticketsPath": "docs/jira-tickets/",
  "handoffPath": "docs/ai-context/handoff.md"
}
```

---

### Update Project

**Endpoint:** `PATCH /api/projects/:id`

**Request Body:** (all fields optional)
```json
{
  "name": "New Name",
  "tmuxSession": "new-session",
  "tmuxWindow": "new-window"
}
```

---

### Delete Project

**Endpoint:** `DELETE /api/projects/:id`

---

## Tickets

**Note:** Tickets are created in two ways:
1. **Filesystem sync** - Markdown files in the project's `ticketsPath` are synced to the database. Use `POST /projects/:id/sync-tickets` or pass `sync=true` when listing.
2. **Adhoc tickets** - Quick tickets created via `POST /projects/:id/adhoc-tickets`. These are stored as markdown files with the `ADHOC` prefix.

### List Tickets

**Endpoint:** `GET /api/projects/:id/tickets`

Returns paginated ticket list with filtering, sorting, and optional filesystem sync.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 100) |
| `sync` | boolean | true | Sync from filesystem before listing |
| `state` | string | - | Filter: `backlog`, `in_progress`, `review`, `done` |
| `prefixes` | string | - | Comma-separated prefixes (e.g., `CSM,DWP`) |
| `excludeOldDone` | boolean | - | Hide done tickets older than 3 days |
| `completedWithinDays` | number | - | Only show done tickets completed within N days |
| `completedAfter` | ISO date | - | Filter by completion date |
| `completedBefore` | ISO date | - | Filter by completion date |
| `updatedAfter` | ISO date | - | Filter by update date |
| `updatedBefore` | ISO date | - | Filter by update date |
| `orderBy` | string | externalId | Sort by: `externalId`, `createdAt`, `updatedAt`, `completedAt` |
| `orderDir` | string | asc | Sort direction: `asc`, `desc` |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "external_id": "CSM-001",
      "title": "Ticket Title",
      "state": "in_progress",
      "file_path": "docs/jira-tickets/CSM-001.md",
      "prefix": "CSM",
      "is_adhoc": false,
      "is_explore": false,
      "started_at": "2025-12-30T18:00:00.000Z",
      "completed_at": null,
      "created_at": "2025-12-30T18:00:00.000Z",
      "updated_at": "2025-12-30T18:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "total_pages": 3
  }
}
```

---

### Get Ticket Prefixes

Get available ticket prefixes for filtering (e.g., CSM, DWP, ADHOC).

**Endpoint:** `GET /api/projects/:id/tickets/prefixes`

**Response:**
```json
{
  "data": ["CSM", "DWP", "ADHOC"]
}
```

---

### Sync Tickets

Sync tickets from filesystem (markdown files in ticketsPath).

**Endpoint:** `POST /api/projects/:id/sync-tickets`

**Response:**
```json
{
  "message": "Synced 5 tickets",
  "result": {
    "created": 2,
    "updated": 3,
    "deleted": 0,
    "errors": []
  }
}
```

---

### Get Ticket

**Endpoint:** `GET /api/tickets/:id`

Returns ticket details including markdown content.

---

### Start Ticket

Start a Claude session for this ticket.

**Endpoint:** `POST /api/tickets/:id/start`

---

### Approve Ticket

Move ticket from `review` to `done`.

**Endpoint:** `POST /api/tickets/:id/approve`

---

### Reject Ticket

Move ticket back to `backlog` with feedback.

**Endpoint:** `POST /api/tickets/:id/reject`

**Request Body:**
```json
{
  "feedback": "Reason for rejection"
}
```

---

### Update Ticket

**Endpoint:** `PATCH /api/tickets/:id`

---

### Get Ticket Sessions

**Endpoint:** `GET /api/tickets/:id/sessions`

---

### Restart Ticket

Start a new session for a ticket.

**Endpoint:** `POST /api/tickets/:id/restart`

---

## Adhoc Tickets

### Create Adhoc Ticket

**Endpoint:** `POST /api/projects/:id/adhoc-tickets`

**Request Body:**
```json
{
  "title": "Quick task",
  "content": "Markdown content for the ticket"
}
```

---

### Get Ticket Content

Get the markdown file content.

**Endpoint:** `GET /api/tickets/:id/content`

---

### Update Ticket Content

Update the markdown file.

**Endpoint:** `PUT /api/tickets/:id/content`

**Request Body:**
```json
{
  "content": "Updated markdown content"
}
```

---

### Update Ticket Title

**Endpoint:** `PATCH /api/tickets/:id/title`

**Request Body:**
```json
{
  "title": "New title"
}
```

---

### Delete Ticket

**Endpoint:** `DELETE /api/tickets/:id`

---

## Git

### Get Diff

**Endpoint:** `GET /api/projects/:id/git/diff`

Returns current git diff for the project.

---

### Get Status

**Endpoint:** `GET /api/projects/:id/git/status`

Returns git status (modified, staged, untracked files).

---

### Get Branch

**Endpoint:** `GET /api/projects/:id/git/branch`

Returns current branch name and recent commits.

---

### Stage Files

**Endpoint:** `POST /api/projects/:id/git/stage`

Stage specific files for commit.

**Request Body:**
```json
{
  "files": ["path/to/file1.ts", "path/to/file2.ts"]
}
```

**Response:**
```json
{
  "success": true,
  "files_staged": ["path/to/file1.ts", "path/to/file2.ts"]
}
```

---

### Unstage Files

**Endpoint:** `POST /api/projects/:id/git/unstage`

Unstage specific files.

**Request Body:**
```json
{
  "files": ["path/to/file1.ts"]
}
```

**Response:**
```json
{
  "success": true,
  "files_unstaged": ["path/to/file1.ts"]
}
```

---

### Stage All

**Endpoint:** `POST /api/projects/:id/git/stage-all`

Stage all changes (tracked and untracked).

**Response:**
```json
{
  "success": true,
  "files_staged": ["all"]
}
```

---

### Unstage All

**Endpoint:** `POST /api/projects/:id/git/unstage-all`

Unstage all staged files.

**Response:**
```json
{
  "success": true,
  "files_unstaged": ["all"]
}
```

---

### Commit

**Endpoint:** `POST /api/projects/:id/git/commit`

Commit staged changes with a message.

**Request Body:**
```json
{
  "message": "feat: add new feature"
}
```

**Response:**
```json
{
  "success": true,
  "hash": "abc1234",
  "message": "feat: add new feature"
}
```

---

### Push

**Endpoint:** `POST /api/projects/:id/git/push`

Push commits to remote.

**Request Body:**
```json
{
  "set_upstream": false
}
```

**Response:**
```json
{
  "success": true,
  "branch": "main"
}
```

---

## Hooks

Endpoints for Claude Code hook integration.

### Claude Hook

Receives Notification and Stop hooks from Claude Code.

**Endpoint:** `POST /api/hooks/claude`

**Request Body:** (from Claude Code stdin)
```json
{
  "session_id": "claude-session-id",
  "hook_event_name": "Notification",
  "notification_type": "permission_prompt",
  "cwd": "/path/to/project"
}
```

Always returns 200 to avoid hook failures.

---

### Session Start Hook

Registers a Claude session with the project.

**Endpoint:** `POST /api/hooks/session-start`

**Request Body:**
```json
{
  "session_id": "claude-session-id",
  "cwd": "/path/to/project",
  "transcript_path": "/path/to/transcript.jsonl"
}
```

---

### Hook Health

**Endpoint:** `GET /api/hooks/health`

---

## tmux

### List Sessions

**Endpoint:** `GET /api/tmux/sessions`

**Response:**
```json
[
  {
    "name": "my-project",
    "windows": 3,
    "created": "2025-12-30T18:00:00.000Z",
    "attached": true
  }
]
```

---

### Get Session Details

**Endpoint:** `GET /api/tmux/sessions/:name`

**Response:**
```json
{
  "name": "my-project",
  "windows": 3,
  "created": "2025-12-30T18:00:00.000Z",
  "attached": true,
  "windows_detail": [
    {
      "index": 0,
      "name": "main",
      "active": true,
      "panes": [
        { "id": "%42", "index": 0, "active": true, "pid": 12345 }
      ]
    }
  ]
}
```

---

## Notifications

### List Notifications

**Endpoint:** `GET /api/notifications`

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `unread` | boolean | Only return unread |

---

### Get Unread Count

**Endpoint:** `GET /api/notifications/count`

**Response:**
```json
{
  "count": 5
}
```

---

### Delete Notification

**Endpoint:** `DELETE /api/notifications/:id`

---

### Delete All Notifications

**Endpoint:** `DELETE /api/notifications`

---

## Devices

### Register Device Token

**Endpoint:** `POST /api/devices/register`

**Authentication:** Required (when API_KEY is configured)

**Request Body:**
```json
{
  "token": "64-char-hex-apns-token",
  "platform": "ios"
}
```

---

### Delete Device Token

**Endpoint:** `DELETE /api/devices/:token`

**Authentication:** Required (when API_KEY is configured)

---

## Health Check

**Endpoint:** `GET /api/health`

**Response:**
```json
{
  "status": "healthy",
  "uptime": 3600,
  "version": "0.1.0",
  "database": "connected",
  "tmux": "available",
  "timestamp": "2025-12-30T18:00:00.000Z"
}
```

---

## WebSocket API

Real-time updates via WebSocket connection.

**Endpoint:** `ws://localhost:4847`

**Authentication:** When `API_KEY` is configured:
```
ws://localhost:4847?apiKey=your-api-key
```

### Client → Server Messages

| Type | Payload | Description |
|------|---------|-------------|
| `session:subscribe` | `{ sessionId }` | Subscribe to session updates |
| `session:unsubscribe` | `{ sessionId }` | Unsubscribe from session |
| `session:input` | `{ sessionId, text }` | Send text input |
| `session:keys` | `{ sessionId, keys }` | Send raw keys |
| `ping` | - | Heartbeat |
| `pty:attach` | `{ sessionId }` | Attach to PTY |
| `pty:detach` | `{ sessionId }` | Detach from PTY |
| `pty:data` | `{ sessionId, data }` | Send PTY data |
| `pty:resize` | `{ sessionId, cols, rows }` | Resize terminal |

### Server → Client Messages

| Type | Description |
|------|-------------|
| `session:output` | Terminal output lines |
| `session:status` | Session state change |
| `session:waiting` | Claude waiting for input |
| `ticket:state` | Ticket state transition |
| `notification` | User notification |
| `ai:analysis_status` | Summary/report generation status |
| `review:result` | Subagent review decision |
| `pty:attached` | PTY attach confirmation |
| `pty:output` | PTY terminal output |
| `pong` | Response to ping |
| `error` | Error message |

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error type",
  "message": "Human-readable message",
  "details": {}
}
```

**HTTP Status Codes:**
| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing/invalid API key |
| 404 | Not Found - Resource doesn't exist |
| 409 | Conflict - Resource state conflict |
| 500 | Internal Server Error |

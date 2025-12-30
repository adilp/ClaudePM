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

**Environment Configuration:**
```bash
# In .env file
API_KEY=your-64-character-hex-key-here
```

**Error Response (401 Unauthorized):**
```json
{
  "error": "Unauthorized",
  "message": "Missing or invalid API key"
}
```

---

## Device Token Registration

Endpoints for managing APNs device tokens for push notifications. These endpoints are designed for native iOS/macOS apps.

### Register Device Token

Register or update a device token for push notifications.

**Endpoint:** `POST /api/devices/register`

**Authentication:** Required (when API_KEY is configured)

**Request Headers:**
```
Content-Type: application/json
X-API-Key: <api-key>
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | Yes | 64-character hex APNs device token |
| `platform` | string | No | Platform identifier: `ios`, `ipados`, `macos` (default: `ios`) |

**Example Request:**
```bash
curl -X POST http://localhost:4847/api/devices/register \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{
    "token": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    "platform": "ios"
  }'
```

**Success Response (200 OK):**
```json
{
  "success": true
}
```

**Error Responses:**

*400 Bad Request - Invalid token format:*
```json
{
  "error": "Validation error",
  "message": "Invalid APNs token format",
  "details": [
    {
      "validation": "regex",
      "code": "invalid_string",
      "message": "Invalid APNs token format",
      "path": ["token"]
    }
  ]
}
```

*401 Unauthorized - Missing or invalid API key:*
```json
{
  "error": "Unauthorized",
  "message": "Missing or invalid API key"
}
```

**Notes:**
- Token must be a 64-character hexadecimal string (case-insensitive)
- Duplicate registrations update `updatedAt` timestamp instead of creating duplicates
- Platform defaults to `ios` if not specified

---

### Delete Device Token

Remove a device token from the database (e.g., when user logs out or disables notifications).

**Endpoint:** `DELETE /api/devices/:token`

**Authentication:** Required (when API_KEY is configured)

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | string | 64-character hex APNs device token to delete |

**Example Request:**
```bash
curl -X DELETE http://localhost:4847/api/devices/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 \
  -H "X-API-Key: your-api-key-here"
```

**Success Response (200 OK):**
```json
{
  "success": true
}
```

**Error Responses:**

*400 Bad Request - Invalid token format:*
```json
{
  "error": "Validation error",
  "message": "Invalid APNs token format"
}
```

*404 Not Found - Token doesn't exist:*
```json
{
  "error": "Not found",
  "message": "Device token not found"
}
```

*401 Unauthorized - Missing or invalid API key:*
```json
{
  "error": "Unauthorized",
  "message": "Missing or invalid API key"
}
```

---

## Health Check

### Get Health Status

Check server health and connectivity status.

**Endpoint:** `GET /api/health`

**Authentication:** Not required

**Example Request:**
```bash
curl http://localhost:4847/api/health
```

**Success Response (200 OK):**
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

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `healthy` or `degraded` |
| `uptime` | number | Server uptime in seconds |
| `version` | string | Server version from package.json |
| `database` | string | `connected` or `disconnected` |
| `tmux` | string | `available` or `unavailable` |
| `timestamp` | string | ISO 8601 timestamp |

---

## Sessions

### List Sessions

Get all sessions with optional filtering.

**Endpoint:** `GET /api/sessions`

**Authentication:** Not required

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status: `running`, `paused`, `completed`, `error` |
| `projectId` | string | Filter by project UUID |

**Example Request:**
```bash
curl "http://localhost:4847/api/sessions?status=running"
```

**Success Response (200 OK):**
```json
[
  {
    "id": "uuid",
    "project_id": "uuid",
    "ticket_id": "uuid",
    "type": "ticket",
    "status": "running",
    "context_percent": 45,
    "pane_id": "%95",
    "started_at": "2025-12-30T18:00:00.000Z",
    "ended_at": null,
    "created_at": "2025-12-30T18:00:00.000Z",
    "updated_at": "2025-12-30T18:00:00.000Z",
    "project": {
      "id": "uuid",
      "name": "Project Name"
    },
    "ticket": {
      "id": "uuid",
      "external_id": "TICKET-001",
      "title": "Ticket Title"
    }
  }
]
```

---

### Get Session by ID

Get detailed information about a specific session.

**Endpoint:** `GET /api/sessions/:id`

**Authentication:** Not required

**Example Request:**
```bash
curl http://localhost:4847/api/sessions/uuid-here
```

---

## Projects

### List Projects

Get all registered projects.

**Endpoint:** `GET /api/projects`

**Authentication:** Not required

**Example Request:**
```bash
curl http://localhost:4847/api/projects
```

**Success Response (200 OK):**
```json
[
  {
    "id": "uuid",
    "name": "Project Name",
    "repo_path": "/path/to/repo",
    "tickets_path": "docs/jira-tickets/",
    "handoff_path": "docs/ai-context/handoff.md",
    "tmux_session": "session-name",
    "tmux_window": "window-name",
    "created_at": "2025-12-30T18:00:00.000Z",
    "updated_at": "2025-12-30T18:00:00.000Z"
  }
]
```

---

### Create Project

Register a new project.

**Endpoint:** `POST /api/projects`

**Authentication:** Not required

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Project display name |
| `repoPath` | string | Yes | Absolute path to repository |
| `ticketsPath` | string | No | Relative path to tickets (default: `docs/jira-tickets/`) |
| `handoffPath` | string | No | Relative path to handoff file (default: `docs/ai-context/handoff.md`) |
| `tmuxSession` | string | Yes | tmux session name |
| `tmuxWindow` | string | No | tmux window name |

**Example Request:**
```bash
curl -X POST http://localhost:4847/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Project",
    "repoPath": "/Users/me/projects/my-project",
    "tmuxSession": "my-project"
  }'
```

---

## Tickets

### List Tickets

Get tickets for a project.

**Endpoint:** `GET /api/projects/:id/tickets`

**Authentication:** Not required

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `state` | string | Filter by state: `backlog`, `in_progress`, `review`, `done` |
| `prefix` | string | Filter by ticket prefix (e.g., `CSM`) |

**Example Request:**
```bash
curl "http://localhost:4847/api/projects/uuid/tickets?state=in_progress"
```

---

### Start Ticket

Start working on a ticket (creates a new Claude session).

**Endpoint:** `POST /api/tickets/:id/start`

**Authentication:** Not required

**Example Request:**
```bash
curl -X POST http://localhost:4847/api/tickets/uuid/start
```

---

### Approve Ticket

Approve a ticket in review state.

**Endpoint:** `POST /api/tickets/:id/approve`

**Authentication:** Not required

---

### Reject Ticket

Reject a ticket with feedback.

**Endpoint:** `POST /api/tickets/:id/reject`

**Authentication:** Not required

**Request Body:**
```json
{
  "feedback": "Reason for rejection"
}
```

---

## Notifications

### List Notifications

Get all notifications.

**Endpoint:** `GET /api/notifications`

**Authentication:** Not required

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `unread` | boolean | If `true`, only return unread notifications |

---

### Mark Notification as Read

**Endpoint:** `PATCH /api/notifications/:id/read`

**Authentication:** Not required

---

### Mark All as Read

**Endpoint:** `POST /api/notifications/mark-all-read`

**Authentication:** Not required

---

## WebSocket API

Real-time updates are available via WebSocket connection.

**Endpoint:** `ws://localhost:4847`

**Authentication:** When `API_KEY` is configured, include it as query parameter:
```
ws://localhost:4847?apiKey=your-api-key
```

**Message Types:**

*Subscribe to session output:*
```json
{
  "type": "subscribe",
  "sessionId": "uuid"
}
```

*Unsubscribe from session:*
```json
{
  "type": "unsubscribe",
  "sessionId": "uuid"
}
```

*Session output event:*
```json
{
  "type": "session:output",
  "sessionId": "uuid",
  "output": "terminal output lines..."
}
```

*Session status change:*
```json
{
  "type": "session:status",
  "sessionId": "uuid",
  "status": "completed"
}
```

*Notification event:*
```json
{
  "type": "notification",
  "notification": {
    "id": "uuid",
    "type": "review_ready",
    "message": "Session completed, ready for review"
  }
}
```

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error type",
  "message": "Human-readable error message",
  "details": {}  // Optional additional details
}
```

**Common HTTP Status Codes:**
| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing or invalid API key |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |

---

## Database Schema

### DeviceToken

Stores APNs device tokens for push notifications.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `token` | VARCHAR(255) | Unique APNs device token |
| `platform` | VARCHAR(50) | Platform: ios, ipados, macos |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |

**Prisma Schema:**
```prisma
model DeviceToken {
  id        String   @id @default(uuid()) @db.Uuid
  token     String   @unique @db.VarChar(255)
  platform  String   @default("ios") @db.VarChar(50)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("device_tokens")
}
```

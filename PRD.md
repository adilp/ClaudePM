# Product Requirements Document: Claude Session Manager

## Overview

**Product Name:** Claude Session Manager (working title)

**Vision:** A project management and remote access layer for Claude Code that enables developers to manage agentic coding sessions from anywhere, with proper checkpoints, context management, and human-in-the-loop review.

**Problem Statement:** Developers using Claude Code for agentic coding face several friction points:
1. No way to monitor or course-correct sessions when away from the terminal
2. Manual context window management—must watch context % and trigger handoffs manually
3. No structured way to track ticket progress across sessions
4. Context handoffs require manual export/import workflow
5. No centralized view of what Claude did, what's pending review, and what's done

**Target User:** Solo developers or small teams using Claude Code with a ticket-based workflow who want to:
- Monitor and control Claude sessions from mobile devices
- Automate context handoffs while maintaining oversight
- Track work progress with demoable deliverables as checkpoints

---

## Technical Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Backend | Node.js | Real-time streaming, process management, JS ecosystem |
| Web Frontend | React | User familiarity, component ecosystem |
| Mobile Frontend | React Native | Code sharing with web, cross-platform |
| Database | PostgreSQL | Relational structure for tickets/sessions, robust |
| Real-time | WebSocket | Bi-directional streaming for output/input |
| Push Notifications | Firebase Cloud Messaging (or APNs) | Cross-platform push support |

**Deployment (v1):** Local Mac (Apple Silicon), accessible on local network
**Deployment (future):** Remote access with authentication

---

## Core Concepts

### Project
A git repository registered with the system. Contains:
- Path to repo root
- Reference to ticket location (`<repo>/docs/jira-tickets/`)
- Reference to handoff location (`<repo>/docs/ai-context/handoff.md`)
- Associated sessions

### Ticket
A unit of work with a demoable deliverable. Stored as markdown in the repo.
- **Location:** `<repo>/docs/jira-tickets/<ticket-id>.md`
- **States:** `backlog` → `in_progress` → `review` → `done`
- **Transitions:**
  - `backlog → in_progress`: Automatic when session starts working on ticket
  - `in_progress → review`: Automatic when Claude indicates completion
  - `review → done`: Manual (requires human approval)
  - `review → in_progress`: Manual (rejection with feedback)

### Session
A Claude Code process working in a project context.
- Tied to one ticket at a time
- Has context usage tracking
- Can span handoffs (session lineage)
- Captures full output stream

### Handoff
An automated context transfer when approaching context limits.
- Triggers at configurable threshold (default: 20% remaining)
- Executes user's existing `/export-handoff` command
- Starts new session with `/import-handoff` command
- Maintains ticket continuity
- Logs transition for audit trail

---

## Features (v1 - Essential)

### F1: Output Streaming
**Description:** Real-time streaming of Claude Code output to web and mobile clients.

**Requirements:**
- Capture stdout/stderr from Claude Code process
- Stream via WebSocket to connected clients
- Buffer recent output for clients that connect mid-session
- Support multiple simultaneous viewers
- Render with appropriate formatting (ANSI colors, code blocks)

**Acceptance Criteria:**
- [ ] Output appears within 100ms of Claude generating it
- [ ] Scrollback buffer of at least 10,000 lines
- [ ] Mobile client renders output readably

### F2: Input Injection
**Description:** Allow users to send messages to Claude Code from any client.

**Requirements:**
- Text input on web and mobile clients
- Inject into Claude Code's stdin
- Support for quick action buttons (common commands)
- Input history per session

**Quick Actions (configurable):**
- "Stop"
- "Run tests"
- "Show the plan"
- "Continue"
- "Commit current changes"

**Acceptance Criteria:**
- [ ] Messages appear in Claude's context within 500ms
- [ ] Quick actions work with single tap
- [ ] Typing on mobile is functional (but optimize for minimal typing)

### F3: Ticket State Management
**Description:** Track tickets through their lifecycle with automatic state transitions.

**Requirements:**
- Parse ticket markdown files from repo
- Display tickets grouped by state (kanban-style optional, list view default)
- Automatic transitions:
  - → `in_progress` when Claude starts working
  - → `review` when Claude indicates done (parse output for signals)
- Manual transitions:
  - `review` → `done` (approve button)
  - `review` → `in_progress` (reject with feedback form)
- Persist state in database (source of truth, not the markdown file)

**Done Signal Detection:**
Claude outputs to watch for (configurable):
- "Task complete"
- "Ready for review"
- "All tests passing"
- "Finished implementing"

**Acceptance Criteria:**
- [ ] Tickets sync from repo on project registration
- [ ] State changes reflect within 2 seconds
- [ ] Reject feedback is injected into Claude session automatically

### F4: Context Monitoring
**Description:** Track and display Claude Code's context window usage.

**Requirements:**
- Poll or parse context indicator from Claude Code
- Display prominently in UI (percentage + visual bar)
- Configurable threshold for "low context" warning (default: 20%)
- Trigger auto-handoff at threshold

**Acceptance Criteria:**
- [ ] Context % updates at least every 30 seconds
- [ ] Visual indicator changes color at warning threshold
- [ ] Accurate within 5% of actual context usage

### F5: Auto-Handoff
**Description:** Automatically handle context window exhaustion without losing progress.

**Requirements:**
- Detect when context falls below threshold
- Execute user's `/export-handoff` custom command
- Terminate current Claude Code process gracefully
- Start new Claude Code process in same directory
- Execute `/import-handoff` custom command
- Resume working on same ticket
- Log handoff event with metadata (context %, timestamp, session IDs)
- Send push notification that handoff occurred

**Acceptance Criteria:**
- [ ] Handoff completes without human intervention
- [ ] No work lost during handoff
- [ ] New session continues ticket automatically
- [ ] Handoff logged and visible in session history

### F6: Push Notifications
**Description:** Alert users to important events when away from the app.

**Notification Triggers:**
| Event | Priority | Message Example |
|-------|----------|-----------------|
| Ticket moved to review | High | "PROJ-123 ready for review" |
| Context low (threshold hit) | Medium | "Session context at 18%, handoff starting" |
| Handoff completed | Low | "Handoff complete, new session started" |
| Session error/stuck | High | "Session error: [error message]" |
| Claude waiting for input | Medium | "Claude is waiting for your response" |

**Requirements:**
- Firebase Cloud Messaging for cross-platform
- Notification preferences (which events, quiet hours)
- Tap notification → deep link to relevant screen

**Acceptance Criteria:**
- [ ] Notifications arrive within 10 seconds of event
- [ ] Tapping notification opens correct context
- [ ] Can disable specific notification types

### F7: Diff View
**Description:** On-demand view of code changes for review.

**Requirements:**
- Button to trigger `git diff` in session's repo
- Render with syntax highlighting
- Collapsible by file
- Show diff since ticket started (tag/timestamp reference)
- Mobile-friendly rendering (horizontal scroll for long lines)

**Implementation Notes:**
- User works with trunk-based development (stacked diffs)
- Commits go directly to main/master
- Diff should show uncommitted changes + commits since ticket started

**Acceptance Criteria:**
- [ ] Diff loads within 3 seconds
- [ ] Syntax highlighting for common languages
- [ ] Readable on mobile screen

### F8: Review/Approve Flow
**Description:** Human checkpoint before marking tickets done.

**Review Screen Shows:**
1. Claude's summary of work done (parsed from output or requested)
2. Test results (if available)
3. Diff since ticket started
4. Approve / Reject buttons

**Approve Flow:**
1. User taps "Approve"
2. Ticket state → `done`
3. Session can pick up next ticket or idle

**Reject Flow:**
1. User taps "Reject"
2. Feedback form appears
3. User enters feedback
4. Feedback injected into Claude session
5. Ticket state → `in_progress`
6. Claude resumes with feedback context

**Acceptance Criteria:**
- [ ] All review information on single screen (scrollable)
- [ ] Reject feedback successfully reaches Claude
- [ ] Approve updates ticket state immediately

---

## Features (v2 - Nice to Have)

### F9: Multiple Parallel Sessions
Run multiple Claude sessions per project (e.g., one on feature, one on tests).

### F10: Ticket Time Tracking
Track time spent per ticket across sessions for estimation improvement.

### F11: Historical Session Browser
Browse past sessions, search output, view handoff lineage.

### F12: Desktop App (Electron)
Native Mac app for local use, wrapping the web UI.

### F13: Remote Access with Auth
Secure access from outside local network with proper authentication.

---

## Data Model

```
┌─────────────────┐       ┌─────────────────┐
│     Project     │       │     Ticket      │
├─────────────────┤       ├─────────────────┤
│ id              │──────<│ id              │
│ name            │       │ project_id (FK) │
│ repo_path       │       │ external_id     │  // e.g., "PROJ-123"
│ tickets_path    │       │ title           │
│ handoff_path    │       │ state           │  // enum: backlog, in_progress, review, done
│ created_at      │       │ file_path       │  // path to markdown file
│ updated_at      │       │ started_at      │
└─────────────────┘       │ completed_at    │
                          │ created_at      │
                          │ updated_at      │
                          └─────────────────┘
                                   │
                                   │
                          ┌────────┴────────┐
                          │                 │
                          ▼                 │
                  ┌─────────────────┐       │
                  │     Session     │       │
                  ├─────────────────┤       │
                  │ id              │       │
                  │ project_id (FK) │       │
                  │ ticket_id (FK)  │───────┘
                  │ parent_id (FK)  │  // for handoff lineage (self-reference)
                  │ status          │  // enum: running, paused, completed, error
                  │ context_percent │
                  │ pid             │  // OS process ID
                  │ started_at      │
                  │ ended_at        │
                  │ created_at      │
                  │ updated_at      │
                  └─────────────────┘
                          │
                          │
                          ▼
                  ┌─────────────────┐
                  │  HandoffEvent   │
                  ├─────────────────┤
                  │ id              │
                  │ from_session_id │
                  │ to_session_id   │
                  │ context_at_handoff │
                  │ handoff_file_path  │
                  │ created_at      │
                  └─────────────────┘

                  ┌─────────────────┐
                  │ Notification    │
                  ├─────────────────┤
                  │ id              │
                  │ type            │  // enum: review_ready, context_low, etc.
                  │ session_id (FK) │
                  │ ticket_id (FK)  │
                  │ message         │
                  │ read            │
                  │ created_at      │
                  └─────────────────┘
```

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                              Clients                                  │
│  ┌─────────────────┐                    ┌─────────────────────────┐  │
│  │   React Web     │                    │    React Native Mobile  │  │
│  │   (browser)     │                    │    (iOS / Android)      │  │
│  └────────┬────────┘                    └───────────┬─────────────┘  │
│           │                                         │                 │
│           └──────────────┬──────────────────────────┘                 │
│                          │                                            │
│                      WebSocket + REST                                 │
└──────────────────────────┼────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Node.js Server                                │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                      API Layer (Express/Fastify)                 │ │
│  │  - REST endpoints for CRUD operations                           │ │
│  │  - WebSocket server for real-time streaming                     │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    Session Supervisor                            │ │
│  │  - Spawns/manages Claude Code processes (node-pty)              │ │
│  │  - Captures stdout/stderr                                        │ │
│  │  - Monitors context usage                                        │ │
│  │  - Triggers auto-handoff                                         │ │
│  │  - Detects completion signals                                    │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    Notification Service                          │ │
│  │  - Firebase Admin SDK                                            │ │
│  │  - Queues and sends push notifications                          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    Git Service                                   │ │
│  │  - Executes git commands (diff, log, status)                    │ │
│  │  - Parses output for UI consumption                             │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         PostgreSQL                                    │
│  - Projects, Tickets, Sessions, HandoffEvents, Notifications         │
└──────────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      File System (Repos)                              │
│  - Ticket markdown files                                              │
│  - Handoff documents                                                  │
│  - Git repositories                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## User Flows

### Flow 1: Start Working on a Ticket (from mobile)

```
1. User opens app on phone
2. User selects project from list
3. User sees tickets in "backlog"
4. User taps ticket "PROJ-123"
5. User taps "Start Session"
6. Server spawns Claude Code with ticket file tagged
7. Ticket state → in_progress
8. User sees Claude output streaming
9. User can course-correct as needed
```

### Flow 2: Auto-Handoff While User is Away

```
1. Claude is working, user is away
2. Context drops to 20%
3. Server sends push notification: "Context low, starting handoff"
4. Server executes /export-handoff
5. Server terminates Claude process
6. Server starts new Claude process
7. Server executes /import-handoff
8. Server sends push notification: "Handoff complete"
9. Claude continues working on same ticket
10. User checks phone, sees continuity maintained
```

### Flow 3: Review and Approve Ticket

```
1. Claude finishes work, outputs "Ready for review"
2. Server detects completion signal
3. Ticket state → review
4. Server sends push notification: "PROJ-123 ready for review"
5. User opens app
6. User sees ticket in "review" column
7. User taps ticket, sees review screen:
   - Claude's summary
   - Test results
   - Diff
8. User reviews diff
9. User taps "Approve"
10. Ticket state → done
```

### Flow 4: Reject with Feedback

```
1. User is on review screen
2. User sees issue in diff
3. User taps "Reject"
4. Feedback form appears
5. User types: "The error handling is missing for the API timeout case"
6. User taps "Send"
7. Server injects feedback into Claude session
8. Ticket state → in_progress
9. Claude receives feedback, continues work
```

---

## API Endpoints

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Register a new project
- `GET /api/projects/:id` - Get project details
- `DELETE /api/projects/:id` - Remove project

### Tickets
- `GET /api/projects/:id/tickets` - List tickets for project
- `GET /api/tickets/:id` - Get ticket details
- `PATCH /api/tickets/:id` - Update ticket (state changes)
- `POST /api/tickets/:id/sync` - Re-sync ticket from markdown file

### Sessions
- `GET /api/projects/:id/sessions` - List sessions for project
- `POST /api/projects/:id/sessions` - Start new session
- `GET /api/sessions/:id` - Get session details
- `POST /api/sessions/:id/input` - Send input to session
- `POST /api/sessions/:id/stop` - Stop session
- `GET /api/sessions/:id/output` - Get buffered output (REST fallback)

### Git
- `GET /api/projects/:id/diff` - Get current diff
- `GET /api/projects/:id/diff?since=:timestamp` - Get diff since timestamp

### WebSocket Events
- `session:output` - Claude output stream (server → client)
- `session:input` - User input (client → server)
- `session:context` - Context % update (server → client)
- `ticket:state` - Ticket state change (server → client)
- `notification` - Push notification echo (server → client)

---

## Configuration

```yaml
# config.yaml (per-installation)
server:
  port: 3000
  host: "0.0.0.0"

database:
  url: "postgresql://localhost:5432/claude_session_manager"

handoff:
  threshold_percent: 20
  export_command: "/export-handoff"
  import_command: "/import-handoff"

notifications:
  firebase_credentials_path: "./firebase-credentials.json"
  
  # Which events trigger push notifications
  events:
    review_ready: true
    context_low: true
    handoff_complete: true
    session_error: true
    waiting_for_input: true

done_signals:
  - "Task complete"
  - "Ready for review"
  - "All tests passing"
  - "Finished implementing"
  - "Implementation complete"

quick_actions:
  - label: "Stop"
    command: "/stop"
  - label: "Run Tests"
    command: "npm test"
  - label: "Show Plan"
    command: "/plan"
  - label: "Continue"
    command: "/continue"
```

---

## Open Questions

1. **Session persistence across server restarts:** If the Node server restarts, how do we reconnect to running Claude processes? May need to serialize session state more aggressively.

2. **Conflict handling:** What if user sends input while auto-handoff is in progress? Need to queue and replay?

3. **Ticket file sync:** If user edits ticket markdown directly, how do we detect and sync? File watcher? Manual refresh?

4. **Multi-device:** If user has web and mobile open simultaneously, how do we handle input from both? First-write-wins? Merge?

5. **Claude Code updates:** How tightly coupled are we to Claude Code's interface? What breaks if Anthropic changes the CLI?

---

## Success Metrics

- **Session continuity:** % of handoffs that successfully continue work without human intervention
- **Review turnaround:** Time from "review" state to "done" or "rejected"
- **Mobile engagement:** % of course corrections made from mobile vs desktop
- **Context efficiency:** Average context % at handoff (lower = more work per session)

---

## Milestones

### M1: Local Web MVP (4 weeks)
- [ ] Project/ticket/session data model and API
- [ ] Session supervisor with output capture
- [ ] React web UI with streaming output
- [ ] Basic ticket state management
- [ ] Diff view

### M2: Context Management (2 weeks)
- [ ] Context monitoring
- [ ] Auto-handoff flow
- [ ] Handoff event logging

### M3: Mobile App (3 weeks)
- [ ] React Native app with feature parity
- [ ] Push notification infrastructure
- [ ] Deep linking

### M4: Polish & Iterate (2 weeks)
- [ ] Quick actions
- [ ] Notification preferences
- [ ] Bug fixes and UX refinement

**Total estimated timeline:** 11 weeks for v1

---

## Appendix: Existing User Workflow Reference

**Current ticket location:** `<repo>/docs/jira-tickets/`
**Current handoff location:** `<repo>/docs/ai-context/handoff.md`
**Export command:** `/export-handoff` (custom slash command)
**Import command:** `/import-handoff` (custom slash command)
**Development style:** Trunk-based with stacked diffs, commits to main

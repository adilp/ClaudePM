# Claude Code Hooks Setup

This document explains how to configure Claude Code hooks to integrate with the Claude Session Manager server for real-time waiting state detection.

## Overview

The Session Manager uses Claude Code hooks to receive immediate notifications when:
- Claude is waiting for tool approval (`permission_prompt`)
- Claude has been idle for 60 seconds (`idle_prompt`)
- Claude has stopped/finished (`Stop` event)

This is **Layer 1** of the three-layer waiting detection system, providing the fastest notification path.

## Configuration

Add the following to your `~/.claude/settings.json` file:

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "permission_prompt|idle_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "afplay /System/Library/Sounds/Ping.aiff & curl -s -X POST http://localhost:3000/api/hooks/claude -H 'Content-Type: application/json' -d '{\"event\":\"Notification\",\"matcher\":\"permission_prompt\",\"cwd\":\"'\"$PWD\"'\"}' > /dev/null 2>&1 &"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "afplay /System/Library/Sounds/Glass.aiff & curl -s -X POST http://localhost:3000/api/hooks/claude -H 'Content-Type: application/json' -d '{\"event\":\"Stop\",\"cwd\":\"'\"$PWD\"'\"}' > /dev/null 2>&1 &"
          }
        ]
      }
    ]
  }
}
```

## Configuration Breakdown

### Notification Hooks

The `Notification` hook triggers when Claude shows a notification to the user:

- **`permission_prompt`**: Triggered when Claude needs approval for a tool use (e.g., file edits, command execution)
- **`idle_prompt`**: Triggered after 60 seconds of Claude being idle

### Stop Hook

The `Stop` hook triggers when Claude finishes or stops processing. The empty matcher (`""`) matches all stop events.

### Command Structure

Each hook command does two things:
1. Plays a sound effect (optional, for local notification)
2. Sends an HTTP POST to the Session Manager API

The `& ... > /dev/null 2>&1 &` ensures the curl command runs in the background and doesn't block Claude.

## API Endpoint

The hooks POST to:
```
POST http://localhost:3000/api/hooks/claude
```

### Payload Format

```json
{
  "event": "Notification" | "Stop",
  "matcher": "permission_prompt" | "idle_prompt" | "",
  "cwd": "/path/to/project",
  "session_id": "optional-session-id",
  "transcript_path": "optional-transcript-path"
}
```

## Server Configuration

The server must be running on `localhost:3000` (or adjust the URL in the hooks configuration).

Verify the hooks endpoint is working:
```bash
curl http://localhost:3000/api/hooks/health
```

Expected response:
```json
{
  "status": "ok",
  "detectorRunning": true,
  "watchedSessions": 1
}
```

## Testing

To test the hook configuration manually:

```bash
# Test Notification hook
curl -X POST http://localhost:3000/api/hooks/claude \
  -H 'Content-Type: application/json' \
  -d '{"event":"Notification","matcher":"permission_prompt"}'

# Test Stop hook
curl -X POST http://localhost:3000/api/hooks/claude \
  -H 'Content-Type: application/json' \
  -d '{"event":"Stop"}'
```

## Troubleshooting

### Hooks not firing

1. Check that the settings.json is valid JSON
2. Restart Claude Code after changing settings
3. Check Claude Code logs for hook errors

### Server not receiving events

1. Verify the server is running: `curl http://localhost:3000/api/health`
2. Check the server logs for incoming hook requests
3. Ensure the URL in the hook command is correct

### Session not being detected

The hook payload includes `cwd` (current working directory) which the server uses to match the hook to an active session. If you have multiple sessions, the server will attempt to match by:
1. `session_id` in the payload (if provided)
2. `cwd` matching a session's project path
3. `transcript_path` matching a monitored transcript
4. Single active session fallback

## Sound Effects (Optional)

The example configuration includes macOS sound effects:
- `Ping.aiff` for notifications (Claude needs attention)
- `Glass.aiff` for stop events (Claude finished)

Remove the `afplay ...` part if you don't want sounds.

## Alternative: Without Sounds

If you only want server notifications without sounds:

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "permission_prompt|idle_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:3000/api/hooks/claude -H 'Content-Type: application/json' -d '{\"event\":\"Notification\",\"matcher\":\"'\"${CLAUDE_MATCHER:-permission_prompt}\"'\",\"cwd\":\"'\"$PWD\"'\"}' > /dev/null 2>&1 &"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:3000/api/hooks/claude -H 'Content-Type: application/json' -d '{\"event\":\"Stop\",\"cwd\":\"'\"$PWD\"'\"}' > /dev/null 2>&1 &"
          }
        ]
      }
    ]
  }
}
```

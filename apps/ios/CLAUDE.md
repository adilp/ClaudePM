# Claude PM iOS App

## Overview
Native iOS app for Claude Session Manager. Provides remote monitoring of Claude Code sessions, connection status, and session counts.

**NOTE: Currently focused on iPhone only. iPad support is deferred.**

## Tech Stack
- **Language**: Swift 5
- **UI Framework**: SwiftUI
- **Minimum iOS**: 17.0
- **Architecture**: MVVM with @Observable
- **Target Device**: iPhone (iPad deferred)

## Project Structure

```
apps/ios/
├── ClaudePM.xcodeproj/
├── ClaudePM/
│   ├── App/
│   │   └── ClaudePMApp.swift           # App entry point, lifecycle management
│   ├── Models/
│   │   ├── Session.swift               # API response models
│   │   └── SessionUpdate.swift         # WebSocket update models
│   ├── Services/
│   │   ├── APIClient.swift             # Network layer (actor-based)
│   │   ├── KeychainHelper.swift        # Secure credential storage
│   │   └── WebSocketClient.swift       # Real-time session updates
│   ├── ViewModels/
│   │   ├── ConnectionViewModel.swift   # Connection state management
│   │   └── SessionListViewModel.swift  # Session list state & WebSocket updates
│   ├── Views/
│   │   ├── ContentView.swift           # Root view with session list
│   │   ├── SessionRowView.swift        # Session row with status badge
│   │   ├── SessionDetailView.swift     # Session detail screen
│   │   └── SettingsView.swift          # Backend URL & API key config
│   └── Resources/
│       └── Assets.xcassets
└── ClaudePMTests/
    └── ClaudePMTests.swift
```

## Key Components

### APIClient (`Services/APIClient.swift`)
Actor-based singleton for thread-safe API calls.

```swift
// Health check (no auth required)
let health = try await APIClient.shared.checkHealth()

// Fetch sessions (uses API key from Keychain)
let sessions = try await APIClient.shared.getSessions()
```

**Important:** Uses `.convertFromSnakeCase` key decoding strategy since the backend returns snake_case JSON keys.

### KeychainHelper (`Services/KeychainHelper.swift`)
Secure storage for API key using iOS Keychain.

```swift
KeychainHelper.save(apiKey: "your-key")
let key = KeychainHelper.getAPIKey()
KeychainHelper.delete()
```

### WebSocketClient (`Services/WebSocketClient.swift`)
Singleton WebSocket client for real-time session updates.

```swift
// Lifecycle: Connects when app foregrounds, disconnects on background
WebSocketClient.shared.connect()
WebSocketClient.shared.disconnect()

// States: .disconnected, .connecting, .connected, .reconnecting(attempt:)
let isReconnecting = WebSocketClient.shared.isReconnecting

// Session updates callback
WebSocketClient.shared.onSessionUpdate = { update in
    switch update.type {
    case .status:    // Session status changed
    case .waiting:   // Claude waiting for input
    case .context:   // Context usage updated
    }
}
```

**Features:**
- Auto-reconnect with exponential backoff (1s, 2s, 4s... max 30s)
- Automatic ping/pong for connection health
- API key authentication via query parameter
- Handles `session:status`, `session:waiting`, `session:context` messages

### ConnectionViewModel (`ViewModels/ConnectionViewModel.swift`)
Uses `@Observable` macro (iOS 17+) for reactive state management.

```swift
@Observable
class ConnectionViewModel {
    var connectionStatus: ConnectionStatus  // .disconnected, .connecting, .connected, .error
    var sessions: [Session]
    var activeSessionCount: Int  // Sessions with status == .running
    var isWebSocketReconnecting: Bool  // Show reconnecting banner
}
```

## API Models

### Session
Matches the backend `/api/sessions` response:

```swift
struct Session: Codable, Identifiable {
    let id: String
    let projectId: String
    let ticketId: String?
    let type: SessionType          // .ticket, .adhoc
    let status: SessionStatus      // .running, .paused, .completed, .error
    let contextPercent: Int
    let paneId: String
    let startedAt: Date?
    let endedAt: Date?
    let createdAt: Date
    let updatedAt: Date
    let project: SessionProject    // Nested: { id, name }
    let ticket: SessionTicket?     // Nested: { id, externalId, title }
}
```

### SessionStatus
```swift
enum SessionStatus: String, Codable {
    case running   // Active session
    case paused    // Temporarily paused
    case completed // Finished successfully
    case error     // Failed
}
```

## Settings Storage

| Setting | Storage | Key |
|---------|---------|-----|
| Backend URL | `@AppStorage` (UserDefaults) | `backendURL` |
| API Key | Keychain | `api-key` |

## Development

### Build & Run
```bash
# Open in Xcode
open ClaudePM.xcodeproj

# Or build from command line
xcodebuild -project ClaudePM.xcodeproj \
  -scheme ClaudePM \
  -destination "generic/platform=iOS Simulator" \
  -configuration Debug build
```

### Run Tests
```bash
xcodebuild test -project ClaudePM.xcodeproj \
  -scheme ClaudePM \
  -destination "platform=iOS Simulator,name=iPhone 16 Pro"
```

## Backend Connection

The app connects to the Claude PM backend server.

**HTTP Endpoints used:**
- `GET /api/health` - Connection check (no auth)
- `GET /api/sessions` - Fetch all sessions (requires API key if configured)

**WebSocket Connection:**
- URL: `ws://host:port?apiKey=xxx` (or `wss://` for TLS)
- Connects on app foreground, disconnects on background
- Receives real-time updates for session status, waiting state, and context usage

**Authentication:**
- If the server has `API_KEY` env var set, include it in Settings
- HTTP Header: `X-API-Key: <your-key>`
- WebSocket: Query parameter `?apiKey=<your-key>`
- In development mode (no API_KEY on server), authentication is optional

## Bundle Identifier
`com.claudepm.ios`

## Common Issues

### "Failed to fetch sessions: decodingError"
The Session model must match the API response exactly. The backend returns:
- Snake_case keys (handled by `.convertFromSnakeCase`)
- `pane_id` not `tmux_pane_id`
- Nested `project` and `ticket` objects

### Network errors in Simulator
- Ensure backend server is running
- Use machine's IP address, not `localhost` (Simulator has its own network)
- Example: `http://192.168.1.100:4847`

### Simulator socket warnings (safe to ignore)
These console warnings are harmless and only appear in the Simulator:
```
nw_socket_set_connection_idle setsockopt SO_CONNECTION_IDLE failed [42: Protocol not available]
nw_protocol_socket_set_no_wake_from_sleep setsockopt SO_NOWAKEFROMSLEEP failed [22: Invalid argument]
```
The Simulator doesn't support certain socket options available on real devices. These don't affect app functionality.

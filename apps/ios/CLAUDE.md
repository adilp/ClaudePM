# Claude PM iOS App

## Overview
Native iOS app for Claude Session Manager. Provides remote monitoring of Claude Code sessions, real-time notifications, and ticket management.

**NOTE: Currently focused on iPhone only. iPad support is deferred.**

## Tech Stack
- **Language**: Swift 5.9+
- **UI Framework**: SwiftUI
- **Minimum iOS**: 17.0
- **Target iOS**: 26 (with Liquid Glass design)
- **Architecture**: MVVM with @Observable
- **Target Device**: iPhone (iPad deferred)

## Design Patterns (iOS 26)

### Liquid Glass Design Language
iOS 26 introduced "Liquid Glass" - translucent, glass-like materials for UI components. We use:
- `.regularMaterial` / `.ultraThinMaterial` for translucent backgrounds
- `.presentationBackground(.regularMaterial)` for sheet glass effects
- System blur effects adapt to content behind them

### Presentation Patterns
| Pattern | Use Case | Implementation |
|---------|----------|----------------|
| **Sheet** | Modal content, notifications list | `.sheet()` with `.presentationDetents([.medium, .large])` |
| **Banner** | Transient alerts, toast notifications | Custom overlay with animation |
| **Popover** | Contextual info (iPad) | Auto-converts to sheet on iPhone |

### Navigation
- `NavigationStack` for hierarchical navigation
- `TabView` for top-level sections (Sessions, Tickets)
- Sheets for modal content (Settings, Notifications)

## Project Structure

```
apps/ios/
├── ClaudePM.xcodeproj/
├── ClaudePM/
│   ├── App/
│   │   └── ClaudePMApp.swift              # App entry point, lifecycle management
│   ├── Models/
│   │   ├── Session.swift                  # Session API response models
│   │   ├── SessionUpdate.swift            # WebSocket update models
│   │   ├── Ticket.swift                   # Ticket models
│   │   ├── Project.swift                  # Project models
│   │   └── InAppNotification.swift        # In-app notification model
│   ├── Services/
│   │   ├── APIClient.swift                # Network layer (actor-based)
│   │   ├── KeychainHelper.swift           # Secure credential storage
│   │   ├── WebSocketClient.swift          # Real-time updates & message handling
│   │   └── NotificationManager.swift      # In-app notification state
│   ├── ViewModels/
│   │   ├── ConnectionViewModel.swift      # Connection state management
│   │   ├── SessionListViewModel.swift     # Session list state
│   │   └── TicketBoardViewModel.swift     # Ticket board state
│   ├── Views/
│   │   ├── ContentView.swift              # Root TabView (Sessions, Tickets)
│   │   ├── SessionRowView.swift           # Session row with status badge
│   │   ├── SessionDetailView.swift        # Session detail screen
│   │   ├── SettingsView.swift             # Backend URL & API key config
│   │   ├── NotificationBannerView.swift   # Toast-style notification banner
│   │   ├── NotificationsListView.swift    # Bell icon dropdown list
│   │   └── Tickets/                       # Ticket board views
│   │       ├── TicketBoardView.swift
│   │       ├── TicketColumnView.swift
│   │       ├── TicketCardView.swift
│   │       ├── TicketDetailSheet.swift
│   │       └── FilterChipsView.swift
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
Singleton WebSocket client for real-time updates. Handles all server message types.

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

**Handled Message Types:**
| Message Type | Handler | Creates Notification |
|--------------|---------|---------------------|
| `session:status` | Updates session in list | Yes (on error/complete) |
| `session:waiting` | Updates waiting state | Yes (when waiting) |
| `session:context` | Updates context % | No |
| `session:output` | Ignored (high-frequency) | No |
| `review:result` | Logs result | Yes |
| `ai:analysis_status` | Logs status | Yes |
| `ticket:state` | Logs transition | Yes |
| `notification` | Generic notification | Yes |
| `subscribed/unsubscribed` | Logs confirmation | No |
| `pty:*` | Terminal events | No |
| `pong` | Heartbeat response | No |
| `error` | Logs error | Yes |

### NotificationManager (`Services/NotificationManager.swift`)
Singleton `@Observable` class managing in-app notifications.

```swift
// Access the shared instance
NotificationManager.shared.notifications      // All notifications
NotificationManager.shared.unreadCount        // Badge count
NotificationManager.shared.showBanner         // Auto-dismiss banner visible
NotificationManager.shared.currentBannerNotification  // Current toast

// Actions
NotificationManager.shared.add(notification)
NotificationManager.shared.markAsRead(id)
NotificationManager.shared.dismissBanner()
NotificationManager.shared.clearAll()
```

**Notification Priority Levels:**
- `.low` - Informational (subscribed, analysis generating)
- `.normal` - Standard updates (ticket state, analysis complete)
- `.high` - Requires attention (waiting, review not complete)
- `.urgent` - Immediate action (errors, clarification needed)

**Auto-dismiss:** High+ priority notifications show a banner for 5 seconds.

## Notification UI

### NotificationBannerView (`Views/NotificationBannerView.swift`)
Toast-style banner that slides down from top of screen.

```swift
// Container manages show/hide with animation
NotificationBannerContainer(notificationManager: NotificationManager.shared)
```

**Features:**
- Color-coded by priority (blue/orange/red borders)
- Icon per category (terminal, ticket, sparkles, bell)
- Auto-dismisses after 5 seconds
- Tap to dismiss or act
- Spring animation on appear/disappear

### NotificationsListView (`Views/NotificationsListView.swift`)
Half-screen sheet showing all notifications.

```swift
// Presented as sheet from bell icon
.sheet(isPresented: $showingNotifications) {
    NotificationsListView(notificationManager: NotificationManager.shared)
}
```

**Features:**
- `.presentationDetents([.medium, .large])` - starts half-screen, drag to full
- `.presentationBackground(.regularMaterial)` - iOS 26 Liquid Glass
- Swipe-to-dismiss individual notifications
- "Clear All" button
- Relative timestamps ("2m ago")
- Unread dot indicator
- Empty state with bell.slash icon

### NotificationBellButton
Toolbar button with unread count badge.

```swift
NotificationBellButton(unreadCount: NotificationManager.shared.unreadCount) {
    showingNotifications = true
}
```

**Features:**
- Red badge with count (caps at "99+")
- Hidden when count is 0

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

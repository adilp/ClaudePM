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
│   ├── Info.plist                         # App configuration (fonts, etc.)
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
│   │   ├── NotificationManager.swift      # In-app notification state
│   │   └── PtyConnection.swift            # Terminal PTY WebSocket connection
│   ├── ViewModels/
│   │   ├── ConnectionViewModel.swift      # Connection state management
│   │   ├── SessionListViewModel.swift     # Session list state
│   │   └── TicketBoardViewModel.swift     # Ticket board state
│   ├── Views/
│   │   ├── ContentView.swift              # Root TabView (Sessions, Tickets)
│   │   ├── SessionRowView.swift           # Session row with status badge
│   │   ├── SessionDetailView.swift        # Session detail + full-screen terminal
│   │   ├── SettingsView.swift             # Backend URL & API key config
│   │   ├── NotificationBannerView.swift   # Toast-style notification banner
│   │   ├── NotificationsListView.swift    # Bell icon dropdown list
│   │   ├── TerminalView.swift             # SwiftTerm terminal wrapper
│   │   └── Tickets/                       # Ticket board views
│   │       ├── TicketBoardView.swift
│   │       ├── TicketColumnView.swift
│   │       ├── TicketCardView.swift
│   │       ├── TicketDetailSheet.swift
│   │       └── FilterChipsView.swift
│   └── Resources/
│       ├── Assets.xcassets
│       └── Fonts/                         # Custom terminal fonts
│           ├── JetBrainsMonoNerdFontMono-Regular.ttf
│           ├── JetBrainsMonoNerdFontMono-Bold.ttf
│           └── OFL.txt                    # Font license
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

### PtyConnection (`Services/PtyConnection.swift`)
Manages PTY WebSocket connection for terminal I/O. Creates a separate WebSocket connection to attach to a session's terminal.

```swift
// Create connection for a session
let connection = PtyConnection(sessionId: "session-id")

// Connect to WebSocket and attach to PTY
connection.connect()
connection.attach(cols: 80, rows: 24)

// Handle terminal output
connection.onData = { data in
    terminal.feed(byteArray: Array(data.utf8))
}

// Send user input
connection.send("ls -la\n")

// Resize terminal
connection.resize(cols: 120, rows: 40)

// Manual reconnect
connection.reconnect()

// Disconnect when done
connection.disconnect()
```

**Connection States:**
```swift
connection.isConnected     // WebSocket connected
connection.isAttached      // Attached to PTY
connection.isReconnecting  // Auto-reconnect in progress
connection.reconnectAttempt // Current attempt number (0-10)
connection.errorMessage    // Error description if failed
```

**Auto-Reconnect:**
- Triggers on connection loss or send failure
- Exponential backoff: 1s, 2s, 4s, 8s... max 30s
- Max 10 attempts before giving up
- Preserves terminal dimensions for re-attach
- User can manually reconnect via `reconnect()` method

**PTY Message Types:**
| Message | Direction | Purpose |
|---------|-----------|---------|
| `pty:attach` | Client → Server | Attach to session's PTY |
| `pty:attached` | Server → Client | Confirmation with cols/rows |
| `pty:detach` | Client → Server | Detach from PTY |
| `pty:detached` | Server → Client | Confirmation |
| `pty:data` | Client → Server | Terminal input |
| `pty:output` | Server → Client | Terminal output |
| `pty:resize` | Client → Server | Resize terminal |
| `pty:exit` | Server → Client | PTY process exited |

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

## Terminal View

### TerminalView (`Views/TerminalView.swift`)
SwiftUI wrapper for SwiftTerm that displays live terminal output from Claude sessions.

```swift
// Basic usage - embedded terminal preview
TerminalContainerView(sessionId: session.id)
    .frame(height: 300)

// With full-screen toggle support
TerminalContainerView(
    sessionId: session.id,
    isFullScreen: false,
    onToggleFullScreen: { showFullScreen = true }
)

// Full-screen terminal (covers entire screen)
FullScreenTerminalView(session: session, isPresented: $isFullScreen)
```

**Features:**
- Live terminal output via WebSocket PTY connection
- **Full-screen mode** - tap terminal or expand button to maximize
- **JetBrains Mono Nerd Font** - supports powerline glyphs and icons
- Touch scrolling through terminal history
- Automatic resize on device rotation and mode change
- Connection status overlay (connecting/attaching/error states)
- Reconnect button on connection failure
- Haptic feedback on terminal bell
- URL link handling (opens in Safari)

**Terminal Font:**
Uses JetBrains Mono Nerd Font for proper rendering of:
- Powerline separators (status bars, prompts)
- Nerd Font icons (file types, git status)
- Box drawing characters (borders, progress bars)

```swift
// Font configuration in TerminalFont enum
TerminalFont.regular(size: 12)  // JetBrainsMonoNFM-Regular
TerminalFont.bold(size: 12)     // JetBrainsMonoNFM-Bold
```

**Full-Screen Mode:**
- Tap anywhere on terminal preview to expand
- Expand button in terminal header
- Close button (X) in top-left corner
- Session info badge in top-right
- Status bar hidden for maximum space
- Terminal auto-resizes to fill screen

**SwiftTerm Integration:**
- Uses [SwiftTerm](https://github.com/migueldeicaza/SwiftTerm) library (same as Blink Shell, a-Shell)
- `TerminalView` is a `UIViewRepresentable` wrapping `SwiftTerm.TerminalView`
- `TerminalContainerView` adds connection status UI and manages `PtyConnection` lifecycle
- `FullScreenTerminalView` provides full-screen presentation with overlay controls
- Coordinator handles `TerminalViewDelegate` for input/resize/clipboard

**Auto-Resize:**
- Terminal dimensions calculated from SwiftTerm's `sizeChanged` delegate
- Initial attach waits for dimensions before connecting to PTY
- Resize messages sent to server on device rotation
- Full-screen toggle triggers automatic re-layout

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

### Build & Run (Xcode)
```bash
# Open in Xcode
open ClaudePM.xcodeproj
```

### Build for Simulator (Command Line)
```bash
xcodebuild -project ClaudePM.xcodeproj \
  -scheme ClaudePM \
  -destination "generic/platform=iOS Simulator" \
  -configuration Debug build
```

### Build & Deploy to Physical iPhone
```bash
# List connected devices
xcrun xctrace list devices

# Build for physical device (replace "Adil iPhone" with your device name)
xcodebuild -scheme ClaudePM \
  -destination 'platform=iOS,name=Adil iPhone' \
  -configuration Debug build

# Install on device
xcrun devicectl device install app \
  --device "Adil iPhone" \
  ~/Library/Developer/Xcode/DerivedData/ClaudePM-*/Build/Products/Debug-iphoneos/ClaudePM.app

# Launch on device
xcrun devicectl device process launch \
  --device "Adil iPhone" \
  com.claudepm.ios
```

**Note:** Your iPhone must be:
- Connected via USB or on the same network
- Trusted on your Mac (Settings > General > Device Management)
- Developer mode enabled (Settings > Privacy & Security > Developer Mode)

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

## Adding New Swift Files to Xcode Project

**IMPORTANT:** When creating new `.swift` files, you MUST add them to the Xcode project file (`project.pbxproj`). Simply creating the file on disk is NOT enough - Xcode won't compile files it doesn't know about.

### Required Steps for New Files

When adding a new Swift file (e.g., `MyNewView.swift`), you must add **three entries** to `ClaudePM.xcodeproj/project.pbxproj`:

#### 1. PBXBuildFile (in `/* Begin PBXBuildFile section */`)
```
MYNEWVIEW001MYNEWVIEW001 /* MyNewView.swift in Sources */ = {isa = PBXBuildFile; fileRef = MYNEWVIEW000MYNEWVIEW000 /* MyNewView.swift */; };
```

#### 2. PBXFileReference (in `/* Begin PBXFileReference section */`)
```
MYNEWVIEW000MYNEWVIEW000 /* MyNewView.swift */ = {isa = PBXFileReference; includeInIndex = 1; lastKnownFileType = sourcecode.swift; path = MyNewView.swift; sourceTree = "<group>"; };
```

#### 3. Add to appropriate PBXGroup (in `/* Begin PBXGroup section */`)
Find the correct group (folder) and add the file reference to its `children` array:
```
A1000470A1000470A1000000 /* Tickets */ = {
    isa = PBXGroup;
    children = (
        ...existing files...,
        MYNEWVIEW000MYNEWVIEW000 /* MyNewView.swift */,
    );
```

#### 4. Add to PBXSourcesBuildPhase (in `/* Begin PBXSourcesBuildPhase section */`)
Add to the `files` array in the main target's Sources phase:
```
A1000200A1000200A1000020 /* Sources */ = {
    isa = PBXSourcesBuildPhase;
    ...
    files = (
        ...existing files...,
        MYNEWVIEW001MYNEWVIEW001 /* MyNewView.swift in Sources */,
    );
```

### File ID Convention
- Use unique 24-character IDs (can be alphanumeric)
- Use `*000*` suffix for file reference, `*001*` suffix for build file
- Example pattern: `MYNEWVIEW000MYNEWVIEW000` and `MYNEWVIEW001MYNEWVIEW001`

### Group Locations
| Folder | Group ID | Path |
|--------|----------|------|
| App/ | `A1000410A1000410A1000000` | ClaudePM/App |
| Models/ | `A1000420A1000420A1000000` | ClaudePM/Models |
| Services/ | `A1000430A1000430A1000000` | ClaudePM/Services |
| ViewModels/ | `A1000440A1000440A1000000` | ClaudePM/ViewModels |
| Views/ | `A1000450A1000450A1000000` | ClaudePM/Views |
| Views/Tickets/ | `A1000470A1000470A1000000` | ClaudePM/Views/Tickets |
| Views/Components/ | `391CD4AFAA0C073F6288997A` | ClaudePM/Views/Components |
| Resources/ | `A1000460A1000460A1000000` | ClaudePM/Resources |

### Build Error: "Cannot find 'X' in scope"
If you see this error after creating a new file, the file is NOT in the Xcode project. Check:
1. File exists on disk: `ls path/to/MyNewView.swift`
2. File is in project.pbxproj: `grep "MyNewView.swift" ClaudePM.xcodeproj/project.pbxproj`
3. If grep returns nothing, add the required entries as described above

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

### Terminal font not loading (garbled characters)
If powerline glyphs appear as boxes or question marks:
1. Ensure font files are in `Resources/Fonts/` directory
2. Add fonts to Xcode project target (drag files, check "Copy if needed")
3. Verify `Info.plist` includes `UIAppFonts` array with font filenames
4. Clean build folder (Cmd+Shift+K) and rebuild

### Adding fonts to Xcode project
1. Open `ClaudePM.xcodeproj` in Xcode
2. Drag `Resources/Fonts/` folder into Xcode navigator
3. Ensure "Copy items if needed" is checked
4. Ensure "Add to targets: ClaudePM" is checked
5. Verify `Info.plist` is in project and contains:
   ```xml
   <key>UIAppFonts</key>
   <array>
       <string>JetBrainsMonoNerdFontMono-Regular.ttf</string>
       <string>JetBrainsMonoNerdFontMono-Bold.ttf</string>
   </array>
   ```

### Simulator socket warnings (safe to ignore)
These console warnings are harmless and only appear in the Simulator:
```
nw_socket_set_connection_idle setsockopt SO_CONNECTION_IDLE failed [42: Protocol not available]
nw_protocol_socket_set_no_wake_from_sleep setsockopt SO_NOWAKEFROMSLEEP failed [22: Invalid argument]
```
The Simulator doesn't support certain socket options available on real devices. These don't affect app functionality.

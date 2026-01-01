import SwiftUI
import SwiftTerm

// MARK: - Terminal Font Configuration

/// Custom Nerd Font for terminal with powerline glyph support
enum TerminalFont {
    /// Font name for the embedded JetBrains Mono Nerd Font
    static let fontName = "JetBrainsMonoNFM-Regular"
    static let boldFontName = "JetBrainsMonoNFM-Bold"

    /// Default font size
    static let defaultSize: CGFloat = 12

    /// Get the terminal font, falling back to system monospace if not available
    static func regular(size: CGFloat = defaultSize) -> UIFont {
        if let font = UIFont(name: fontName, size: size) {
            return font
        }
        // Fallback to system monospace
        print("[TerminalFont] Warning: Nerd Font not found, using system monospace")
        return UIFont.monospacedSystemFont(ofSize: size, weight: .regular)
    }

    static func bold(size: CGFloat = defaultSize) -> UIFont {
        if let font = UIFont(name: boldFontName, size: size) {
            return font
        }
        return UIFont.monospacedSystemFont(ofSize: size, weight: .bold)
    }
}

// MARK: - Terminal View

/// SwiftUI wrapper for SwiftTerm terminal view
/// Displays live terminal output from a Claude session
struct TerminalView: UIViewRepresentable {
    let sessionId: String
    @Bindable var connection: PtyConnection
    let fontSize: CGFloat

    /// Callback when terminal dimensions are known
    var onDimensionsReady: ((Int, Int) -> Void)?

    init(sessionId: String, connection: PtyConnection, fontSize: CGFloat = TerminalFont.defaultSize, onDimensionsReady: ((Int, Int) -> Void)? = nil) {
        self.sessionId = sessionId
        self.connection = connection
        self.fontSize = fontSize
        self.onDimensionsReady = onDimensionsReady
    }

    func makeUIView(context: Context) -> SwiftTerm.TerminalView {
        let terminal = SwiftTerm.TerminalView(frame: .zero)

        // Configure terminal appearance with Nerd Font
        terminal.font = TerminalFont.regular(size: fontSize)

        // Set colors for better visibility
        terminal.nativeBackgroundColor = UIColor.black
        terminal.nativeForegroundColor = UIColor.white

        // Allow scrolling and selection
        terminal.allowMouseReporting = false

        // Store terminal reference in coordinator
        context.coordinator.terminal = terminal

        // Register with focus manager for keyboard dismissal
        TerminalFocusManager.shared.activeTerminal = terminal

        // Set up data handler - receives terminal output from WebSocket
        connection.onData = { [weak terminal] data in
            guard let terminal = terminal else { return }
            let bytes = ArraySlice(Array(data.utf8))
            terminal.feed(byteArray: bytes)
        }

        // Set the terminal delegate for input handling
        terminal.terminalDelegate = context.coordinator

        return terminal
    }

    func updateUIView(_ uiView: SwiftTerm.TerminalView, context: Context) {
        // Update font size if changed
        if uiView.font.pointSize != fontSize {
            uiView.font = TerminalFont.regular(size: fontSize)
        }
    }

    static func dismantleUIView(_ uiView: SwiftTerm.TerminalView, coordinator: Coordinator) {
        // Disconnect when the view is removed
        coordinator.connection.disconnect()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(connection: connection, onDimensionsReady: onDimensionsReady)
    }

    // MARK: - Coordinator

    class Coordinator: NSObject, TerminalViewDelegate {
        let connection: PtyConnection
        var terminal: SwiftTerm.TerminalView?
        var onDimensionsReady: ((Int, Int) -> Void)?
        private var hasReportedDimensions = false

        init(connection: PtyConnection, onDimensionsReady: ((Int, Int) -> Void)?) {
            self.connection = connection
            self.onDimensionsReady = onDimensionsReady
            super.init()
        }

        /// Called when the terminal wants to send data (user input)
        func send(source: SwiftTerm.TerminalView, data: ArraySlice<UInt8>) {
            let str = String(bytes: data, encoding: .utf8) ?? ""
            connection.send(str)
        }

        /// Called when the terminal size changes
        func sizeChanged(source: SwiftTerm.TerminalView, newCols: Int, newRows: Int) {
            print("[TerminalView] Size changed: \(newCols)x\(newRows)")

            // Report dimensions on first valid size change
            if !hasReportedDimensions && newCols > 0 && newRows > 0 {
                hasReportedDimensions = true
                onDimensionsReady?(newCols, newRows)
            }

            // Send resize to server if attached
            connection.resize(cols: newCols, rows: newRows)
        }

        /// Called when the terminal title changes
        func setTerminalTitle(source: SwiftTerm.TerminalView, title: String) {
            // Not used - we manage our own title
        }

        /// Called when the terminal wants to set the icon name
        func setTerminalIconTitle(source: SwiftTerm.TerminalView, title: String) {
            // Not used
        }

        /// Called to request scrolling to a specific position
        func scrolled(source: SwiftTerm.TerminalView, position: Double) {
            // Native scrolling is handled by SwiftTerm
        }

        /// Called when the host status changes (cursor shape, etc.)
        func hostCurrentDirectoryUpdate(source: SwiftTerm.TerminalView, directory: String?) {
            // Not used
        }

        /// Called when a URL is clicked in the terminal
        func requestOpenLink(source: SwiftTerm.TerminalView, link: String, params: [String: String]) {
            // Open URLs in Safari
            if let url = URL(string: link) {
                UIApplication.shared.open(url)
            }
        }

        /// Called when the bell character is received
        func bell(source: SwiftTerm.TerminalView) {
            // Haptic feedback on bell
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.warning)
        }

        /// Called when the selection changes
        func selectionChanged(source: SwiftTerm.TerminalView) {
            // Selection handling for copy/paste
        }

        /// Called to report the current working directory changed
        func iTermContent(source: SwiftTerm.TerminalView, content: ArraySlice<UInt8>) {
            // iTerm2 integration - not used
        }

        /// Called when the color palette changes
        func colorChanged(source: SwiftTerm.TerminalView, idx: Int) {
            // Color handling
        }

        /// Report the mouse mode has changed
        func mouseModeChanged(source: SwiftTerm.TerminalView, mode: Terminal.MouseMode) {
            // Mouse mode handling
        }

        /// Clipboard request
        func clipboardCopy(source: SwiftTerm.TerminalView, content: Data) {
            if let string = String(data: content, encoding: .utf8) {
                UIPasteboard.general.string = string
            }
        }

        /// Report that the terminal buffer has been changed
        func bufferActivated(source: SwiftTerm.TerminalView, title: String) {
            // Buffer activation
        }

        /// Report the current cursor position
        func cursorStyleChanged(source: SwiftTerm.TerminalView, newStyle: CursorStyle) {
            // Cursor style handling
        }

        /// Report rangeChanged event
        func rangeChanged(source: SwiftTerm.TerminalView, startY: Int, endY: Int) {
            // Range changed
        }
    }
}

// MARK: - Terminal Focus Manager

/// Manages keyboard/focus state for terminal views
@Observable
class TerminalFocusManager {
    static let shared = TerminalFocusManager()

    /// Weak reference to the current terminal view
    weak var activeTerminal: SwiftTerm.TerminalView?

    /// Dismiss keyboard by resigning first responder on terminal
    func dismissKeyboard() {
        activeTerminal?.resignFirstResponder()
    }
}

// MARK: - Terminal Container View

/// Container view for the terminal with connection status overlay
/// Supports full-screen expansion on tap
struct TerminalContainerView: View {
    let sessionId: String
    let isFullScreen: Bool
    let onToggleFullScreen: (() -> Void)?

    @State private var connection: PtyConnection
    @State private var terminalDimensions: (cols: Int, rows: Int)?

    init(sessionId: String, isFullScreen: Bool = false, onToggleFullScreen: (() -> Void)? = nil) {
        self.sessionId = sessionId
        self.isFullScreen = isFullScreen
        self.onToggleFullScreen = onToggleFullScreen
        self._connection = State(initialValue: PtyConnection(sessionId: sessionId))
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Terminal view
                TerminalView(
                    sessionId: sessionId,
                    connection: connection,
                    fontSize: isFullScreen ? 11 : 10,
                    onDimensionsReady: { cols, rows in
                        terminalDimensions = (cols, rows)
                        // Attach to PTY once we know dimensions
                        attachIfReady(cols: cols, rows: rows)
                    }
                )
                .clipShape(RoundedRectangle(cornerRadius: isFullScreen ? 0 : 12))

                // Connection status overlay
                if !connection.isAttached {
                    connectionOverlay
                }

                // Full-screen toggle button (top-right)
                if let toggle = onToggleFullScreen {
                    VStack {
                        HStack {
                            Spacer()
                            Button(action: toggle) {
                                Image(systemName: isFullScreen ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                                    .font(.system(size: 16, weight: .medium))
                                    .foregroundStyle(.white)
                                    .padding(10)
                                    .background(.black.opacity(0.6))
                                    .clipShape(Circle())
                            }
                            .padding(8)
                        }
                        Spacer()
                    }
                }
            }
        }
        .onAppear {
            startConnection()
        }
        .onDisappear {
            connection.disconnect()
        }
        .onChange(of: isFullScreen) { _, newValue in
            // Terminal will auto-resize via sizeChanged delegate
        }
    }

    private func startConnection() {
        // Start WebSocket connection
        connection.connect()
    }

    private func attachIfReady(cols: Int, rows: Int) {
        // Only attach if we're connected
        guard connection.isConnected else {
            // Wait for connection and retry
            Task {
                // Poll until connected (max 5 seconds)
                for _ in 0..<50 {
                    try? await Task.sleep(nanoseconds: 100_000_000) // 100ms
                    if connection.isConnected {
                        await MainActor.run {
                            connection.attach(cols: cols, rows: rows)
                        }
                        return
                    }
                }
                print("[TerminalContainer] Timeout waiting for connection")
            }
            return
        }

        connection.attach(cols: cols, rows: rows)
    }

    private var connectionOverlay: some View {
        RoundedRectangle(cornerRadius: isFullScreen ? 0 : 12)
            .fill(.black.opacity(0.8))
            .overlay {
                VStack(spacing: 12) {
                    if let error = connection.errorMessage {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 32))
                            .foregroundStyle(.red)
                        Text("Connection Error")
                            .font(.headline)
                            .foregroundStyle(.white)
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)

                        // Retry button
                        Button("Retry") {
                            connection.reconnect()
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.blue)
                        .padding(.top, 8)

                        // Show reconnect attempt if applicable
                        if connection.reconnectAttempt > 0 {
                            Text("Attempt \(connection.reconnectAttempt)")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    } else if connection.isConnected {
                        ProgressView()
                            .tint(.white)
                        Text("Attaching to terminal...")
                            .font(.subheadline)
                            .foregroundStyle(.white)
                    } else if connection.isReconnecting {
                        ProgressView()
                            .tint(.orange)
                        Text("Reconnecting...")
                            .font(.subheadline)
                            .foregroundStyle(.orange)
                        Text("Attempt \(connection.reconnectAttempt)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        ProgressView()
                            .tint(.white)
                        Text("Connecting...")
                            .font(.subheadline)
                            .foregroundStyle(.white)
                    }
                }
                .padding()
            }
    }
}

// MARK: - Preview

#Preview("Normal") {
    TerminalContainerView(sessionId: "test-session-id")
        .frame(height: 300)
        .padding()
}

#Preview("Full Screen") {
    TerminalContainerView(sessionId: "test-session-id", isFullScreen: true)
}

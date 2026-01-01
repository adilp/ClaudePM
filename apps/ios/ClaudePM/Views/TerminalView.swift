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

    /// Callback when scroll mode changes
    var onScrollModeChanged: ((Bool) -> Void)?

    /// Reference to coordinator for external control (e.g., exit scroll mode button)
    var coordinatorRef: ((Coordinator) -> Void)?

    init(sessionId: String, connection: PtyConnection, fontSize: CGFloat = TerminalFont.defaultSize, onDimensionsReady: ((Int, Int) -> Void)? = nil, onScrollModeChanged: ((Bool) -> Void)? = nil, coordinatorRef: ((Coordinator) -> Void)? = nil) {
        self.sessionId = sessionId
        self.connection = connection
        self.fontSize = fontSize
        self.onDimensionsReady = onDimensionsReady
        self.onScrollModeChanged = onScrollModeChanged
        self.coordinatorRef = coordinatorRef
    }

    func makeUIView(context: Context) -> SwiftTerm.TerminalView {
        let terminal = SwiftTerm.TerminalView(frame: .zero)

        // Configure terminal appearance with Nerd Font
        terminal.font = TerminalFont.regular(size: fontSize)

        // Set colors for better visibility
        terminal.nativeBackgroundColor = UIColor.black
        terminal.nativeForegroundColor = UIColor.white

        // Allow mouse reporting for tmux scroll support (works with tmux's `set -g mouse on`)
        terminal.allowMouseReporting = true
        print("[TerminalView] Created terminal with allowMouseReporting=\(terminal.allowMouseReporting)")

        // Store terminal reference and sessionId in coordinator
        context.coordinator.terminal = terminal
        context.coordinator.sessionId = sessionId

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

        // Wire up scroll mode callback
        context.coordinator.onScrollModeChanged = onScrollModeChanged

        // Expose coordinator reference for external control
        coordinatorRef?(context.coordinator)

        // Add pan gesture recognizer for scroll support
        let panGesture = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handlePanGesture(_:)))
        panGesture.delegate = context.coordinator
        terminal.addGestureRecognizer(panGesture)
        print("[TerminalView] Added pan gesture recognizer")

        return terminal
    }

    func updateUIView(_ uiView: SwiftTerm.TerminalView, context: Context) {
        // Update font size if changed
        if uiView.font.pointSize != fontSize {
            uiView.font = TerminalFont.regular(size: fontSize)
        }

        // Keep callbacks updated (SwiftUI may recreate closures)
        context.coordinator.onScrollModeChanged = onScrollModeChanged
        context.coordinator.sessionId = sessionId

        // Re-expose coordinator reference if needed
        coordinatorRef?(context.coordinator)
    }

    static func dismantleUIView(_ uiView: SwiftTerm.TerminalView, coordinator: Coordinator) {
        // Disconnect when the view is removed
        coordinator.connection.disconnect()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(connection: connection, onDimensionsReady: onDimensionsReady)
    }

    // MARK: - Coordinator

    class Coordinator: NSObject, TerminalViewDelegate, UIGestureRecognizerDelegate {
        let connection: PtyConnection
        var terminal: SwiftTerm.TerminalView?
        var sessionId: String?
        var onDimensionsReady: ((Int, Int) -> Void)?
        private var hasReportedDimensions = false

        // Scroll gesture tracking
        private var lastScrollY: CGFloat = 0
        private var accumulatedScrollDelta: CGFloat = 0
        private let scrollThreshold: CGFloat = 10 // Points needed to trigger a scroll action (very responsive)

        // Scroll mode state
        private(set) var isInScrollMode = false
        var onScrollModeChanged: ((Bool) -> Void)?

        // Haptic feedback generators
        private let lightHaptic = UIImpactFeedbackGenerator(style: .light)
        private let mediumHaptic = UIImpactFeedbackGenerator(style: .medium)

        // Momentum scrolling
        private var momentumTimer: Timer?
        private var currentVelocity: CGFloat = 0
        private let velocityDecay: CGFloat = 0.85
        private let minVelocityThreshold: CGFloat = 100

        init(connection: PtyConnection, onDimensionsReady: ((Int, Int) -> Void)?) {
            self.connection = connection
            self.onDimensionsReady = onDimensionsReady
            super.init()
            // Prepare haptic engines
            lightHaptic.prepare()
            mediumHaptic.prepare()
        }

        // MARK: - Gesture Handling

        /// Allow pan gesture to work alongside other gestures
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
            return true
        }

        @objc func handlePanGesture(_ gesture: UIPanGestureRecognizer) {
            let translation = gesture.translation(in: gesture.view)
            let velocity = gesture.velocity(in: gesture.view)

            switch gesture.state {
            case .began:
                print("[TerminalView] Pan gesture BEGAN")
                lastScrollY = 0
                accumulatedScrollDelta = 0
                // Stop any momentum scrolling
                stopMomentumScrolling()

            case .changed:
                let deltaY = translation.y - lastScrollY
                lastScrollY = translation.y
                accumulatedScrollDelta += deltaY

                // Trigger scroll when threshold is reached
                if abs(accumulatedScrollDelta) >= scrollThreshold {
                    // Note: Swipe DOWN means scroll UP (see older content), swipe UP means scroll DOWN
                    let scrollDirection = accumulatedScrollDelta > 0 ? "up" : "down"

                    // Enter scroll mode on first scroll
                    if !isInScrollMode {
                        enterScrollMode()
                    }

                    sendScrollCommand(direction: scrollDirection)

                    // Light haptic feedback
                    lightHaptic.impactOccurred()

                    accumulatedScrollDelta = 0
                }

            case .ended, .cancelled:
                print("[TerminalView] Pan gesture ENDED, velocity=\(velocity.y)")

                // Start momentum scrolling if velocity is high enough
                if abs(velocity.y) > minVelocityThreshold && isInScrollMode {
                    startMomentumScrolling(initialVelocity: velocity.y)
                }

            default:
                break
            }
        }

        // MARK: - Scroll Mode Management

        private func enterScrollMode() {
            guard !isInScrollMode else { return }
            isInScrollMode = true
            mediumHaptic.impactOccurred()
            print("[TerminalView] Entered scroll mode, callback exists: \(onScrollModeChanged != nil)")
            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                print("[TerminalView] Calling onScrollModeChanged(true)")
                self.onScrollModeChanged?(true)
            }
        }

        func exitScrollMode() {
            print("[TerminalView] exitScrollMode() called, isInScrollMode=\(isInScrollMode), sessionId=\(sessionId ?? "nil")")
            guard isInScrollMode else {
                print("[TerminalView] Not in scroll mode, ignoring exit")
                return
            }
            stopMomentumScrolling()

            guard let sessionId = sessionId else {
                print("[TerminalView] No sessionId, cannot exit scroll mode")
                return
            }

            Task {
                do {
                    try await APIClient.shared.sendScrollCommand(sessionId: sessionId, action: "exit")
                    await MainActor.run { [weak self] in
                        guard let self = self else { return }
                        self.isInScrollMode = false
                        self.mediumHaptic.impactOccurred()
                        print("[TerminalView] Exited scroll mode, calling callback")
                        self.onScrollModeChanged?(false)
                    }
                } catch {
                    print("[TerminalView] Exit scroll mode failed: \(error)")
                }
            }
        }

        // MARK: - Momentum Scrolling

        private func startMomentumScrolling(initialVelocity: CGFloat) {
            currentVelocity = initialVelocity

            momentumTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
                self?.performMomentumScroll()
            }
        }

        private func stopMomentumScrolling() {
            momentumTimer?.invalidate()
            momentumTimer = nil
            currentVelocity = 0
        }

        private func performMomentumScroll() {
            // Decay velocity
            currentVelocity *= velocityDecay

            // Stop if velocity is too low
            if abs(currentVelocity) < minVelocityThreshold {
                stopMomentumScrolling()
                return
            }

            // Scroll based on velocity direction
            let scrollDirection = currentVelocity > 0 ? "up" : "down"
            sendScrollCommand(direction: scrollDirection)
        }

        private func sendScrollCommand(direction: String) {
            guard let sessionId = sessionId else {
                print("[TerminalView] No sessionId for scroll command")
                return
            }

            Task {
                do {
                    try await APIClient.shared.sendScrollCommand(sessionId: sessionId, action: direction)
                    print("[TerminalView] Scroll command sent: \(direction)")
                } catch {
                    print("[TerminalView] Scroll command failed: \(error)")
                }
            }
        }

        /// Called when the terminal wants to send data (user input)
        func send(source: SwiftTerm.TerminalView, data: ArraySlice<UInt8>) {
            let str = String(bytes: data, encoding: .utf8) ?? ""
            // Debug: log what's being sent (hex for escape sequences)
            let hexStr = data.map { String(format: "%02x", $0) }.joined(separator: " ")
            print("[TerminalView] send: \"\(str.debugDescription)\" hex=[\(hexStr)]")
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
            print("[TerminalView] scrolled: position=\(position)")
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
            print("[TerminalView] selectionChanged")
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
            print("[TerminalView] mouseModeChanged: mode=\(mode)")
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
            print("[TerminalView] rangeChanged: startY=\(startY) endY=\(endY)")
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

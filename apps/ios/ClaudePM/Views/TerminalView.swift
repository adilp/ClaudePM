import SwiftUI
import SwiftTerm

/// SwiftUI wrapper for SwiftTerm terminal view
/// Displays live terminal output from a Claude session
struct TerminalView: UIViewRepresentable {
    let sessionId: String
    @Bindable var connection: PtyConnection

    func makeUIView(context: Context) -> SwiftTerm.TerminalView {
        let terminal = SwiftTerm.TerminalView(frame: .zero)

        // Configure terminal appearance
        terminal.font = UIFont.monospacedSystemFont(ofSize: 14, weight: .regular)

        // Set background color for better visibility
        terminal.nativeBackgroundColor = UIColor.black
        terminal.nativeForegroundColor = UIColor.white

        // Set up data handler before connecting
        connection.onData = { data in
            let bytes = ArraySlice(Array(data.utf8))
            terminal.feed(byteArray: bytes)
        }

        // Set the terminal delegate for input handling
        terminal.terminalDelegate = context.coordinator

        // Connect to WebSocket
        connection.connect()

        // Attach after a brief delay to ensure connection is established
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            // Use default terminal size (80x24) initially
            // The delegate will be called when the view is sized properly
            connection.attach(cols: 80, rows: 24)
        }

        return terminal
    }

    func updateUIView(_ uiView: SwiftTerm.TerminalView, context: Context) {
        // No updates needed - the terminal handles its own state
    }

    static func dismantleUIView(_ uiView: SwiftTerm.TerminalView, coordinator: Coordinator) {
        // Disconnect when the view is removed
        coordinator.connection.disconnect()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(connection: connection)
    }

    // MARK: - Coordinator

    class Coordinator: NSObject, TerminalViewDelegate {
        let connection: PtyConnection

        init(connection: PtyConnection) {
            self.connection = connection
            super.init()
        }

        /// Called when the terminal wants to send data (user input)
        func send(source: SwiftTerm.TerminalView, data: ArraySlice<UInt8>) {
            let str = String(bytes: data, encoding: .utf8) ?? ""
            connection.send(str)
        }

        /// Called when the terminal size changes
        func sizeChanged(source: SwiftTerm.TerminalView, newCols: Int, newRows: Int) {
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
            // Could play haptic feedback here
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

// MARK: - Terminal Container View

/// Container view for the terminal with connection status overlay
struct TerminalContainerView: View {
    let sessionId: String
    @State private var connection: PtyConnection

    init(sessionId: String) {
        self.sessionId = sessionId
        self._connection = State(initialValue: PtyConnection(sessionId: sessionId))
    }

    var body: some View {
        ZStack {
            // Terminal view
            TerminalView(sessionId: sessionId, connection: connection)
                .clipShape(RoundedRectangle(cornerRadius: 12))

            // Connection status overlay
            if !connection.isAttached {
                connectionOverlay
            }
        }
    }

    private var connectionOverlay: some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(.black.opacity(0.7))
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
                    } else if connection.isConnected {
                        ProgressView()
                            .tint(.white)
                        Text("Attaching to terminal...")
                            .font(.subheadline)
                            .foregroundStyle(.white)
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

#Preview {
    TerminalContainerView(sessionId: "test-session-id")
        .frame(height: 300)
        .padding()
}

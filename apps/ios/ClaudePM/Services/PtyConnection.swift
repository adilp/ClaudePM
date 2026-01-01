import Foundation

/// Manages PTY WebSocket connection for terminal I/O
/// Uses the main WebSocket endpoint with message-based protocol
/// Includes auto-reconnect with exponential backoff
@Observable
final class PtyConnection {
    // MARK: - Published Properties

    /// Whether connected to WebSocket server
    var isConnected = false

    /// Whether attached to session's PTY
    var isAttached = false

    /// Whether currently attempting to reconnect
    var isReconnecting = false

    /// Current reconnection attempt number (0 if not reconnecting)
    var reconnectAttempt = 0

    /// Error message if connection fails
    var errorMessage: String?

    // MARK: - Callbacks

    /// Called when terminal output data is received
    var onData: ((String) -> Void)?

    /// Called when PTY exits
    var onExit: ((Int) -> Void)?

    /// Called when connection state changes
    var onConnectionStateChange: ((Bool) -> Void)?

    // MARK: - Private Properties

    private var webSocket: URLSessionWebSocketTask?
    private var urlSession: URLSession?
    private var receiveTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private let sessionId: String

    /// Last known terminal dimensions for re-attach after reconnect
    private var lastCols: Int = 80
    private var lastRows: Int = 24

    /// Whether auto-reconnect is enabled
    private var autoReconnectEnabled = true

    /// Maximum reconnection attempts before giving up
    private let maxReconnectAttempts = 10

    /// Base delay for exponential backoff (in seconds)
    private let baseReconnectDelay: Double = 1.0

    /// Maximum delay between reconnection attempts (in seconds)
    private let maxReconnectDelay: Double = 30.0

    // MARK: - Initialization

    init(sessionId: String) {
        self.sessionId = sessionId
    }

    deinit {
        autoReconnectEnabled = false
        disconnect()
    }

    // MARK: - Connection Management

    /// Connect to the main WebSocket endpoint
    func connect() {
        guard !isConnected else { return }

        guard let baseURLString = UserDefaults.standard.string(forKey: "backendURL"),
              var urlComponents = URLComponents(string: baseURLString) else {
            errorMessage = "No backend URL configured"
            return
        }

        // Convert http/https to ws/wss
        if urlComponents.scheme == "https" {
            urlComponents.scheme = "wss"
        } else {
            urlComponents.scheme = "ws"
        }

        // Add API key if available
        if let apiKey = KeychainHelper.getAPIKey() {
            urlComponents.queryItems = [URLQueryItem(name: "apiKey", value: apiKey)]
        }

        guard let url = urlComponents.url else {
            errorMessage = "Invalid WebSocket URL"
            return
        }

        print("[PtyConnection] Connecting to \(url.absoluteString)")

        // Clear any previous error
        errorMessage = nil

        // Create URLSession with delegate for connection events
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        urlSession = URLSession(configuration: config)

        // Create WebSocket task
        webSocket = urlSession?.webSocketTask(with: url)
        webSocket?.resume()

        // Start receiving messages immediately
        startReceiving()

        // Mark as connected after a brief moment to allow WebSocket handshake
        // The actual connection confirmation comes from successful message receiving
        Task { @MainActor in
            // Give WebSocket time to establish
            try? await Task.sleep(nanoseconds: 100_000_000) // 100ms
            if webSocket?.state == .running {
                isConnected = true
                isReconnecting = false
                reconnectAttempt = 0
                onConnectionStateChange?(true)
                print("[PtyConnection] Connected")
            }
        }
    }

    /// Disconnect from WebSocket
    func disconnect() {
        print("[PtyConnection] Disconnecting")

        // Disable auto-reconnect during intentional disconnect
        autoReconnectEnabled = false

        // Detach from PTY first
        if isAttached {
            detach()
        }

        // Cancel tasks
        receiveTask?.cancel()
        receiveTask = nil
        reconnectTask?.cancel()
        reconnectTask = nil

        // Close WebSocket
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        urlSession?.invalidateAndCancel()
        urlSession = nil

        isConnected = false
        isAttached = false
        isReconnecting = false
        reconnectAttempt = 0
    }

    /// Manually trigger a reconnection
    func reconnect() {
        disconnect()
        autoReconnectEnabled = true
        errorMessage = nil
        reconnectAttempt = 0
        connect()
    }

    // MARK: - Auto-Reconnect

    /// Schedule an automatic reconnection with exponential backoff
    private func scheduleReconnect() {
        guard autoReconnectEnabled else { return }
        guard reconnectAttempt < maxReconnectAttempts else {
            print("[PtyConnection] Max reconnection attempts reached")
            errorMessage = "Connection lost. Tap to retry."
            isReconnecting = false
            return
        }

        reconnectAttempt += 1
        isReconnecting = true

        // Calculate delay with exponential backoff: base * 2^(attempt-1)
        let delay = min(baseReconnectDelay * pow(2.0, Double(reconnectAttempt - 1)), maxReconnectDelay)

        print("[PtyConnection] Scheduling reconnect attempt \(reconnectAttempt) in \(delay)s")

        reconnectTask?.cancel()
        reconnectTask = Task { [weak self] in
            guard let self = self else { return }

            do {
                try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))

                guard !Task.isCancelled else { return }

                await MainActor.run {
                    // Clean up old connection
                    self.webSocket?.cancel(with: .goingAway, reason: nil)
                    self.webSocket = nil
                    self.urlSession?.invalidateAndCancel()
                    self.urlSession = nil
                    self.isConnected = false
                    self.isAttached = false

                    // Attempt to reconnect
                    self.connect()

                    // If we had dimensions, re-attach after connection
                    if self.lastCols > 0 && self.lastRows > 0 {
                        Task {
                            // Wait for connection to establish
                            for _ in 0..<30 {
                                try? await Task.sleep(nanoseconds: 100_000_000) // 100ms
                                if self.isConnected {
                                    await MainActor.run {
                                        self.attach(cols: self.lastCols, rows: self.lastRows)
                                    }
                                    break
                                }
                            }
                        }
                    }
                }
            } catch {
                // Task was cancelled
            }
        }
    }

    // MARK: - PTY Operations

    /// Attach to the session's PTY for terminal I/O
    /// - Parameters:
    ///   - cols: Terminal width in columns
    ///   - rows: Terminal height in rows
    func attach(cols: Int = 80, rows: Int = 24) {
        // Store dimensions for re-attach on reconnect
        lastCols = cols
        lastRows = rows

        let msg: [String: Any] = [
            "type": "pty:attach",
            "payload": [
                "sessionId": sessionId,
                "cols": cols,
                "rows": rows
            ]
        ]
        sendJSON(msg)
        print("[PtyConnection] Attaching to session \(sessionId) (\(cols)x\(rows))")
    }

    /// Detach from PTY
    func detach() {
        let msg: [String: Any] = [
            "type": "pty:detach",
            "payload": ["sessionId": sessionId]
        ]
        sendJSON(msg)
        isAttached = false
        print("[PtyConnection] Detaching from session \(sessionId)")
    }

    /// Select and zoom the pane in tmux
    /// Call this after attaching to maximize the pane for mobile viewing
    func selectAndZoomPane() {
        let msg: [String: Any] = [
            "type": "pty:selectPane",
            "payload": ["sessionId": sessionId]
        ]
        sendJSON(msg)
        print("[PtyConnection] Selecting and zooming pane for session \(sessionId)")
    }

    /// Send terminal input to PTY
    /// - Parameter text: The text to send
    func send(_ text: String) {
        guard isAttached else {
            print("[PtyConnection] Warning: Dropping input - not attached")
            return
        }

        let msg: [String: Any] = [
            "type": "pty:data",
            "payload": [
                "sessionId": sessionId,
                "data": text
            ]
        ]
        sendJSON(msg)
    }

    /// Resize the PTY terminal
    /// - Parameters:
    ///   - cols: New terminal width in columns
    ///   - rows: New terminal height in rows
    func resize(cols: Int, rows: Int) {
        // Always update stored dimensions
        lastCols = cols
        lastRows = rows

        guard isAttached else { return }

        let msg: [String: Any] = [
            "type": "pty:resize",
            "payload": [
                "sessionId": sessionId,
                "cols": cols,
                "rows": rows
            ]
        ]
        sendJSON(msg)
        print("[PtyConnection] Resizing to \(cols)x\(rows)")
    }

    // MARK: - Private Methods

    /// Start receiving messages from WebSocket
    private func startReceiving() {
        receiveTask?.cancel()
        receiveTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self = self, let webSocket = self.webSocket else { break }

                do {
                    let message = try await webSocket.receive()
                    await self.handleMessage(message)
                } catch {
                    if !Task.isCancelled {
                        print("[PtyConnection] Receive error: \(error.localizedDescription)")
                        await MainActor.run {
                            self.isConnected = false
                            self.isAttached = false
                            self.onConnectionStateChange?(false)

                            // Attempt auto-reconnect
                            self.scheduleReconnect()
                        }
                    }
                    break
                }
            }
        }
    }

    /// Handle received WebSocket message
    @MainActor
    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        switch message {
        case .string(let text):
            parseMessage(text)
        case .data(let data):
            if let text = String(data: data, encoding: .utf8) {
                parseMessage(text)
            }
        @unknown default:
            break
        }
    }

    /// Parse a JSON message from the server
    private func parseMessage(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else {
            return
        }

        let payload = json["payload"] as? [String: Any] ?? [:]

        switch type {
        case "pty:attached":
            handlePtyAttached(payload)
        case "pty:detached":
            handlePtyDetached(payload)
        case "pty:output":
            handlePtyOutput(payload)
        case "pty:exit":
            handlePtyExit(payload)
        case "error":
            handleError(payload)
        case "pong":
            // Heartbeat response, ignore
            break
        default:
            // Ignore other message types (session updates, etc.)
            break
        }
    }

    /// Handle PTY attached confirmation
    private func handlePtyAttached(_ payload: [String: Any]) {
        guard let payloadSessionId = payload["sessionId"] as? String,
              payloadSessionId == sessionId else { return }

        let cols = payload["cols"] as? Int ?? 80
        let rows = payload["rows"] as? Int ?? 24
        print("[PtyConnection] Attached to session \(sessionId) (\(cols)x\(rows))")

        // Store confirmed dimensions
        lastCols = cols
        lastRows = rows

        isAttached = true

        // Clear any reconnect state on successful attach
        isReconnecting = false
        reconnectAttempt = 0
        errorMessage = nil

        // Select and zoom the pane for optimal mobile viewing
        selectAndZoomPane()
    }

    /// Handle PTY detached confirmation
    private func handlePtyDetached(_ payload: [String: Any]) {
        guard let payloadSessionId = payload["sessionId"] as? String,
              payloadSessionId == sessionId else { return }

        print("[PtyConnection] Detached from session \(sessionId)")
        isAttached = false
    }

    /// Handle PTY output data
    private func handlePtyOutput(_ payload: [String: Any]) {
        guard let payloadSessionId = payload["sessionId"] as? String,
              payloadSessionId == sessionId,
              let outputData = payload["data"] as? String else { return }

        onData?(outputData)
    }

    /// Handle PTY exit
    private func handlePtyExit(_ payload: [String: Any]) {
        guard let payloadSessionId = payload["sessionId"] as? String,
              payloadSessionId == sessionId else { return }

        let exitCode = payload["exitCode"] as? Int ?? -1
        print("[PtyConnection] PTY exited for session \(sessionId) with code \(exitCode)")
        isAttached = false
        onExit?(exitCode)
    }

    /// Handle error message
    private func handleError(_ payload: [String: Any]) {
        let code = payload["code"] as? String ?? "UNKNOWN"
        let message = payload["message"] as? String ?? "Unknown error"
        print("[PtyConnection] Error [\(code)]: \(message)")
        errorMessage = message
    }

    /// Send JSON message to WebSocket
    private func sendJSON(_ dict: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let str = String(data: data, encoding: .utf8) else { return }

        webSocket?.send(.string(str)) { [weak self] error in
            if let error = error {
                print("[PtyConnection] Send error: \(error.localizedDescription)")
                // Trigger reconnect on send failure
                Task { @MainActor [weak self] in
                    self?.scheduleReconnect()
                }
            }
        }
    }
}

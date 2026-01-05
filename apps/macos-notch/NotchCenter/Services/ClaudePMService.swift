import Foundation
import Combine

/// Connection state for Claude PM WebSocket
enum ClaudePMConnectionState: Equatable {
    case disconnected
    case connecting
    case connected
    case reconnecting(attempt: Int)
    case error(String)

    var isConnected: Bool {
        if case .connected = self { return true }
        return false
    }

    var displayText: String {
        switch self {
        case .disconnected:
            return "Disconnected"
        case .connecting:
            return "Connecting..."
        case .connected:
            return "Connected"
        case .reconnecting(let attempt):
            return "Reconnecting (\(attempt)/10)..."
        case .error(let message):
            return "Error: \(message)"
        }
    }

    var statusColor: String {
        switch self {
        case .disconnected, .error:
            return "red"
        case .connecting, .reconnecting:
            return "yellow"
        case .connected:
            return "green"
        }
    }
}

/// WebSocket client for Claude PM server notifications
@MainActor
final class ClaudePMService: ObservableObject {
    // MARK: - Singleton

    static let shared = ClaudePMService()

    // MARK: - Published Properties

    @Published var connectionState: ClaudePMConnectionState = .disconnected
    @Published var serverURL: String = ""

    // MARK: - Callbacks

    /// Called when a session notification is received (with ticket title fetched)
    var onNotification: ((SessionNotification) -> Void)?

    // MARK: - Private Properties

    private var webSocket: URLSessionWebSocketTask?
    private var urlSession: URLSession?
    private var reconnectAttempts = 0
    private var reconnectTask: Task<Void, Never>?
    private var pingTask: Task<Void, Never>?
    private var receiveTask: Task<Void, Never>?

    private let maxReconnectAttempts = 10
    private let maxReconnectDelay: Double = 30.0
    private let pingInterval: TimeInterval = 25.0

    // MARK: - Initialization

    private init() {
        // Load saved server URL
        serverURL = UserDefaults.standard.string(forKey: "claudePMServerURL") ?? "http://localhost:4847"
    }

    // MARK: - Connection Management

    /// Connect to the Claude PM WebSocket server
    func connect() {
        // Don't connect if already connected or connecting
        if connectionState.isConnected {
            print("[ClaudePM] Already connected, skipping")
            return
        }
        if case .connecting = connectionState {
            print("[ClaudePM] Already connecting, skipping")
            return
        }

        // Cancel any pending reconnect
        reconnectTask?.cancel()
        reconnectTask = nil

        guard !serverURL.isEmpty else {
            print("[ClaudePM] No server URL configured")
            connectionState = .disconnected
            return
        }

        guard var urlComponents = URLComponents(string: serverURL) else {
            print("[ClaudePM] Invalid server URL: \(serverURL)")
            connectionState = .error("Invalid URL")
            return
        }

        // Convert http/https to ws/wss
        if urlComponents.scheme == "https" {
            urlComponents.scheme = "wss"
        } else if urlComponents.scheme == "http" {
            urlComponents.scheme = "ws"
        } else if urlComponents.scheme != "ws" && urlComponents.scheme != "wss" {
            // Default to ws if no scheme
            urlComponents.scheme = "ws"
        }

        // Force IPv4 by replacing localhost with 127.0.0.1
        // macOS sometimes prefers IPv6 (::1) which can cause connection issues
        if urlComponents.host == "localhost" {
            urlComponents.host = "127.0.0.1"
        }

        guard let url = urlComponents.url else {
            print("[ClaudePM] Could not construct WebSocket URL")
            connectionState = .error("Invalid URL")
            return
        }

        print("[ClaudePM] Connecting to \(url.absoluteString)")

        // Update state
        if reconnectAttempts == 0 {
            connectionState = .connecting
        } else {
            connectionState = .reconnecting(attempt: reconnectAttempts)
        }

        // Create URLSession
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        urlSession = URLSession(configuration: config)

        // Create WebSocket task
        webSocket = urlSession?.webSocketTask(with: url)
        webSocket?.resume()

        // Start receiving messages - connection state will be updated on first successful receive
        startReceiving()

        // Send immediate ping to verify connection
        sendPing()

        // Start periodic ping task
        startPingTask()

        // Don't set connected here - wait for first successful message/pong
        print("[ClaudePM] Connection initiated, waiting for response...")
    }

    /// Disconnect from the WebSocket server
    func disconnect() {
        print("[ClaudePM] Disconnecting")

        // Cancel tasks
        reconnectTask?.cancel()
        reconnectTask = nil
        pingTask?.cancel()
        pingTask = nil
        receiveTask?.cancel()
        receiveTask = nil

        // Close WebSocket
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        urlSession?.invalidateAndCancel()
        urlSession = nil

        // Reset state
        reconnectAttempts = 0
        connectionState = .disconnected
    }

    /// Save server URL and optionally connect
    func setServerURL(_ url: String, andConnect: Bool = false) {
        serverURL = url
        UserDefaults.standard.set(url, forKey: "claudePMServerURL")

        if andConnect && !url.isEmpty {
            connect()
        }
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
                        print("[ClaudePM] Receive error: \(error.localizedDescription)")
                        await MainActor.run {
                            self.handleDisconnect()
                        }
                    }
                    break
                }
            }
        }
    }

    /// Start periodic ping task
    private func startPingTask() {
        pingTask?.cancel()
        pingTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(self?.pingInterval ?? 25))
                if !Task.isCancelled {
                    self?.sendPing()
                }
            }
        }
    }

    /// Send ping message
    private func sendPing() {
        let message: [String: Any] = [
            "type": "ping",
            "payload": [:]
        ]

        guard let data = try? JSONSerialization.data(withJSONObject: message),
              let jsonString = String(data: data, encoding: .utf8) else {
            return
        }

        webSocket?.send(.string(jsonString)) { [weak self] error in
            if let error = error {
                print("[ClaudePM] Ping failed: \(error.localizedDescription)")
                Task { @MainActor in
                    self?.handleDisconnect()
                }
            }
        }
    }

    /// Handle received WebSocket message
    private func handleMessage(_ message: URLSessionWebSocketTask.Message) async {
        // Mark as connected on first successful message receive
        await MainActor.run {
            if !self.connectionState.isConnected {
                self.connectionState = .connected
                self.reconnectAttempts = 0
                print("[ClaudePM] Connected successfully (received first message)")
            }
        }

        switch message {
        case .string(let text):
            await parseMessage(text)
        case .data(let data):
            if let text = String(data: data, encoding: .utf8) {
                await parseMessage(text)
            }
        @unknown default:
            break
        }
    }

    /// Parse JSON message from server
    private func parseMessage(_ text: String) async {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else {
            print("[ClaudePM] Failed to parse message: \(text.prefix(100))")
            return
        }

        // Log all incoming messages for debugging
        print("[ClaudePM] Received message type: \(type)")

        guard let payload = json["payload"] as? [String: Any] else {
            if type == "pong" {
                // Expected heartbeat response
                print("[ClaudePM] Received pong")
            }
            return
        }

        switch type {
        case "session:status":
            print("[ClaudePM] Processing session:status")
            await handleSessionStatus(payload)
        case "session:waiting":
            print("[ClaudePM] Processing session:waiting")
            await handleSessionWaiting(payload)
        case "notification":
            print("[ClaudePM] Processing notification")
            await handleNotification(payload)
        case "review:result":
            print("[ClaudePM] Processing review:result")
            await handleReviewResult(payload)
        case "pong":
            // Heartbeat response - don't log to reduce noise
            break
        default:
            print("[ClaudePM] Ignoring message type: \(type)")
            break
        }
    }

    /// Handle session status change
    private func handleSessionStatus(_ payload: [String: Any]) async {
        guard let sessionId = payload["sessionId"] as? String,
              let newStatus = payload["newStatus"] as? String else {
            return
        }

        // Only notify for completed or error statuses
        guard newStatus == "completed" || newStatus == "error" else {
            return
        }

        print("[ClaudePM] Session \(sessionId) status: \(newStatus)")

        // Fetch ticket title
        let ticketTitle = await ClaudePMAPIClient.shared.getTicketTitle(
            sessionId: sessionId,
            baseURL: serverURL
        )

        // Create notification
        let notification: SessionNotification
        if newStatus == "completed" {
            notification = .completed(sessionId: sessionId, ticketTitle: ticketTitle)
        } else {
            let errorMessage = payload["error"] as? String
            notification = .error(sessionId: sessionId, ticketTitle: ticketTitle, message: errorMessage)
        }

        // Notify on main actor
        await MainActor.run {
            print("[ClaudePM] Calling onNotification callback (exists: \(self.onNotification != nil))")
            self.onNotification?(notification)
        }
    }

    /// Handle session waiting state
    private func handleSessionWaiting(_ payload: [String: Any]) async {
        guard let sessionId = payload["sessionId"] as? String,
              let waiting = payload["waiting"] as? Bool else {
            print("[ClaudePM] session:waiting missing required fields")
            return
        }

        guard waiting == true else {
            print("[ClaudePM] session:waiting with waiting=false, ignoring")
            return
        }

        let reason = payload["reason"] as? String
        print("[ClaudePM] Session \(sessionId) waiting for input, reason: \(reason ?? "unknown")")

        // Fetch ticket title
        print("[ClaudePM] Fetching ticket title for session \(sessionId)...")
        let ticketTitle = await ClaudePMAPIClient.shared.getTicketTitle(
            sessionId: sessionId,
            baseURL: serverURL
        )
        print("[ClaudePM] Got ticket title: \(ticketTitle ?? "nil")")

        // Create notification
        let notification = SessionNotification.inputRequired(
            sessionId: sessionId,
            ticketTitle: ticketTitle,
            reason: reason
        )

        // Notify on main actor
        await MainActor.run {
            print("[ClaudePM] Calling onNotification callback for inputRequired (exists: \(self.onNotification != nil))")
            self.onNotification?(notification)
        }
    }

    /// Handle generic notification from server
    private func handleNotification(_ payload: [String: Any]) async {
        let title = payload["title"] as? String ?? "Notification"
        let body = payload["body"] as? String
        let sessionId = payload["sessionId"] as? String
        let ticketId = payload["ticketId"] as? String

        print("[ClaudePM] Notification: \(title) - \(body ?? "no body")")

        // Determine notification type based on title content
        let notification: SessionNotification
        if title.lowercased().contains("complete") || title.lowercased().contains("ready for review") {
            notification = .completed(sessionId: sessionId ?? "unknown", ticketTitle: body)
        } else if title.lowercased().contains("input") || title.lowercased().contains("waiting") {
            notification = .inputRequired(sessionId: sessionId ?? "unknown", ticketTitle: body, reason: nil)
        } else if title.lowercased().contains("error") || title.lowercased().contains("failed") {
            notification = .error(sessionId: sessionId ?? "unknown", ticketTitle: body, message: nil)
        } else {
            // Default to completed for general notifications
            notification = .completed(sessionId: sessionId ?? "unknown", ticketTitle: "\(title): \(body ?? "")")
        }

        await MainActor.run {
            print("[ClaudePM] Calling onNotification callback for notification (exists: \(self.onNotification != nil))")
            self.onNotification?(notification)
        }
    }

    /// Handle review result from subagent
    private func handleReviewResult(_ payload: [String: Any]) async {
        let sessionId = payload["sessionId"] as? String ?? "unknown"
        let ticketId = payload["ticketId"] as? String
        let decision = payload["decision"] as? String ?? "unknown"
        let reasoning = payload["reasoning"] as? String

        print("[ClaudePM] Review result: \(decision) for ticket \(ticketId ?? "unknown")")

        // All review results use .completed so they auto-dismiss
        // The title indicates the actual decision
        let title: String
        switch decision {
        case "complete":
            title = "Review Complete"
        case "not_complete":
            title = "Review: Not Complete"
        case "needs_clarification":
            title = "Review: Needs Clarification"
        default:
            title = "Review: \(decision)"
        }

        let notification = SessionNotification.completed(
            sessionId: sessionId,
            ticketTitle: "\(title)\n\(reasoning ?? "")"
        )

        await MainActor.run {
            print("[ClaudePM] Calling onNotification callback for review (exists: \(self.onNotification != nil))")
            self.onNotification?(notification)
        }
    }

    /// Handle disconnection and schedule reconnect
    private func handleDisconnect() {
        guard connectionState != .disconnected else { return }

        print("[ClaudePM] Connection lost, scheduling reconnect")

        // Clean up current connection
        pingTask?.cancel()
        pingTask = nil
        receiveTask?.cancel()
        receiveTask = nil
        webSocket?.cancel(with: .abnormalClosure, reason: nil)
        webSocket = nil

        // Schedule reconnect
        scheduleReconnect()
    }

    /// Schedule reconnection with exponential backoff
    private func scheduleReconnect() {
        reconnectAttempts += 1

        if reconnectAttempts > maxReconnectAttempts {
            print("[ClaudePM] Max reconnect attempts reached")
            connectionState = .error("Connection failed after \(maxReconnectAttempts) attempts")
            return
        }

        let delay = min(pow(2.0, Double(reconnectAttempts)), maxReconnectDelay)
        connectionState = .reconnecting(attempt: reconnectAttempts)

        print("[ClaudePM] Reconnecting in \(delay)s (attempt \(reconnectAttempts)/\(maxReconnectAttempts))")

        reconnectTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))

            guard !Task.isCancelled else { return }

            await MainActor.run {
                self?.connect()
            }
        }
    }
}

import Foundation
import Combine

/// WebSocket connection states
enum WebSocketState: Equatable {
    case disconnected
    case connecting
    case connected
    case reconnecting(attempt: Int)

    var isConnected: Bool {
        if case .connected = self {
            return true
        }
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
            return "Reconnecting... (attempt \(attempt))"
        }
    }
}

/// WebSocket client for receiving real-time session updates
@Observable
final class WebSocketClient {
    // MARK: - Published Properties

    /// Current connection state
    var state: WebSocketState = .disconnected

    /// Whether showing reconnecting indicator
    var isReconnecting: Bool {
        if case .reconnecting = state {
            return true
        }
        return false
    }

    // MARK: - Private Properties

    private var webSocket: URLSessionWebSocketTask?
    private var urlSession: URLSession?
    private var reconnectAttempts = 0
    private var reconnectTask: Task<Void, Never>?
    private var pingTask: Task<Void, Never>?
    private var receiveTask: Task<Void, Never>?

    /// Maximum reconnect delay in seconds
    private let maxReconnectDelay: Double = 30.0

    /// Ping interval in seconds
    private let pingInterval: TimeInterval = 25.0

    /// Callback for session updates
    var onSessionUpdate: ((SessionUpdate) -> Void)?

    // MARK: - Singleton

    static let shared = WebSocketClient()

    private init() {}

    // MARK: - Connection Management

    /// Connect to the WebSocket server
    func connect() {
        // Cancel any pending reconnect
        reconnectTask?.cancel()
        reconnectTask = nil

        guard let baseURLString = UserDefaults.standard.string(forKey: "backendURL"),
              var urlComponents = URLComponents(string: baseURLString) else {
            print("[WebSocket] No backend URL configured")
            state = .disconnected
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
            print("[WebSocket] Invalid WebSocket URL")
            state = .disconnected
            return
        }

        print("[WebSocket] Connecting to \(url.absoluteString)")

        // Update state
        if reconnectAttempts == 0 {
            state = .connecting
        } else {
            state = .reconnecting(attempt: reconnectAttempts)
        }

        // Create URLSession with delegate for pong handling
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        urlSession = URLSession(configuration: config)

        // Create WebSocket task
        webSocket = urlSession?.webSocketTask(with: url)
        webSocket?.resume()

        // Start receiving messages
        startReceiving()

        // Start ping task
        startPingTask()

        // Mark as connected after successful resume
        // The actual connection state will be updated when we receive/fail to receive messages
        Task { @MainActor in
            self.state = .connected
            self.reconnectAttempts = 0
            print("[WebSocket] Connected successfully to \(url.absoluteString)")
        }
    }

    /// Disconnect from the WebSocket server
    func disconnect() {
        print("[WebSocket] Disconnecting")

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
        state = .disconnected
    }

    // MARK: - Sending Messages

    /// Send a ping message to keep the connection alive
    func sendPing() {
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
                print("[WebSocket] Ping failed: \(error.localizedDescription)")
                self?.handleDisconnect()
            }
        }
    }

    // MARK: - Private Methods

    /// Start receiving messages from the WebSocket
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
                        print("[WebSocket] Receive error: \(error.localizedDescription)")
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

        guard let payload = json["payload"] as? [String: Any] else {
            // Some messages like pong might not have meaningful payloads
            if type == "pong" {
                print("[WebSocket] Received pong")
            }
            return
        }

        switch type {
        case "session:status":
            handleSessionStatus(payload)
        case "session:waiting":
            handleSessionWaiting(payload)
        case "session:context":
            handleSessionContext(payload)
        case "notification":
            handleNotification(payload)
        case "pong":
            print("[WebSocket] Received pong")
        case "error":
            handleError(payload)
        default:
            print("[WebSocket] Unknown message type: \(type)")
        }
    }

    /// Handle session status change message
    private func handleSessionStatus(_ payload: [String: Any]) {
        guard let sessionId = payload["sessionId"] as? String,
              let newStatusRaw = payload["newStatus"] as? String else {
            return
        }

        let previousStatusRaw = payload["previousStatus"] as? String

        print("[WebSocket] Session \(sessionId) status: \(previousStatusRaw ?? "?") -> \(newStatusRaw)")

        let update = SessionUpdate(
            type: .status,
            sessionId: sessionId,
            status: SessionStatus(rawValue: newStatusRaw),
            waiting: nil,
            waitingReason: nil,
            contextPercent: nil
        )

        onSessionUpdate?(update)
    }

    /// Handle session waiting message
    private func handleSessionWaiting(_ payload: [String: Any]) {
        guard let sessionId = payload["sessionId"] as? String,
              let waiting = payload["waiting"] as? Bool else {
            return
        }

        let reason = payload["reason"] as? String

        print("[WebSocket] Session \(sessionId) waiting: \(waiting), reason: \(reason ?? "none")")

        let update = SessionUpdate(
            type: .waiting,
            sessionId: sessionId,
            status: nil,
            waiting: waiting,
            waitingReason: reason,
            contextPercent: nil
        )

        onSessionUpdate?(update)
    }

    /// Handle session context update message
    private func handleSessionContext(_ payload: [String: Any]) {
        guard let sessionId = payload["sessionId"] as? String,
              let contextPercent = payload["contextPercent"] as? Int else {
            return
        }

        print("[WebSocket] Session \(sessionId) context: \(contextPercent)%")

        let update = SessionUpdate(
            type: .context,
            sessionId: sessionId,
            status: nil,
            waiting: nil,
            waitingReason: nil,
            contextPercent: contextPercent
        )

        onSessionUpdate?(update)
    }

    /// Handle notification message
    private func handleNotification(_ payload: [String: Any]) {
        guard let title = payload["title"] as? String,
              let body = payload["body"] as? String else {
            return
        }

        print("[WebSocket] Notification: \(title) - \(body)")
        // Notifications are handled via push notifications or can be shown in-app
    }

    /// Handle error message
    private func handleError(_ payload: [String: Any]) {
        let code = payload["code"] as? String ?? "UNKNOWN"
        let message = payload["message"] as? String ?? "Unknown error"
        print("[WebSocket] Error [\(code)]: \(message)")
    }

    /// Handle disconnection and schedule reconnect
    private func handleDisconnect() {
        guard state != .disconnected else { return }

        print("[WebSocket] Connection lost, scheduling reconnect")

        // Clean up current connection
        pingTask?.cancel()
        pingTask = nil
        receiveTask?.cancel()
        receiveTask = nil
        webSocket?.cancel(with: .abnormalClosure, reason: nil)
        webSocket = nil

        // Schedule reconnect with exponential backoff
        scheduleReconnect()
    }

    /// Schedule a reconnection attempt with exponential backoff
    private func scheduleReconnect() {
        reconnectAttempts += 1
        let delay = min(pow(2.0, Double(reconnectAttempts)), maxReconnectDelay)

        state = .reconnecting(attempt: reconnectAttempts)

        print("[WebSocket] Reconnecting in \(delay)s (attempt \(reconnectAttempts))")

        reconnectTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))

            guard !Task.isCancelled else { return }

            await MainActor.run {
                self?.connect()
            }
        }
    }
}

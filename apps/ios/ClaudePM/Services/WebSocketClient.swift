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
        // Session updates
        case "session:status":
            handleSessionStatus(payload)
        case "session:waiting":
            handleSessionWaiting(payload)
        case "session:context":
            handleSessionContext(payload)
        case "session:output":
            handleSessionOutput(payload)

        // Review and analysis
        case "review:result":
            handleReviewResult(payload)
        case "ai:analysis_status":
            handleAnalysisStatus(payload)

        // Ticket updates
        case "ticket:state":
            handleTicketState(payload)

        // Generic notification
        case "notification":
            handleNotification(payload)

        // Subscription confirmations
        case "subscribed":
            handleSubscribed(payload)
        case "unsubscribed":
            handleUnsubscribed(payload)

        // PTY (terminal) messages - log only for now
        case "pty:attached":
            handlePtyAttached(payload)
        case "pty:detached":
            handlePtyDetached(payload)
        case "pty:output":
            // High-frequency, just ignore
            break
        case "pty:exit":
            handlePtyExit(payload)

        // Heartbeat
        case "pong":
            // Expected response, no logging needed
            break

        // Errors
        case "error":
            handleError(payload)

        default:
            print("[WebSocket] Unhandled message type: \(type)")
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

        // Create in-app notification for significant status changes
        if newStatusRaw == "error" || newStatusRaw == "completed" {
            NotificationManager.shared.notifySessionStatus(
                sessionId: sessionId,
                previousStatus: previousStatusRaw,
                newStatus: newStatusRaw
            )
        }
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

        // Create in-app notification when waiting for input
        NotificationManager.shared.notifySessionWaiting(
            sessionId: sessionId,
            waiting: waiting,
            reason: reason
        )
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

        let id = payload["id"] as? String ?? UUID().uuidString

        print("[WebSocket] Notification: \(title) - \(body)")

        // Create in-app notification
        NotificationManager.shared.notifyGeneric(id: id, title: title, body: body)
    }

    /// Handle error message
    private func handleError(_ payload: [String: Any]) {
        let code = payload["code"] as? String ?? "UNKNOWN"
        let message = payload["message"] as? String ?? "Unknown error"
        print("[WebSocket] Error [\(code)]: \(message)")

        // Create in-app notification for errors
        NotificationManager.shared.notifyError(code: code, message: message)
    }

    // MARK: - New Message Handlers

    /// Handle session output (terminal lines)
    private func handleSessionOutput(_ payload: [String: Any]) {
        // High-frequency message, just log occasionally for debugging
        guard let sessionId = payload["sessionId"] as? String else { return }
        // Don't create notifications for output - too noisy
        _ = sessionId
    }

    /// Handle review result from subagent
    private func handleReviewResult(_ payload: [String: Any]) {
        guard let sessionId = payload["sessionId"] as? String,
              let ticketId = payload["ticketId"] as? String,
              let decision = payload["decision"] as? String,
              let reasoning = payload["reasoning"] as? String else {
            return
        }

        let trigger = payload["trigger"] as? String ?? "unknown"
        print("[WebSocket] Review result for ticket \(ticketId): \(decision) (trigger: \(trigger))")

        // Create in-app notification
        NotificationManager.shared.notifyReviewResult(
            sessionId: sessionId,
            ticketId: ticketId,
            decision: decision,
            reasoning: reasoning
        )
    }

    /// Handle AI analysis status (summary/report generation)
    private func handleAnalysisStatus(_ payload: [String: Any]) {
        guard let sessionId = payload["sessionId"] as? String,
              let analysisType = payload["analysisType"] as? String,
              let status = payload["status"] as? String else {
            return
        }

        let ticketId = payload["ticketId"] as? String
        let error = payload["error"] as? String

        print("[WebSocket] Analysis \(analysisType) for session \(sessionId): \(status)")

        // Create in-app notification
        NotificationManager.shared.notifyAnalysisStatus(
            sessionId: sessionId,
            ticketId: ticketId,
            analysisType: analysisType,
            status: status,
            error: error
        )
    }

    /// Handle ticket state change
    private func handleTicketState(_ payload: [String: Any]) {
        guard let ticketId = payload["ticketId"] as? String,
              let previousState = payload["previousState"] as? String,
              let newState = payload["newState"] as? String else {
            return
        }

        let reason = payload["reason"] as? String
        let trigger = payload["trigger"] as? String

        print("[WebSocket] Ticket \(ticketId) state: \(previousState) -> \(newState) (\(trigger ?? "?"))")

        // Create in-app notification
        NotificationManager.shared.notifyTicketState(
            ticketId: ticketId,
            previousState: previousState,
            newState: newState,
            reason: reason
        )
    }

    /// Handle subscription confirmation
    private func handleSubscribed(_ payload: [String: Any]) {
        guard let sessionId = payload["sessionId"] as? String else { return }
        print("[WebSocket] Subscribed to session \(sessionId)")
    }

    /// Handle unsubscription confirmation
    private func handleUnsubscribed(_ payload: [String: Any]) {
        guard let sessionId = payload["sessionId"] as? String else { return }
        print("[WebSocket] Unsubscribed from session \(sessionId)")
    }

    /// Handle PTY attached confirmation
    private func handlePtyAttached(_ payload: [String: Any]) {
        guard let sessionId = payload["sessionId"] as? String else { return }
        let cols = payload["cols"] as? Int ?? 0
        let rows = payload["rows"] as? Int ?? 0
        print("[WebSocket] PTY attached to session \(sessionId) (\(cols)x\(rows))")
    }

    /// Handle PTY detached confirmation
    private func handlePtyDetached(_ payload: [String: Any]) {
        guard let sessionId = payload["sessionId"] as? String else { return }
        print("[WebSocket] PTY detached from session \(sessionId)")
    }

    /// Handle PTY exit
    private func handlePtyExit(_ payload: [String: Any]) {
        guard let sessionId = payload["sessionId"] as? String else { return }
        let exitCode = payload["exitCode"] as? Int ?? -1
        print("[WebSocket] PTY exited for session \(sessionId) with code \(exitCode)")
    }

    // MARK: - Disconnection Handling

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

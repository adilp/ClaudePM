import Foundation
import SwiftUI

/// Connection status states
enum ConnectionStatus: Equatable {
    case disconnected
    case connecting
    case connected
    case error(String)

    var displayText: String {
        switch self {
        case .disconnected:
            return "Disconnected"
        case .connecting:
            return "Connecting..."
        case .connected:
            return "Connected"
        case .error(let message):
            return "Error: \(message)"
        }
    }

    var color: Color {
        switch self {
        case .disconnected:
            return .gray
        case .connecting:
            return .orange
        case .connected:
            return .green
        case .error:
            return .red
        }
    }

    var isConnected: Bool {
        if case .connected = self {
            return true
        }
        return false
    }
}

/// ViewModel for managing connection state and session data
@Observable
class ConnectionViewModel {
    var connectionStatus: ConnectionStatus = .disconnected
    var sessions: [Session] = []
    var sessionCount: Int { sessions.count }
    var activeSessionCount: Int {
        sessions.filter { $0.status == .running }.count
    }

    /// WebSocket state for UI display
    var webSocketState: WebSocketState {
        WebSocketClient.shared.state
    }

    /// Whether WebSocket is reconnecting (for showing banner)
    var isWebSocketReconnecting: Bool {
        WebSocketClient.shared.isReconnecting
    }

    /// Text to display for WebSocket state
    var webSocketStateText: String {
        WebSocketClient.shared.state.displayText
    }

    private var refreshTask: Task<Void, Never>?
    private var webSocketObserverTask: Task<Void, Never>?

    /// Check connection to the backend
    func checkConnection() async {
        connectionStatus = .connecting

        do {
            _ = try await APIClient.shared.checkHealth()
            connectionStatus = .connected
            await refreshSessions()
        } catch let error as APIError {
            connectionStatus = .error(error.localizedDescription ?? "Unknown error")
        } catch {
            connectionStatus = .error(error.localizedDescription)
        }
    }

    /// Refresh session list from backend
    func refreshSessions() async {
        guard connectionStatus.isConnected else { return }

        do {
            sessions = try await APIClient.shared.getSessions()
        } catch {
            // Don't update connection status for session fetch errors
            // Just keep existing session data
            print("Failed to fetch sessions: \(error)")
        }
    }

    /// Start periodic refresh of connection and sessions
    func startAutoRefresh() {
        stopAutoRefresh()

        refreshTask = Task {
            while !Task.isCancelled {
                await checkConnection()
                try? await Task.sleep(for: .seconds(30))
            }
        }
    }

    /// Stop periodic refresh
    func stopAutoRefresh() {
        refreshTask?.cancel()
        refreshTask = nil
    }

    /// Start observing WebSocket updates
    func startWebSocketObserving() {
        // Register callback for session updates
        WebSocketClient.shared.onSessionUpdate = { [weak self] update in
            Task { @MainActor in
                self?.handleSessionUpdate(update)
            }
        }
    }

    /// Stop observing WebSocket updates
    func stopWebSocketObserving() {
        WebSocketClient.shared.onSessionUpdate = nil
    }

    /// Handle a session update from WebSocket
    @MainActor
    private func handleSessionUpdate(_ update: SessionUpdate) {
        // Find the session in our list
        guard let index = sessions.firstIndex(where: { $0.id == update.sessionId }) else {
            // Session not in our list - might need to refresh
            print("[ViewModel] Received update for unknown session \(update.sessionId)")
            Task {
                await refreshSessions()
            }
            return
        }

        switch update.type {
        case .status:
            // Update session status
            if let newStatus = update.status {
                print("[ViewModel] Updating session \(update.sessionId) status to \(newStatus)")
                // Since Session is a struct, we need to create a new one with updated status
                let oldSession = sessions[index]
                sessions[index] = Session(
                    id: oldSession.id,
                    projectId: oldSession.projectId,
                    ticketId: oldSession.ticketId,
                    type: oldSession.type,
                    status: newStatus,
                    contextPercent: oldSession.contextPercent,
                    paneId: oldSession.paneId,
                    startedAt: oldSession.startedAt,
                    endedAt: oldSession.endedAt,
                    createdAt: oldSession.createdAt,
                    updatedAt: Date(),
                    project: oldSession.project,
                    ticket: oldSession.ticket
                )
            }

        case .waiting:
            // Waiting state is informational - could show UI indicator
            print("[ViewModel] Session \(update.sessionId) waiting: \(update.waiting ?? false)")

        case .context:
            // Update context percentage
            if let contextPercent = update.contextPercent {
                print("[ViewModel] Updating session \(update.sessionId) context to \(contextPercent)%")
                let oldSession = sessions[index]
                sessions[index] = Session(
                    id: oldSession.id,
                    projectId: oldSession.projectId,
                    ticketId: oldSession.ticketId,
                    type: oldSession.type,
                    status: oldSession.status,
                    contextPercent: contextPercent,
                    paneId: oldSession.paneId,
                    startedAt: oldSession.startedAt,
                    endedAt: oldSession.endedAt,
                    createdAt: oldSession.createdAt,
                    updatedAt: Date(),
                    project: oldSession.project,
                    ticket: oldSession.ticket
                )
            }
        }
    }

    /// Reset connection state (used when settings change)
    func resetConnection() {
        connectionStatus = .disconnected
        sessions = []
        // Also reconnect WebSocket with new settings
        WebSocketClient.shared.disconnect()
        WebSocketClient.shared.connect()
    }
}

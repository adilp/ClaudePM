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

    private var refreshTask: Task<Void, Never>?

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

    /// Reset connection state (used when settings change)
    func resetConnection() {
        connectionStatus = .disconnected
        sessions = []
    }
}

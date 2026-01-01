import Foundation

/// ViewModel for the session list view
@MainActor
@Observable
class SessionListViewModel {
    // MARK: - Published State

    /// All sessions from the backend
    var sessions: [Session] = []

    /// Whether currently loading sessions
    var isLoading = false

    /// Error message if load failed
    var error: String?

    /// Whether to show completed sessions
    var showCompletedSessions = false

    // MARK: - Computed Properties

    /// Active sessions (excludes completed unless showCompletedSessions is true)
    var visibleSessions: [Session] {
        if showCompletedSessions {
            return sessions
        }
        return sessions.filter { $0.status != .completed }
    }

    /// Count of running sessions
    var runningCount: Int {
        sessions.filter { $0.status == .running }.count
    }

    /// Count of completed sessions (for badge)
    var completedCount: Int {
        sessions.filter { $0.status == .completed }.count
    }

    // MARK: - Session Loading

    /// Load sessions from the backend API
    func loadSessions() async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            sessions = try await APIClient.shared.getSessions()
        } catch let apiError as APIError {
            self.error = apiError.localizedDescription
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Add a newly created session to the list
    func addSession(_ session: Session) {
        // Insert at the beginning since it's the newest
        sessions.insert(session, at: 0)
    }

    // MARK: - WebSocket Updates

    /// Handle a session update from WebSocket
    func handleSessionUpdate(_ update: SessionUpdate) {
        // Find the session in our list
        guard let index = sessions.firstIndex(where: { $0.id == update.sessionId }) else {
            // Session not in our list - might need to refresh
            print("[SessionListVM] Received update for unknown session \(update.sessionId)")
            Task {
                await loadSessions()
            }
            return
        }

        switch update.type {
        case .status:
            // Update session status
            if let newStatus = update.status {
                print("[SessionListVM] Updating session \(update.sessionId) status to \(newStatus)")
                updateSession(at: index, status: newStatus)
            }

        case .waiting:
            // Waiting state is informational - could show UI indicator in future
            print("[SessionListVM] Session \(update.sessionId) waiting: \(update.waiting ?? false)")

        case .context:
            // Update context percentage
            if let contextPercent = update.contextPercent {
                print("[SessionListVM] Updating session \(update.sessionId) context to \(contextPercent)%")
                updateSession(at: index, contextPercent: contextPercent)
            }
        }
    }

    // MARK: - Private Helpers

    /// Update a session at the given index with new values
    /// Since Session is a struct, we create a new instance with updated values
    private func updateSession(
        at index: Int,
        status: SessionStatus? = nil,
        contextPercent: Int? = nil
    ) {
        let oldSession = sessions[index]
        sessions[index] = Session(
            id: oldSession.id,
            projectId: oldSession.projectId,
            ticketId: oldSession.ticketId,
            type: oldSession.type,
            status: status ?? oldSession.status,
            contextPercent: contextPercent ?? oldSession.contextPercent,
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

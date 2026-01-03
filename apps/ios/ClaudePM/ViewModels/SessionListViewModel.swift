import Foundation

/// Filter options for session source
enum SessionSourceFilter: String, CaseIterable {
    case all = "All"
    case api = "API"
    case discovered = "Discovered"
}

/// Filter options for session command
enum SessionCommandFilter: String, CaseIterable {
    case all = "All"
    case node = "node"
    case nvim = "nvim"
    case other = "Other"
}

/// Group of sessions under a project
struct ProjectSessionGroup: Identifiable {
    let id: String  // projectId or "unassigned"
    let projectName: String
    let sessions: [Session]
    let mostRecentActivity: Date
}

/// ViewModel for the session list view
@MainActor
@Observable
class SessionListViewModel {
    // MARK: - Published State

    /// All sessions from the backend
    var sessions: [Session] = []

    /// Whether currently loading sessions
    var isLoading = false

    /// Whether currently discovering panes
    var isDiscovering = false

    /// Error message if load failed
    var error: String?

    /// Whether to show completed sessions
    var showCompletedSessions = false

    /// Filter by source (api/discovered)
    var sourceFilter: SessionSourceFilter = .all

    /// Filter by command (node/nvim/other)
    var commandFilter: SessionCommandFilter = .all

    /// Session being renamed (nil if no rename in progress)
    var renamingSession: Session?

    /// Set of collapsed project IDs (persisted to UserDefaults)
    var collapsedProjects: Set<String> {
        didSet {
            saveCollapsedProjects()
        }
    }

    // MARK: - Constants

    private static let collapsedProjectsKey = "sessionList.collapsedProjects"

    // MARK: - Initialization

    init() {
        // Load collapsed state from UserDefaults
        if let stored = UserDefaults.standard.array(forKey: Self.collapsedProjectsKey) as? [String] {
            self.collapsedProjects = Set(stored)
        } else {
            self.collapsedProjects = []
        }
    }

    // MARK: - Computed Properties

    /// Active sessions (running/paused only)
    var activeSessions: [Session] {
        sessions.filter { $0.status == .running || $0.status == .paused }
    }

    /// Filtered and sorted sessions for display
    var visibleSessions: [Session] {
        var result = showCompletedSessions ? sessions : activeSessions

        // Apply source filter
        switch sourceFilter {
        case .all: break
        case .api: result = result.filter { $0.source == .api }
        case .discovered: result = result.filter { $0.source == .discovered }
        }

        // Apply command filter (only when not filtering to API only)
        if sourceFilter != .api {
            switch commandFilter {
            case .all: break
            case .node: result = result.filter { $0.paneCommand == "node" }
            case .nvim: result = result.filter { $0.paneCommand == "nvim" || $0.paneCommand == "vim" }
            case .other: result = result.filter { cmd in
                guard let command = cmd.paneCommand else { return false }
                return !["node", "nvim", "vim"].contains(command)
            }
            }
        }

        return result
    }

    /// Sessions grouped by project, sorted by most recent activity
    var groupedSessions: [ProjectSessionGroup] {
        var groups: [String: (projectName: String, sessions: [Session], mostRecent: Date)] = [:]

        for session in visibleSessions {
            let projectName = session.project.name
            let projectId = session.project.id

            if groups[projectId] == nil {
                groups[projectId] = (projectName: projectName, sessions: [], mostRecent: Date.distantPast)
            }

            groups[projectId]!.sessions.append(session)

            // Track most recent activity for sorting
            if session.updatedAt > groups[projectId]!.mostRecent {
                groups[projectId]!.mostRecent = session.updatedAt
            }
        }

        // Convert to array and sort by most recent activity (descending)
        return groups.map { (id, data) in
            ProjectSessionGroup(
                id: id,
                projectName: data.projectName,
                sessions: data.sessions,
                mostRecentActivity: data.mostRecent
            )
        }.sorted { $0.mostRecentActivity > $1.mostRecentActivity }
    }

    /// Filter counts for badges
    var filterCounts: (api: Int, discovered: Int, node: Int, nvim: Int, other: Int) {
        let active = activeSessions
        return (
            api: active.filter { $0.source == .api }.count,
            discovered: active.filter { $0.source == .discovered }.count,
            node: active.filter { $0.paneCommand == "node" }.count,
            nvim: active.filter { $0.paneCommand == "nvim" || $0.paneCommand == "vim" }.count,
            other: active.filter { cmd in
                guard let command = cmd.paneCommand else { return false }
                return !["node", "nvim", "vim"].contains(command)
            }.count
        )
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

    /// Discover manually created panes
    func discoverSessions() async {
        isDiscovering = true
        error = nil
        defer { isDiscovering = false }

        do {
            let result = try await APIClient.shared.discoverSessions()
            if result.discoveredSessions.count > 0 {
                // Reload sessions to get the newly discovered ones
                await loadSessions()
            }
        } catch let apiError as APIError {
            self.error = apiError.localizedDescription
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Rename a session
    func renameSession(_ session: Session, newName: String) async {
        error = nil

        do {
            try await APIClient.shared.renameSession(sessionId: session.id, name: newName)
            // Reload to get updated session
            await loadSessions()
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

    // MARK: - Project Collapse

    /// Toggle the collapse state of a project group
    func toggleProjectCollapse(_ projectId: String) {
        if collapsedProjects.contains(projectId) {
            collapsedProjects.remove(projectId)
        } else {
            collapsedProjects.insert(projectId)
        }
    }

    /// Check if a project is collapsed
    func isProjectCollapsed(_ projectId: String) -> Bool {
        return collapsedProjects.contains(projectId)
    }

    // MARK: - Private Helpers

    /// Save collapsed projects to UserDefaults
    private func saveCollapsedProjects() {
        UserDefaults.standard.set(Array(collapsedProjects), forKey: Self.collapsedProjectsKey)
    }

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
            source: oldSession.source,
            contextPercent: contextPercent ?? oldSession.contextPercent,
            paneId: oldSession.paneId,
            paneName: oldSession.paneName,
            paneCommand: oldSession.paneCommand,
            paneCwd: oldSession.paneCwd,
            startedAt: oldSession.startedAt,
            endedAt: oldSession.endedAt,
            createdAt: oldSession.createdAt,
            updatedAt: Date(),
            project: oldSession.project,
            ticket: oldSession.ticket
        )
    }
}

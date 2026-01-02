import Foundation

/// Represents a Claude session from the backend API
struct Session: Codable, Identifiable, Hashable {
    let id: String
    let projectId: String
    let ticketId: String?
    let type: SessionType
    let status: SessionStatus
    let source: SessionSource
    let contextPercent: Int
    let paneId: String
    let paneName: String?
    let paneCommand: String?
    let paneCwd: String?
    let startedAt: Date?
    let endedAt: Date?
    let createdAt: Date
    let updatedAt: Date

    // Nested objects from API
    let project: SessionProject
    let ticket: SessionTicket?

    /// Display name: paneName > ticket title > project name
    var displayName: String {
        paneName ?? ticket?.title ?? project.name
    }

    /// Whether this session was discovered (manually created pane)
    var isDiscovered: Bool {
        source == .discovered
    }

    // Hashable conformance - use id for identity
    static func == (lhs: Session, rhs: Session) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

/// Nested project info in session response
struct SessionProject: Codable, Identifiable {
    let id: String
    let name: String
}

/// Nested ticket info in session response
struct SessionTicket: Codable, Identifiable {
    let id: String
    let externalId: String?
    let title: String
}

enum SessionType: String, Codable {
    case ticket
    case adhoc
}

enum SessionStatus: String, Codable {
    case running
    case paused
    case completed
    case error

    var displayName: String {
        switch self {
        case .running: return "Running"
        case .paused: return "Paused"
        case .completed: return "Completed"
        case .error: return "Error"
        }
    }

    var isActive: Bool {
        self == .running
    }
}

enum SessionSource: String, Codable {
    case api        // Created via ClaudePM API
    case discovered // Discovered from manually created tmux pane

    var displayName: String {
        switch self {
        case .api: return "API"
        case .discovered: return "Discovered"
        }
    }
}

/// Response from the health check endpoint
struct HealthResponse: Codable {
    let status: String
    let timestamp: String?
    let version: String?
}

/// Response from discover sessions endpoint
struct DiscoverSessionsResponse: Codable {
    let message: String
    let discoveredSessions: [DiscoveredSession]
    let existingPanes: [ExistingPane]
    let totalPanesScanned: Int
    let projectsChecked: Int
}

struct DiscoveredSession: Codable {
    let sessionId: String
    let projectId: String
    let projectName: String
    let paneId: String
    let paneTitle: String?
    let command: String?
    let cwd: String?
}

struct ExistingPane: Codable {
    let paneId: String
    let sessionId: String
    let command: String?
    let cwd: String?
}

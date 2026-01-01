import Foundation

/// Ticket status in the kanban board
enum TicketStatus: String, Codable, CaseIterable {
    case backlog
    case inProgress = "in_progress"
    case review
    case done

    var displayName: String {
        switch self {
        case .backlog: return "Backlog"
        case .inProgress: return "In Progress"
        case .review: return "Review"
        case .done: return "Done"
        }
    }

    /// Column color for the kanban board
    var color: String {
        switch self {
        case .backlog: return "gray"
        case .inProgress: return "blue"
        case .review: return "orange"
        case .done: return "green"
        }
    }
}

/// Represents a ticket from the backend API
struct Ticket: Identifiable, Codable, Hashable {
    let id: String
    let externalId: String?
    let title: String
    let state: TicketStatus
    let filePath: String
    let prefix: String // Computed by server: "CSM", "DWP", "ADHOC", etc.
    let isAdhoc: Bool
    let isExplore: Bool
    let startedAt: Date?
    let completedAt: Date?
    let createdAt: Date
    let updatedAt: Date

    // Hashable conformance - use id for identity
    static func == (lhs: Ticket, rhs: Ticket) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

/// Detailed ticket info with content
struct TicketDetail: Identifiable, Codable {
    let id: String
    let externalId: String?
    let title: String
    let state: TicketStatus
    let filePath: String
    let prefix: String // Computed by server: "CSM", "DWP", "ADHOC", etc.
    let content: String
    let isAdhoc: Bool
    let isExplore: Bool
    let startedAt: Date?
    let completedAt: Date?
    let createdAt: Date
    let updatedAt: Date
}

/// Response wrapper for paginated ticket list
struct TicketListResponse: Codable {
    let data: [Ticket]
    let pagination: PaginationInfo
}

/// Pagination metadata
struct PaginationInfo: Codable {
    let page: Int
    let limit: Int
    let total: Int
    let totalPages: Int
}

/// Response from starting a ticket session
struct StartTicketResponse: Codable {
    let ticket: Ticket
    let session: StartedSession

    struct StartedSession: Codable {
        let id: String
        let projectId: String
        let ticketId: String
        let type: String
        let status: String
        let paneId: String
        let startedAt: String
        let createdAt: String
    }
}

/// Response for ticket prefixes
struct PrefixesResponse: Codable {
    let data: [String]
}

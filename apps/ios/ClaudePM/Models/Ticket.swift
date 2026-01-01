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

    /// Extract prefix from external_id (e.g., "CSM" from "CSM-001")
    /// Matches server's extractPrefix format (without trailing dash)
    /// Returns "ADHOC" for ad-hoc tickets (no externalId or no match)
    var prefix: String {
        guard let externalId = externalId else { return "ADHOC" }
        // Match pattern like "CSM" at the start (before the dash)
        let pattern = "^([A-Z]+)-"
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: externalId, range: NSRange(externalId.startIndex..., in: externalId)),
              let range = Range(match.range(at: 1), in: externalId) else {
            return "ADHOC"
        }
        return String(externalId[range])
    }
}

/// Detailed ticket info with content
struct TicketDetail: Identifiable, Codable {
    let id: String
    let externalId: String?
    let title: String
    let state: TicketStatus
    let filePath: String
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

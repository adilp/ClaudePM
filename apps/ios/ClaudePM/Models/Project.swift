import Foundation

/// Represents a project from the backend API
struct Project: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let repoPath: String
    let ticketsPath: String?
    let handoffPath: String?
    let tmuxSession: String
    let tmuxWindow: String?
    let createdAt: Date
    let updatedAt: Date

    // Hashable conformance - use id for identity
    static func == (lhs: Project, rhs: Project) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
}

/// Response wrapper for paginated project list
struct ProjectListResponse: Codable {
    let data: [Project]
    let pagination: PaginationInfo
}

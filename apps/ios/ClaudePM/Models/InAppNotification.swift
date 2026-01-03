import Foundation

/// Priority levels for in-app notifications
enum NotificationPriority: Comparable {
    case low        // Informational (subscribed, pong, etc.)
    case normal     // Standard updates (status changes, context)
    case high       // Requires attention (waiting, review needed)
    case urgent     // Immediate action needed (errors, clarification needed)
}

/// Categories for grouping notifications
enum NotificationCategory: String {
    case session        // Session-related updates
    case ticket         // Ticket state changes
    case review         // Review results
    case analysis       // AI analysis status
    case system         // Connection, errors, etc.
}

/// An in-app notification to display to the user
struct InAppNotification: Identifiable, Equatable {
    let id: String
    let title: String
    let body: String
    let category: NotificationCategory
    let priority: NotificationPriority
    let timestamp: Date

    /// Related session ID (if applicable)
    let sessionId: String?

    /// Related ticket ID (if applicable)
    let ticketId: String?

    /// Whether the notification has been read/dismissed
    var isRead: Bool = false

    init(
        id: String = UUID().uuidString,
        title: String,
        body: String,
        category: NotificationCategory,
        priority: NotificationPriority = .normal,
        timestamp: Date = Date(),
        sessionId: String? = nil,
        ticketId: String? = nil
    ) {
        self.id = id
        self.title = title
        self.body = body
        self.category = category
        self.priority = priority
        self.timestamp = timestamp
        self.sessionId = sessionId
        self.ticketId = ticketId
    }

    static func == (lhs: InAppNotification, rhs: InAppNotification) -> Bool {
        lhs.id == rhs.id
    }
}

/// Review decision types from the backend
enum ReviewDecision: String {
    case complete = "complete"
    case notComplete = "not_complete"
    case needsClarification = "needs_clarification"

    var displayText: String {
        switch self {
        case .complete:
            return "Complete"
        case .notComplete:
            return "Not Complete"
        case .needsClarification:
            return "Needs Clarification"
        }
    }
}

/// AI analysis types
enum AnalysisType: String {
    case summary = "summary"
    case reviewReport = "review_report"

    var displayText: String {
        switch self {
        case .summary:
            return "Summary"
        case .reviewReport:
            return "Review Report"
        }
    }
}

/// AI analysis status
enum AnalysisStatus: String {
    case generating = "generating"
    case completed = "completed"
    case failed = "failed"
}

// MARK: - Server Notification Models

/// Notification type from server
enum ServerNotificationType: String, Codable {
    case waitingInput = "waiting_input"
    case reviewReady = "review_ready"
    case error = "error"
    case contextLow = "context_low"
    case handoffComplete = "handoff_complete"
}

/// Session info nested in server notification
struct ServerNotificationSession: Codable {
    let id: String
    let type: String
    let status: String
}

/// Ticket info nested in server notification
struct ServerNotificationTicket: Codable {
    let id: String
    let externalId: String
    let title: String
}

/// Server notification response model (matches GET /api/notifications)
struct ServerNotification: Codable, Identifiable {
    let id: String
    let type: ServerNotificationType
    let message: String
    let createdAt: Date
    let session: ServerNotificationSession?
    let ticket: ServerNotificationTicket?

    /// Convert to InAppNotification for display
    func toInAppNotification() -> InAppNotification {
        // Determine title and priority based on type
        let title: String
        let priority: NotificationPriority
        let category: NotificationCategory

        switch type {
        case .waitingInput:
            title = "Input Required"
            priority = .high
            category = .session
        case .reviewReady:
            title = "Ready for Review"
            priority = .normal
            category = .review
        case .error:
            title = "Error"
            priority = .urgent
            category = .system
        case .contextLow:
            title = "Context Low"
            priority = .high
            category = .session
        case .handoffComplete:
            title = "Handoff Complete"
            priority = .normal
            category = .session
        }

        return InAppNotification(
            id: id,
            title: title,
            body: message,
            category: category,
            priority: priority,
            timestamp: createdAt,
            sessionId: session?.id,
            ticketId: ticket?.id
        )
    }
}

/// Response wrapper for GET /api/notifications
struct NotificationsResponse: Codable {
    let data: [ServerNotification]
    let count: Int
}

/// Response for DELETE /api/notifications
struct DismissAllNotificationsResponse: Codable {
    let dismissed: Int
}

import Foundation

/// Represents a Claude PM session notification
enum SessionNotification {
    case completed(sessionId: String, ticketTitle: String?)
    case inputRequired(sessionId: String, ticketTitle: String?, reason: String?)
    case error(sessionId: String, ticketTitle: String?, message: String?)

    /// Display title for the notification
    var title: String {
        switch self {
        case .completed:
            return "Session Complete"
        case .inputRequired:
            return "Input Required"
        case .error:
            return "Session Error"
        }
    }

    /// Subtitle showing ticket title or session ID
    var subtitle: String {
        switch self {
        case .completed(let sessionId, let ticketTitle),
             .inputRequired(let sessionId, let ticketTitle, _),
             .error(let sessionId, let ticketTitle, _):
            return ticketTitle ?? "Session \(sessionId.prefix(8))..."
        }
    }

    /// Additional detail (reason or error message)
    var detail: String? {
        switch self {
        case .completed:
            return nil
        case .inputRequired(_, _, let reason):
            return reason.map { formatReason($0) }
        case .error(_, _, let message):
            return message
        }
    }

    /// SF Symbol icon name
    var icon: String {
        switch self {
        case .completed:
            return "checkmark.circle.fill"
        case .inputRequired:
            return "hourglass"
        case .error:
            return "xmark.circle.fill"
        }
    }

    /// Icon background color
    var iconColor: String {
        switch self {
        case .completed:
            return "green"
        case .inputRequired:
            return "orange"
        case .error:
            return "red"
        }
    }

    /// Auto-dismiss duration - all session notifications auto-dismiss
    /// (only meeting notifications persist until dismissed)
    var autoDismissAfter: TimeInterval {
        switch self {
        case .completed:
            return 5.0
        case .inputRequired, .error:
            return 8.0  // Slightly longer for actionable notifications
        }
    }

    /// Session ID for this notification
    var sessionId: String {
        switch self {
        case .completed(let sessionId, _),
             .inputRequired(let sessionId, _, _),
             .error(let sessionId, _, _):
            return sessionId
        }
    }

    /// Format waiting reason into human-readable text
    private func formatReason(_ reason: String) -> String {
        switch reason {
        case "permission_prompt":
            return "Waiting for tool approval"
        case "idle_prompt":
            return "Session idle"
        case "question":
            return "Claude asked a question"
        case "context_exhausted":
            return "Context limit reached"
        case "stopped":
            return "Claude stopped"
        default:
            return "Waiting for input"
        }
    }
}

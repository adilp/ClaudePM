import Foundation

/// Types of session updates received via WebSocket
enum SessionUpdateType {
    case status      // Session status changed (running, paused, completed, error)
    case waiting     // Claude waiting for input
    case context     // Context usage percentage updated
}

/// A real-time update for a session received via WebSocket
struct SessionUpdate {
    /// Type of update
    let type: SessionUpdateType

    /// Session ID this update applies to
    let sessionId: String

    /// New session status (for .status updates)
    let status: SessionStatus?

    /// Whether Claude is waiting for input (for .waiting updates)
    let waiting: Bool?

    /// Reason for waiting (for .waiting updates)
    /// Possible values: permission_prompt, idle_prompt, question, context_exhausted, stopped, unknown
    let waitingReason: String?

    /// Context usage percentage (for .context updates)
    let contextPercent: Int?
}

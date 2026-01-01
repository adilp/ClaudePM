import Foundation

// MARK: - Session Summary

/// AI-generated summary of a session's work
/// Note: Server sends snake_case at top level but camelCase in nested objects
struct SessionSummary: Codable {
    let sessionId: String
    let ticketId: String?
    let headline: String
    let description: String
    let actions: [SessionAction]
    let filesChanged: [FileChange]
    let status: SummaryStatus
    let analyzedAt: String  // Server sends as ISO string

    // Explicit coding keys for snake_case top-level fields
    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case ticketId = "ticket_id"
        case headline
        case description
        case actions
        case filesChanged = "files_changed"
        case status
        case analyzedAt = "analyzed_at"
    }

    enum SummaryStatus: String, Codable {
        case completed
        case inProgress = "in_progress"
        case blocked
        case failed

        var displayName: String {
            switch self {
            case .completed: return "Completed"
            case .inProgress: return "In Progress"
            case .blocked: return "Blocked"
            case .failed: return "Failed"
            }
        }
    }
}

/// An action taken during a session
/// Note: Nested in SessionSummary - server sends camelCase keys
struct SessionAction: Codable, Identifiable {
    var id: String { "\(type.rawValue)-\(description.hashValue)" }
    let type: ActionType
    let description: String
    let target: String?
    // Note: timestamp is NOT in the API response per web types

    enum ActionType: String, Codable {
        case read
        case write
        case edit
        case bash
        case test
        case create
        case other

        var iconName: String {
            switch self {
            case .read: return "doc.text"
            case .write, .create: return "doc.badge.plus"
            case .edit: return "pencil"
            case .bash: return "terminal"
            case .test: return "checkmark.circle"
            case .other: return "ellipsis.circle"
            }
        }

        // Handle unknown action types gracefully by mapping to .other
        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            let rawValue = try container.decode(String.self)
            self = ActionType(rawValue: rawValue) ?? .other
        }
    }
}

/// A file changed during a session
/// Note: Nested in SessionSummary - server sends camelCase keys (changeType not change_type)
struct FileChange: Codable, Identifiable {
    var id: String { path }
    let path: String
    let changeType: ChangeType  // Server sends as camelCase
    let summary: String?

    enum ChangeType: String, Codable {
        case created
        case modified
        case deleted
        // Also support "added" and "renamed" for git diff compatibility
        case added
        case renamed

        var displayName: String {
            switch self {
            case .created, .added: return "Added"
            case .modified: return "Modified"
            case .deleted: return "Deleted"
            case .renamed: return "Renamed"
            }
        }

        var color: String {
            switch self {
            case .created, .added: return "green"
            case .modified: return "blue"
            case .deleted: return "red"
            case .renamed: return "yellow"
            }
        }
    }
}

// MARK: - Review Report

/// AI-generated review report for a ticket session
struct ReviewReport: Codable {
    let sessionId: String
    let ticketId: String
    let ticketTitle: String
    let completionStatus: CompletionStatus
    let confidence: Int
    let accomplished: [String]
    let remaining: [String]
    let concerns: [String]
    let nextSteps: [String]
    let suggestedCommitMessage: String?
    let suggestedPrDescription: String?
    let generatedAt: Date?

    enum CompletionStatus: String, Codable {
        case complete
        case partial
        case blocked
        case unclear

        var displayName: String {
            switch self {
            case .complete: return "Complete"
            case .partial: return "Partial"
            case .blocked: return "Blocked"
            case .unclear: return "Unclear"
            }
        }

        var color: String {
            switch self {
            case .complete: return "green"
            case .partial: return "yellow"
            case .blocked: return "red"
            case .unclear: return "gray"
            }
        }
    }
}

// MARK: - Review History

/// A review result entry from the review history
struct ReviewResultEntry: Codable, Identifiable {
    let id: String
    let sessionId: String
    let trigger: ReviewTrigger
    let decision: ReviewDecision
    let reasoning: String
    let createdAt: Date

    enum ReviewTrigger: String, Codable {
        case stopHook = "stop_hook"
        case idleTimeout = "idle_timeout"
        case completionSignal = "completion_signal"
        case manual

        var displayName: String {
            switch self {
            case .stopHook: return "Stop Hook"
            case .idleTimeout: return "Idle Timeout"
            case .completionSignal: return "Completion Signal"
            case .manual: return "Manual"
            }
        }

        var iconName: String {
            switch self {
            case .stopHook: return "stop.circle"
            case .idleTimeout: return "clock"
            case .completionSignal: return "checkmark.seal"
            case .manual: return "hand.tap"
            }
        }
    }

    enum ReviewDecision: String, Codable {
        case complete
        case notComplete = "not_complete"
        case needsClarification = "needs_clarification"

        var displayName: String {
            switch self {
            case .complete: return "Complete"
            case .notComplete: return "Not Complete"
            case .needsClarification: return "Needs Clarification"
            }
        }

        var color: String {
            switch self {
            case .complete: return "green"
            case .notComplete: return "orange"
            case .needsClarification: return "blue"
            }
        }
    }
}

/// Response wrapper for review history
struct ReviewHistoryResponse: Codable {
    let ticketId: String
    let results: [ReviewResultEntry]
}

// MARK: - Git Diff

/// Git diff result for a project
struct GitDiffResult: Codable {
    let files: [DiffFile]
    let truncated: Bool
    let totalLines: Int
}

/// A file in the git diff
struct DiffFile: Codable, Identifiable {
    var id: String { filePath }
    let filePath: String
    let oldFilePath: String?
    let changeType: FileChange.ChangeType
    let hunks: [DiffHunk]
}

/// A hunk in a diff file
struct DiffHunk: Codable, Identifiable {
    var id: String { "\(oldStart)-\(newStart)" }
    let oldStart: Int
    let oldCount: Int
    let newStart: Int
    let newCount: Int
    let content: String
}

// MARK: - Git Status

/// Git status for a project (staged, unstaged, untracked files)
struct GitStatus: Codable {
    let branch: String?
    let upstream: String?
    let detached: Bool
    var staged: [StatusFile]      // var for optimistic updates
    var unstaged: [StatusFile]    // var for optimistic updates
    var untracked: [String]       // var for optimistic updates
    let clean: Bool
    let ahead: Int
    let behind: Int
}

/// A file with its status
struct StatusFile: Codable, Identifiable {
    var id: String { path }
    let path: String
    let status: String
}

// MARK: - Branch Info

/// Branch info for a project
struct BranchInfo: Codable {
    let name: String
    let remote: String?
    let isMainBranch: Bool
    let recentCommits: [CommitInfo]
}

/// A commit in the branch history
struct CommitInfo: Codable, Identifiable {
    var id: String { hash }
    let hash: String
    let message: String
    let date: Date
}

// MARK: - Commit/Push Results

/// Result of a commit operation
struct CommitResult: Codable {
    let success: Bool
    let hash: String
    let message: String
}

/// Result of a push operation
struct PushResult: Codable {
    let success: Bool
    let branch: String
}


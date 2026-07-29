import Foundation

/// A live workmux worktree "agent" surfaced by the server bridge.
///
/// Source: `GET /api/agents` and the `agent:snapshot` / `agent:update` /
/// `agent:removed` WebSocket events (see `WebSocketClient`). NB: unlike the
/// snake_case sessions API, the agents payload is **camelCase**, so it decodes
/// with a plain `JSONDecoder` — do NOT apply `.convertFromSnakeCase`.
struct Agent: Codable, Identifiable, Equatable {
    /// Stable, globally-unique id: `${backend}:${instance}:${pane_id}`.
    let id: String
    /// `wm merge` target — basename of the workdir, e.g. "feebug".
    let worktree: String
    /// Parent repo, used for grouping, e.g. "CanvassingApp".
    let project: String
    /// workmux status, passed through: "working" | "waiting" | "done" | ...
    let status: String
    /// pane title with the animated spinner glyph stripped.
    let title: String
    /// Absolute worktree path.
    let workdir: String
    /// Epoch seconds when status last changed. 0 if unknown.
    let statusTs: Double
    /// Epoch seconds of the last state write. 0 if unknown.
    let updatedTs: Double
}

/// Response wrapper for `GET /api/agents`.
struct AgentsResponse: Codable {
    let agents: [Agent]
}

/// The known workmux statuses, for display and ordering. Any value the server
/// passes through that we don't recognise falls back to `.other(raw)` rather
/// than being silently coerced.
enum AgentStatusKind: Equatable {
    case working
    case waiting
    case done
    case other(String)

    init(_ raw: String) {
        switch raw.lowercased() {
        case "working": self = .working
        case "waiting": self = .waiting
        case "done":    self = .done
        default:        self = .other(raw)
        }
    }

    /// List ordering: waiting first (needs attention), then working, then done.
    var sortPriority: Int {
        switch self {
        case .waiting: return 0
        case .working: return 1
        case .done:    return 2
        case .other:   return 3
        }
    }

    var label: String {
        switch self {
        case .working:        return "Working"
        case .waiting:        return "Waiting"
        case .done:           return "Done"
        case .other(let raw): return raw.capitalized
        }
    }
}

extension Agent {
    /// Parsed, display-friendly view of `status`.
    var statusKind: AgentStatusKind { AgentStatusKind(status) }
}

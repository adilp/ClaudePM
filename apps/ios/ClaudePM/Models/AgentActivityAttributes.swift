import ActivityKit
import Foundation

/// Shared contract between the app (which starts/updates the Live Activity) and
/// the widget extension (which renders it). Compiled into **both** targets — the
/// app target and `ClaudePMWidgetsExtension` — so keep it dependency-free
/// (ActivityKit + Foundation only, no app-only types like `Agent`).
///
/// Content model = variant C ("hybrid list", decided in issue #5): a headline of
/// counts plus the top-N agents sorted waiting→working→done, and a "+N done"
/// overflow. See `apps/ios/prototypes/live-activity-prototype.html`.
struct AgentActivityAttributes: ActivityAttributes {
    /// The live, push-updatable part of the activity.
    public struct ContentState: Codable, Hashable {
        /// Headline counts across the whole fleet.
        var working: Int
        var waiting: Int
        var done: Int
        var total: Int

        /// Top-N agents to show as rows (already sorted + capped by the app).
        var rows: [Row]

        /// Count of `done` agents NOT represented in `rows` — the "+N done" footer.
        var doneOverflow: Int

        /// working + waiting — the "N active" in the headline.
        var active: Int { working + waiting }

        /// One agent row in the list.
        public struct Row: Codable, Hashable, Identifiable {
            /// Stable agent id (see `Agent.id`).
            public var id: String
            /// Raw workmux status: "working" | "waiting" | "done" | other.
            var status: String
            /// Task title (spinner glyph already stripped by the server).
            var title: String
            /// `wm merge` target handle, e.g. "feebug".
            var worktree: String
            /// When the status last changed — rendered as live elapsed time.
            var since: Date
        }
    }

    /// Static label shown in the activity chrome. Doesn't change over the
    /// activity's life, so it lives on the attributes, not the content state.
    var appName: String = "workmux"
}

/// Display buckets for a raw workmux status string, with the variant-C colours.
/// Lives here (not in the app-only `Agent`) so the widget extension can map a
/// `ContentState.Row.status` to a colour without importing app code.
enum AgentActivityStatus {
    case working
    case waiting
    case done
    case other

    init(_ raw: String) {
        switch raw.lowercased() {
        case "working": self = .working
        case "waiting": self = .waiting
        case "done":    self = .done
        default:        self = .other
        }
    }

    /// Ordering: waiting first (needs attention), then working, then done.
    var sortPriority: Int {
        switch self {
        case .waiting: return 0
        case .working: return 1
        case .done:    return 2
        case .other:   return 3
        }
    }
}

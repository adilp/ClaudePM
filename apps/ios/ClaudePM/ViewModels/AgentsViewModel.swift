import Foundation

/// Group of agents under one project, for a sectioned list.
struct AgentProjectGroup: Identifiable {
    let id: String        // project name (unique within the list)
    let project: String
    let agents: [Agent]
}

/// ViewModel for the Agents tab — live workmux agent state.
///
/// Initial population comes from `GET /api/agents` (see `loadAgents()`); live
/// deltas arrive over the WebSocket and are applied via `applySnapshot`,
/// `upsert`, and `remove`.
@MainActor
@Observable
class AgentsViewModel {
    /// All agents currently known, kept sorted for display.
    var agents: [Agent] = []

    /// Whether the initial REST load is in flight.
    var isLoading = false

    /// Error message if the load failed.
    var error: String?

    // MARK: - Loading

    /// Load the current agent list from the backend (initial population).
    func loadAgents() async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            agents = Self.sorted(try await APIClient.shared.getAgents())
        } catch let apiError as APIError {
            self.error = apiError.localizedDescription
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - WebSocket application

    /// Replace the whole list (from `agent:snapshot`).
    func applySnapshot(_ incoming: [Agent]) {
        agents = Self.sorted(incoming)
    }

    /// Insert or update a single agent by id (from `agent:update`).
    func upsert(_ agent: Agent) {
        if let index = agents.firstIndex(where: { $0.id == agent.id }) {
            agents[index] = agent
        } else {
            agents.append(agent)
        }
        agents = Self.sorted(agents)
    }

    /// Remove an agent by id (from `agent:removed`).
    func remove(id: String) {
        agents.removeAll { $0.id == id }
    }

    // MARK: - Derived

    /// Agents grouped by project, project name ascending.
    var groupedByProject: [AgentProjectGroup] {
        Dictionary(grouping: agents, by: { $0.project })
            .map { AgentProjectGroup(id: $0.key, project: $0.key, agents: $0.value) }
            .sorted { $0.project.localizedCaseInsensitiveCompare($1.project) == .orderedAscending }
    }

    /// One-line summary, e.g. "1 waiting · 2 working · 3 done".
    var summary: String {
        guard !agents.isEmpty else { return "No agents" }
        let waiting = agents.filter { $0.statusKind == .waiting }.count
        let working = agents.filter { $0.statusKind == .working }.count
        let done    = agents.filter { $0.statusKind == .done }.count

        var parts: [String] = []
        if waiting > 0 { parts.append("\(waiting) waiting") }
        if working > 0 { parts.append("\(working) working") }
        if done > 0    { parts.append("\(done) done") }
        return parts.isEmpty ? "\(agents.count) agent\(agents.count == 1 ? "" : "s")"
                             : parts.joined(separator: " · ")
    }

    // MARK: - Sorting

    /// waiting first (needs attention), then working, then done; tiebreak by title.
    private static func sorted(_ agents: [Agent]) -> [Agent] {
        agents.sorted { lhs, rhs in
            let lp = lhs.statusKind.sortPriority
            let rp = rhs.statusKind.sortPriority
            if lp != rp { return lp < rp }
            return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
        }
    }
}

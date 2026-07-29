import SwiftUI

/// Agents tab — live workmux agent status from the server bridge (#3).
///
/// Loads the current list via `GET /api/agents` on appear, then applies live
/// `agent:snapshot` / `agent:update` / `agent:removed` deltas over the
/// WebSocket. Mirrors `SessionsTabView`'s connection/settings toolbar so this
/// tab is self-sufficient as the app's default surface.
struct AgentsTabView: View {
    var connectionViewModel: ConnectionViewModel
    @Binding var showingSettings: Bool
    @State private var viewModel = AgentsViewModel()

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Agents")
                .toolbar { toolbarContent }
        }
        .task {
            await connectionViewModel.checkConnection()
            if connectionViewModel.connectionStatus.isConnected {
                await viewModel.loadAgents()
            }
        }
        .onAppear { startWebSocketObserving() }
        .onDisappear { stopWebSocketObserving() }
        .onChange(of: connectionViewModel.connectionStatus) { oldValue, newValue in
            if newValue.isConnected && !oldValue.isConnected {
                Task { await viewModel.loadAgents() }
            }
        }
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if !connectionViewModel.connectionStatus.isConnected {
            notConnectedView
        } else if viewModel.agents.isEmpty && !viewModel.isLoading && viewModel.error == nil {
            emptyStateView
        } else if let error = viewModel.error, viewModel.agents.isEmpty {
            errorStateView(error)
        } else {
            agentList
        }
    }

    private var agentList: some View {
        List {
            Section {
                Text(viewModel.summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            ForEach(viewModel.groupedByProject) { group in
                Section(group.project) {
                    ForEach(group.agents) { agent in
                        AgentRowView(agent: agent)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await viewModel.loadAgents() }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            HStack(spacing: 6) {
                Circle()
                    .fill(connectionViewModel.connectionStatus.color)
                    .frame(width: 8, height: 8)
                Text(connectionViewModel.connectionStatus.displayText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                showingSettings = true
            } label: {
                Image(systemName: "gear")
            }
        }
    }

    // MARK: - Empty / error states

    private var notConnectedView: some View {
        ContentUnavailableView {
            Label("Not Connected", systemImage: "wifi.slash")
        } description: {
            Text("Configure your server connection in Settings to view agents.")
        } actions: {
            Button("Open Settings") { showingSettings = true }
                .buttonStyle(.borderedProminent)
        }
    }

    private var emptyStateView: some View {
        ContentUnavailableView {
            Label("No Agents", systemImage: "cpu")
        } description: {
            Text("No workmux agents are running. Start one on the Mac to see it here.")
        } actions: {
            Button("Refresh") {
                Task { await viewModel.loadAgents() }
            }
        }
    }

    private func errorStateView(_ error: String) -> some View {
        ContentUnavailableView {
            Label("Error", systemImage: "exclamationmark.triangle")
        } description: {
            Text(error)
        } actions: {
            Button("Try Again") {
                Task { await viewModel.loadAgents() }
            }
        }
    }

    // MARK: - WebSocket

    private func startWebSocketObserving() {
        WebSocketClient.shared.onAgentSnapshot = { [viewModel] agents in
            Task { @MainActor in viewModel.applySnapshot(agents) }
        }
        WebSocketClient.shared.onAgentUpdate = { [viewModel] agent in
            Task { @MainActor in viewModel.upsert(agent) }
        }
        WebSocketClient.shared.onAgentRemoved = { [viewModel] id in
            Task { @MainActor in viewModel.remove(id: id) }
        }
    }

    private func stopWebSocketObserving() {
        WebSocketClient.shared.onAgentSnapshot = nil
        WebSocketClient.shared.onAgentUpdate = nil
        WebSocketClient.shared.onAgentRemoved = nil
    }
}

/// One agent row: status badge + title, with the worktree handle as subtitle.
struct AgentRowView: View {
    let agent: Agent

    var body: some View {
        HStack(spacing: 12) {
            statusBadge

            VStack(alignment: .leading, spacing: 4) {
                Text(agent.title.isEmpty ? agent.worktree : agent.title)
                    .font(.headline)
                    .lineLimit(1)

                Text(agent.worktree)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()
        }
        .padding(.vertical, 4)
    }

    private var statusBadge: some View {
        Text(agent.statusKind.label)
            .font(.caption2)
            .fontWeight(.semibold)
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(agent.statusKind.badgeColor)
            .clipShape(Capsule())
    }
}

// MARK: - AgentStatusKind Badge Color

extension AgentStatusKind {
    /// Colour for the status badge. Kept in the view layer (SwiftUI) so the
    /// model stays Foundation-only, mirroring `SessionStatus.badgeColor`.
    var badgeColor: Color {
        switch self {
        case .working: return .green
        case .waiting: return .orange
        case .done:    return .blue
        case .other:   return .gray
        }
    }
}

// MARK: - Preview

#Preview {
    List {
        Section("claudePM") {
            AgentRowView(agent: Agent(
                id: "tmux:default:%1", worktree: "claudePM", project: "claudePM",
                status: "working", title: "Set up Workmux project",
                workdir: "/Users/dev/claudePM", statusTs: 0, updatedTs: 0
            ))
        }
        Section("sso-web") {
            AgentRowView(agent: Agent(
                id: "tmux:default:%2", worktree: "sso-web", project: "sso-web",
                status: "done", title: "Show projected values on quote page",
                workdir: "/Users/dev/sso-web", statusTs: 0, updatedTs: 0
            ))
        }
    }
}

import SwiftUI

/// Agents tab — live workmux agent status from the server bridge (#3).
///
/// Loads the current list via `GET /api/agents` on appear, then applies live
/// `agent:snapshot` / `agent:update` / `agent:removed` deltas over the
/// WebSocket. Mirrors `SessionsTabView`'s connection/settings toolbar so this
/// tab is self-sufficient as the app's default surface.
struct AgentsTabView: View {
    /// Which modal the Agents tab is showing. A single sheet route avoids the
    /// multiple-`.sheet`-on-one-view conflict, where only the last-attached
    /// sheet fires (which would silently kill row taps).
    private enum AgentSheet: Identifiable {
        case detail(Agent)
        case newAgent

        var id: String {
            switch self {
            case .detail(let agent): return "detail:\(agent.id)"
            case .newAgent:          return "new"
            }
        }
    }

    var connectionViewModel: ConnectionViewModel
    @Binding var showingSettings: Bool
    @State private var viewModel = AgentsViewModel()

    /// The currently presented modal (tapped-agent detail, or the `+` form).
    @State private var activeSheet: AgentSheet?

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Agents")
                .toolbar { toolbarContent }
        }
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .detail(let agent):
                AgentDetailSheet(agent: agent)
            case .newAgent:
                NewAgentSheet(projects: viewModel.groupedByProject.map(\.project))
            }
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
                        Button {
                            activeSheet = .detail(agent)
                        } label: {
                            AgentRowView(agent: agent)
                        }
                        .buttonStyle(.plain)
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
            HStack(spacing: 16) {
                Button {
                    activeSheet = .newAgent
                } label: {
                    Image(systemName: "plus")
                }
                .disabled(!connectionViewModel.connectionStatus.isConnected)

                Button {
                    showingSettings = true
                } label: {
                    Image(systemName: "gear")
                }
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

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
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
        case .working: return .blue
        case .waiting: return .orange
        case .done:    return .green
        case .other:   return .gray
        }
    }
}

// MARK: - Agent Detail Sheet

/// Tap-an-agent detail sheet: agent info plus the whitelisted workmux actions.
///
/// **Merge** shows only when the agent is `done`; **Remove** is always present.
/// Each runs server-side via the #11 command endpoints and surfaces workmux's
/// own captured stdout/stderr. A dirty-worktree remove is refused by the server
/// (409) — we then offer a scarier "discard changes" confirm that retries with
/// `force`. The live list behind the sheet updates via the existing WebSocket
/// `agent:update` / `agent:removed` handlers; no extra polling here.
struct AgentDetailSheet: View {
    let agent: Agent

    @Environment(\.dismiss) private var dismiss

    @State private var isRunning = false
    @State private var result: AgentCommandResult?
    @State private var errorMessage: String?

    @State private var confirmMerge = false
    @State private var confirmRemove = false
    @State private var confirmForceRemove = false
    @State private var dirtyFiles: [String] = []

    var body: some View {
        NavigationStack {
            Form {
                infoSection
                actionsSection
                if let result { resultSection(result) }
                if let errorMessage { errorSection(errorMessage) }
            }
            .navigationTitle("Agent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .confirmationDialog(
                "Merge \(agent.worktree)?",
                isPresented: $confirmMerge,
                titleVisibility: .visible
            ) {
                Button("Merge") { runMerge() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Runs workmux merge for this worktree on the Mac.")
            }
            .confirmationDialog(
                "Remove \(agent.worktree)?",
                isPresented: $confirmRemove,
                titleVisibility: .visible
            ) {
                Button("Remove", role: .destructive) { runRemove(force: false) }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Runs workmux remove for this worktree on the Mac.")
            }
            .confirmationDialog(
                "Discard unsaved changes?",
                isPresented: $confirmForceRemove,
                titleVisibility: .visible
            ) {
                Button("Discard & Remove", role: .destructive) { runRemove(force: true) }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text(dirtyFiles.isEmpty
                     ? "This worktree has uncommitted changes that will be lost."
                     : "These files have uncommitted changes that will be lost:\n\n"
                       + dirtyFiles.joined(separator: "\n"))
            }
        }
    }

    // MARK: Sections

    private var infoSection: some View {
        Section {
            LabeledContent("Title", value: agent.title.isEmpty ? agent.worktree : agent.title)
            LabeledContent("Worktree", value: agent.worktree)
            LabeledContent("Project", value: agent.project)
            LabeledContent("Status") {
                Text(agent.statusKind.label)
                    .font(.caption).fontWeight(.semibold)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(agent.statusKind.badgeColor)
                    .clipShape(Capsule())
            }
            Text(agent.workdir)
                .font(.footnote.monospaced())
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
        }
    }

    private var actionsSection: some View {
        Section {
            if agent.statusKind == .done {
                Button {
                    confirmMerge = true
                } label: {
                    Label("Merge", systemImage: "arrow.triangle.merge")
                }
                .disabled(isRunning)
            }

            Button(role: .destructive) {
                confirmRemove = true
            } label: {
                Label("Remove", systemImage: "trash")
            }
            .disabled(isRunning)

            if isRunning {
                HStack(spacing: 8) {
                    ProgressView()
                    Text("Running…").foregroundStyle(.secondary)
                }
            }
        } footer: {
            Text("Commands run on the Mac over Tailscale and require the server API key.")
        }
    }

    private func resultSection(_ result: AgentCommandResult) -> some View {
        Section("Result — \(result.action) (exit \(result.output.exitCode))") {
            commandOutput(result.output)
        }
    }

    private func errorSection(_ message: String) -> some View {
        Section("Error") {
            Text(message).foregroundStyle(.red).textSelection(.enabled)
        }
    }

    // MARK: Commands

    private func runMerge() {
        isRunning = true; errorMessage = nil; result = nil
        Task {
            do {
                let outcome = try await APIClient.shared.mergeAgent(id: agent.id)
                await MainActor.run { result = outcome; isRunning = false }
            } catch {
                await MainActor.run { errorMessage = commandErrorText(error); isRunning = false }
            }
        }
    }

    private func runRemove(force: Bool) {
        isRunning = true; errorMessage = nil; result = nil
        Task {
            do {
                let outcome = try await APIClient.shared.removeAgent(id: agent.id, force: force)
                await MainActor.run { result = outcome; isRunning = false }
            } catch let commandError as AgentCommandError {
                await MainActor.run {
                    isRunning = false
                    if case let .dirtyWorktree(_, files) = commandError {
                        // Server refused a dirty remove — escalate to the scarier confirm.
                        dirtyFiles = files
                        confirmForceRemove = true
                    } else {
                        errorMessage = commandError.errorDescription
                    }
                }
            } catch {
                await MainActor.run { errorMessage = commandErrorText(error); isRunning = false }
            }
        }
    }
}

// MARK: - New Agent Sheet

/// New-agent form: pick a project, name the worktree, optionally seed a task
/// (from the saved-task library or free text), then `workmux add … -b`. The new
/// agent shows up in the list via the existing WebSocket `agent:update` handler.
struct NewAgentSheet: View {
    /// Project names to choose from (derived from the live agent list).
    let projects: [String]

    @Environment(\.dismiss) private var dismiss

    @State private var project = ""
    @State private var name = ""
    @State private var task = ""
    @State private var presets: [String] = []
    @State private var isSubmitting = false
    @State private var result: AgentCommandResult?
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                if projects.isEmpty {
                    Section {
                        Text("No projects yet. `workmux add` branches off an existing agent's worktree, so start the first agent for a project on the Mac before adding more from here.")
                            .foregroundStyle(.secondary)
                    }
                } else {
                    projectSection
                    nameSection
                    if !presets.isEmpty { presetsSection }
                    taskSection
                }
                if let result { resultSection(result) }
                if let errorMessage { errorSection(errorMessage) }
            }
            .navigationTitle("New Agent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if result != nil {
                        Button("Done") { dismiss() }
                    } else if isSubmitting {
                        ProgressView()
                    } else {
                        Button("Create") { submit() }
                            .disabled(!canSubmit)
                    }
                }
            }
            .task {
                if project.isEmpty { project = projects.first ?? "" }
                await loadPresets()
            }
        }
    }

    private var canSubmit: Bool {
        !project.isEmpty
            && !name.trimmingCharacters(in: .whitespaces).isEmpty
            && !isSubmitting
    }

    // MARK: Sections

    private var projectSection: some View {
        Section("Project") {
            Picker("Project", selection: $project) {
                ForEach(projects, id: \.self) { Text($0).tag($0) }
            }
        }
    }

    private var nameSection: some View {
        Section("Name") {
            TextField("worktree / branch name", text: $name)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        }
    }

    private var presetsSection: some View {
        Section("Saved tasks") {
            ForEach(presets, id: \.self) { preset in
                Button {
                    task = preset
                } label: {
                    Text(preset)
                        .lineLimit(2)
                        .foregroundStyle(.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                }
            }
        }
    }

    private var taskSection: some View {
        Section("Task") {
            TextField("Optional task for the new agent", text: $task, axis: .vertical)
                .lineLimit(3...8)
        }
    }

    private func resultSection(_ result: AgentCommandResult) -> some View {
        Section("Created (exit \(result.output.exitCode))") {
            commandOutput(result.output)
        }
    }

    private func errorSection(_ message: String) -> some View {
        Section("Error") {
            Text(message).foregroundStyle(.red).textSelection(.enabled)
        }
    }

    // MARK: Actions

    private func loadPresets() async {
        // Presets are optional sugar — a failure just leaves the box free-form.
        if let loaded = try? await APIClient.shared.getTaskPresets() {
            await MainActor.run { presets = loaded }
        }
    }

    private func submit() {
        let trimmedName = name.trimmingCharacters(in: .whitespaces)
        let trimmedTask = task.trimmingCharacters(in: .whitespacesAndNewlines)
        isSubmitting = true; errorMessage = nil
        Task {
            do {
                let outcome = try await APIClient.shared.addAgent(
                    project: project,
                    name: trimmedName,
                    task: trimmedTask.isEmpty ? nil : trimmedTask
                )
                await MainActor.run { result = outcome; isSubmitting = false }
            } catch {
                await MainActor.run { errorMessage = commandErrorText(error); isSubmitting = false }
            }
        }
    }
}

// MARK: - Shared command helpers

/// Human-readable text for a command failure (prefers `LocalizedError`).
private func commandErrorText(_ error: Error) -> String {
    (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
}

/// Render a command's captured stdout/stderr as selectable monospaced text.
@ViewBuilder
private func commandOutput(_ output: AgentCommandOutput) -> some View {
    if !output.stdout.isEmpty {
        Text(output.stdout)
            .font(.footnote.monospaced())
            .textSelection(.enabled)
    }
    if !output.stderr.isEmpty {
        Text(output.stderr)
            .font(.footnote.monospaced())
            .foregroundStyle(.orange)
            .textSelection(.enabled)
    }
    if output.stdout.isEmpty && output.stderr.isEmpty {
        Text("(no output)").foregroundStyle(.secondary)
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

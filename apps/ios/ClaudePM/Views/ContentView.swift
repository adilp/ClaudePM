import SwiftUI

/// Tabs available in the app
enum AppTab: Hashable {
    case sessions
    case tickets
}

/// Root content view with tab bar navigation
struct ContentView: View {
    @State private var connectionViewModel = ConnectionViewModel()
    @State private var showingSettings = false
    @State private var selectedTab: AppTab = .sessions
    private var notificationManager = NotificationManager.shared

    var body: some View {
        ZStack(alignment: .top) {
            // Main tab view
            TabView(selection: $selectedTab) {
                // Sessions tab
                SessionsTabView(
                    connectionViewModel: connectionViewModel,
                    showingSettings: $showingSettings
                )
                .tabItem {
                    Label("Sessions", systemImage: "terminal")
                }
                .tag(AppTab.sessions)

                // Tickets tab
                TicketBoardView()
                    .tabItem {
                        Label("Tickets", systemImage: "list.bullet.rectangle.portrait")
                    }
                    .tag(AppTab.tickets)
            }

            // Notification banner overlay (appears above everything)
            VStack(spacing: 4) {
                // WebSocket reconnecting banner
                if connectionViewModel.isWebSocketReconnecting {
                    reconnectingBanner
                        .padding(.horizontal)
                }

                // In-app notification banner
                NotificationBannerContainer(notificationManager: notificationManager)
            }
            .padding(.top, 4)
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView(viewModel: connectionViewModel)
        }
        .onAppear {
            connectionViewModel.startAutoRefresh()
            connectionViewModel.startWebSocketObserving()
        }
        .onDisappear {
            connectionViewModel.stopAutoRefresh()
            connectionViewModel.stopWebSocketObserving()
        }
    }

    private var reconnectingBanner: some View {
        HStack(spacing: 8) {
            ProgressView()
                .tint(.white)
                .scaleEffect(0.8)

            Text(connectionViewModel.webSocketStateText)
                .font(.subheadline)
                .foregroundStyle(.white)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(Color.orange)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

/// Sessions tab content (previously MainSessionListView)
struct SessionsTabView: View {
    var connectionViewModel: ConnectionViewModel
    @Binding var showingSettings: Bool
    @State private var viewModel = SessionListViewModel()
    @State private var showingNotifications = false

    // New session creation state
    @State private var showingProjectPicker = false
    @State private var projects: [Project] = []
    @State private var isLoadingProjects = false
    @State private var isCreatingSession = false
    @State private var newlyCreatedSession: Session?
    @State private var navigationPath = NavigationPath()

    var body: some View {
        NavigationStack(path: $navigationPath) {
            sessionListContent
                .navigationTitle("Sessions")
                .toolbar {
                    toolbarContent
                }
                .navigationDestination(for: Session.self) { session in
                    SessionDetailView(session: session)
                }
        }
        .sheet(isPresented: $showingNotifications) {
            NotificationsListView(notificationManager: NotificationManager.shared)
        }
        .confirmationDialog("Select Project", isPresented: $showingProjectPicker, titleVisibility: .visible) {
            ForEach(projects) { project in
                Button(project.name) {
                    createSession(for: project)
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Choose a project to start an adhoc session")
        }
        .task {
            // Check connection first, then load sessions
            await connectionViewModel.checkConnection()
            if connectionViewModel.connectionStatus.isConnected {
                await viewModel.loadSessions()
            }
        }
        .onAppear {
            startWebSocketObserving()
        }
        .onDisappear {
            stopWebSocketObserving()
        }
        .onChange(of: connectionViewModel.connectionStatus) { oldValue, newValue in
            // Reload sessions when connection status changes to connected
            if newValue.isConnected && !oldValue.isConnected {
                Task {
                    await viewModel.loadSessions()
                }
            }
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            connectionStatusIndicator
        }
        ToolbarItem(placement: .topBarTrailing) {
            HStack(spacing: 16) {
                // New session button
                Button {
                    loadProjectsAndShowPicker()
                } label: {
                    if isLoadingProjects || isCreatingSession {
                        ProgressView()
                            .scaleEffect(0.8)
                    } else {
                        Image(systemName: "plus")
                    }
                }
                .disabled(!connectionViewModel.connectionStatus.isConnected || isLoadingProjects || isCreatingSession)

                // Notifications bell
                NotificationBellButton(unreadCount: NotificationManager.shared.unreadCount) {
                    showingNotifications = true
                }

                // Settings gear
                Button {
                    showingSettings = true
                } label: {
                    Image(systemName: "gear")
                }
            }
        }
    }

    private var connectionStatusIndicator: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(connectionViewModel.connectionStatus.color)
                .frame(width: 8, height: 8)

            Text(connectionViewModel.connectionStatus.displayText)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - List Content

    @ViewBuilder
    private var sessionListContent: some View {
        ZStack {
            if !connectionViewModel.connectionStatus.isConnected {
                // Not connected state
                notConnectedView
            } else if viewModel.visibleSessions.isEmpty && !viewModel.isLoading && viewModel.error == nil {
                // Empty state (but might have completed sessions hidden)
                if viewModel.completedCount > 0 {
                    allCompletedView
                } else {
                    emptyStateView
                }
            } else if let error = viewModel.error, viewModel.sessions.isEmpty {
                // Error state
                errorStateView(error)
            } else {
                // Session list
                sessionList
            }
        }
        .overlay {
            if viewModel.isLoading && viewModel.sessions.isEmpty {
                loadingView
            }
        }
    }

    private var sessionList: some View {
        List {
            // Discover and filter section
            Section {
                // Discover button
                Button {
                    Task { await viewModel.discoverSessions() }
                } label: {
                    HStack {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(.orange)
                        Text("Discover Manual Panes")
                        Spacer()
                        if viewModel.isDiscovering {
                            ProgressView()
                                .scaleEffect(0.8)
                        }
                    }
                }
                .disabled(viewModel.isDiscovering)

                // Filter chips
                if viewModel.activeSessions.count > 0 {
                    filterChipsView
                }
            }

            // Show/hide completed toggle if there are completed sessions
            if viewModel.completedCount > 0 {
                Section {
                    Toggle(isOn: $viewModel.showCompletedSessions) {
                        HStack {
                            Image(systemName: "checkmark.circle")
                                .foregroundStyle(.green)
                            Text("Show Completed")
                            Spacer()
                            Text("\(viewModel.completedCount)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(Color(.tertiarySystemFill))
                                .clipShape(Capsule())
                        }
                    }
                }
            }

            // Sessions list
            Section {
                ForEach(viewModel.visibleSessions) { session in
                    NavigationLink(value: session) {
                        SessionRowView(session: session)
                    }
                    .swipeActions(edge: .trailing) {
                        Button {
                            viewModel.renamingSession = session
                        } label: {
                            Label("Rename", systemImage: "pencil")
                        }
                        .tint(.blue)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable {
            await viewModel.loadSessions()
        }
        .alert("Rename Session", isPresented: Binding(
            get: { viewModel.renamingSession != nil },
            set: { if !$0 { viewModel.renamingSession = nil } }
        )) {
            TextField("Session name", text: $renameText)
            Button("Cancel", role: .cancel) {
                viewModel.renamingSession = nil
            }
            Button("Save") {
                if let session = viewModel.renamingSession {
                    Task {
                        await viewModel.renameSession(session, newName: renameText)
                        viewModel.renamingSession = nil
                    }
                }
            }
        } message: {
            Text("Enter a name for this session")
        }
    }

    @State private var renameText: String = ""

    private var filterChipsView: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Source filter
            HStack(spacing: 8) {
                Text("Source:")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                ForEach(SessionSourceFilter.allCases, id: \.self) { filter in
                    filterChip(
                        title: filter == .all ? "All" : filter.rawValue,
                        count: countForSourceFilter(filter),
                        isSelected: viewModel.sourceFilter == filter,
                        color: filter == .discovered ? .orange : .blue
                    ) {
                        viewModel.sourceFilter = filter
                    }
                }
            }

            // Command filter (only when not filtering to API only)
            if viewModel.sourceFilter != .api {
                HStack(spacing: 8) {
                    Text("Command:")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    ForEach(SessionCommandFilter.allCases, id: \.self) { filter in
                        filterChip(
                            title: filter.rawValue,
                            count: countForCommandFilter(filter),
                            isSelected: viewModel.commandFilter == filter,
                            color: colorForCommandFilter(filter)
                        ) {
                            viewModel.commandFilter = filter
                        }
                    }
                }
            }
        }
    }

    private func filterChip(title: String, count: Int?, isSelected: Bool, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(title)
                if let count = count, count > 0 {
                    Text("(\(count))")
                        .font(.caption2)
                }
            }
            .font(.caption)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(isSelected ? color.opacity(0.2) : Color(.tertiarySystemFill))
            .foregroundStyle(isSelected ? color : .secondary)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func countForSourceFilter(_ filter: SessionSourceFilter) -> Int? {
        switch filter {
        case .all: return nil
        case .api: return viewModel.filterCounts.api
        case .discovered: return viewModel.filterCounts.discovered
        }
    }

    private func countForCommandFilter(_ filter: SessionCommandFilter) -> Int? {
        switch filter {
        case .all: return nil
        case .node: return viewModel.filterCounts.node
        case .nvim: return viewModel.filterCounts.nvim
        case .other: return viewModel.filterCounts.other
        }
    }

    private func colorForCommandFilter(_ filter: SessionCommandFilter) -> Color {
        switch filter {
        case .all: return .blue
        case .node: return .green
        case .nvim: return .blue
        case .other: return .gray
        }
    }

    private var allCompletedView: some View {
        ContentUnavailableView {
            Label("All Done!", systemImage: "checkmark.circle")
        } description: {
            Text("\(viewModel.completedCount) completed session\(viewModel.completedCount == 1 ? "" : "s") hidden.")
        } actions: {
            Button("Show Completed") {
                viewModel.showCompletedSessions = true
            }
            .buttonStyle(.borderedProminent)
        }
    }

    private var notConnectedView: some View {
        ContentUnavailableView {
            Label("Not Connected", systemImage: "wifi.slash")
        } description: {
            Text("Configure your server connection in Settings to view sessions.")
        } actions: {
            Button("Open Settings") {
                showingSettings = true
            }
            .buttonStyle(.borderedProminent)
        }
    }

    private var emptyStateView: some View {
        ContentUnavailableView {
            Label("No Sessions", systemImage: "terminal")
        } description: {
            Text("No sessions found. Start a session from the server to see it here.")
        } actions: {
            Button("Refresh") {
                Task {
                    await viewModel.loadSessions()
                }
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
                Task {
                    await viewModel.loadSessions()
                }
            }
        }
    }

    private var loadingView: some View {
        VStack(spacing: 12) {
            ProgressView()
                .scaleEffect(1.2)
            Text("Loading sessions...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }

    // MARK: - WebSocket

    private func startWebSocketObserving() {
        WebSocketClient.shared.onSessionUpdate = { [viewModel] update in
            Task { @MainActor in
                viewModel.handleSessionUpdate(update)
            }
        }
    }

    private func stopWebSocketObserving() {
        WebSocketClient.shared.onSessionUpdate = nil
    }

    // MARK: - New Session Creation

    private func loadProjectsAndShowPicker() {
        isLoadingProjects = true
        Task {
            do {
                let loadedProjects = try await APIClient.shared.getProjects()
                await MainActor.run {
                    projects = loadedProjects
                    isLoadingProjects = false
                    if projects.isEmpty {
                        // No projects available
                        NotificationManager.shared.notifyError(
                            code: "NO_PROJECTS",
                            message: "No projects available. Create a project first."
                        )
                    } else {
                        showingProjectPicker = true
                    }
                }
            } catch {
                await MainActor.run {
                    isLoadingProjects = false
                    NotificationManager.shared.notifyError(
                        code: "LOAD_PROJECTS_FAILED",
                        message: "Failed to load projects: \(error.localizedDescription)"
                    )
                }
            }
        }
    }

    private func createSession(for project: Project) {
        isCreatingSession = true
        Task {
            do {
                let session = try await APIClient.shared.createSession(projectId: project.id)
                await MainActor.run {
                    isCreatingSession = false
                    // Add to session list and navigate
                    viewModel.addSession(session)
                    navigationPath.append(session)
                }
            } catch {
                await MainActor.run {
                    isCreatingSession = false
                    NotificationManager.shared.notifyError(
                        code: "CREATE_SESSION_FAILED",
                        message: "Failed to create session: \(error.localizedDescription)"
                    )
                }
            }
        }
    }
}

#Preview {
    ContentView()
}

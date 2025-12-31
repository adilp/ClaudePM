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

    var body: some View {
        NavigationStack {
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
            } else if viewModel.sessions.isEmpty && !viewModel.isLoading && viewModel.error == nil {
                // Empty state
                emptyStateView
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
        List(viewModel.sessions) { session in
            NavigationLink(value: session) {
                SessionRowView(session: session)
            }
        }
        .listStyle(.plain)
        .refreshable {
            await viewModel.loadSessions()
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
}

#Preview {
    ContentView()
}

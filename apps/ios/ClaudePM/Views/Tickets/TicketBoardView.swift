import SwiftUI

/// Project picker sheet as a separate view to avoid binding issues
struct ProjectPickerSheet: View {
    let projects: [Project]
    let selectedId: String?
    let onSelect: (String) -> Void
    let onDismiss: () -> Void

    var body: some View {
        NavigationStack {
            List {
                ForEach(projects, id: \.id) { (project: Project) in
                    Button {
                        onSelect(project.id)
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(project.name)
                                    .foregroundStyle(.primary)
                                Text(project.repoPath)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()

                            if selectedId == project.id {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.tint)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Select Project")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done", action: onDismiss)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

/// Main ticket board view showing kanban-style columns
struct TicketBoardView: View {
    @State private var viewModel = TicketBoardViewModel()
    @State private var selectedTicket: Ticket?
    @State private var showingProjectPicker = false

    /// Device horizontal size class for iPad detection
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        NavigationStack {
            ZStack {
                if viewModel.isLoading && viewModel.tickets.isEmpty {
                    loadingView
                } else if let error = viewModel.error, viewModel.tickets.isEmpty {
                    errorView(error)
                } else if viewModel.projects.isEmpty {
                    noProjectsView
                } else {
                    boardContent
                }
            }
            .navigationTitle("Tickets")
            .toolbar {
                toolbarContent
            }
            .refreshable {
                await viewModel.loadTickets()
            }
            .sheet(item: $selectedTicket) { ticket in
                TicketDetailSheet(
                    ticket: ticket,
                    projectId: viewModel.selectedProjectId ?? "",
                    onMove: { newStatus in
                        await viewModel.moveTicket(ticket.id, to: newStatus)
                    },
                    onStart: {
                        _ = await viewModel.startTicket(ticket.id)
                    }
                )
            }
            .sheet(isPresented: $showingProjectPicker) {
                ProjectPickerSheet(
                    projects: viewModel.projects,
                    selectedId: viewModel.selectedProjectId,
                    onSelect: { projectId in
                        viewModel.selectedProjectId = projectId
                        showingProjectPicker = false
                    },
                    onDismiss: {
                        showingProjectPicker = false
                    }
                )
            }
        }
        .task {
            await viewModel.loadProjects()
        }
        .onAppear {
            setupWebSocketCallbacks()
        }
        .onDisappear {
            clearWebSocketCallbacks()
        }
    }

    // MARK: - WebSocket Integration

    /// Set up WebSocket callbacks for real-time updates
    private func setupWebSocketCallbacks() {
        // Auto-refresh when WebSocket connects (initial or reconnect)
        WebSocketClient.shared.onConnected = { [viewModel] in
            Task {
                await viewModel.loadTickets()
            }
        }

        // Refresh when ticket state changes
        WebSocketClient.shared.onTicketStateChange = { [viewModel] _, _ in
            Task {
                await viewModel.loadTickets()
            }
        }
    }

    /// Clear WebSocket callbacks when view disappears
    private func clearWebSocketCallbacks() {
        WebSocketClient.shared.onConnected = nil
        WebSocketClient.shared.onTicketStateChange = nil
    }

    // MARK: - Board Content

    private var boardContent: some View {
        VStack(spacing: 0) {
            // Project selector
            projectSelector
                .padding(.horizontal)
                .padding(.vertical, 8)

            Divider()

            // Filter chips (only show if multiple prefixes)
            if viewModel.prefixes.count > 1 {
                filterChipsSection
                    .padding(.vertical, 12)
            }

            // Kanban columns
            if horizontalSizeClass == .regular {
                // iPad: show all columns side-by-side without scrolling
                iPadBoardLayout
            } else {
                // iPhone: horizontal scroll between columns
                iPhoneBoardLayout
            }
        }
        .background(Color(.systemGroupedBackground))
    }

    private var filterChipsSection: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // "All" chip
                FilterChip(
                    title: "All",
                    isSelected: viewModel.selectedPrefixes.isEmpty,
                    onTap: { viewModel.selectAll() }
                )

                // Prefix chips
                ForEach(viewModel.prefixes, id: \.self) { prefix in
                    FilterChip(
                        title: prefix,
                        isSelected: viewModel.selectedPrefixes.contains(prefix),
                        onTap: { viewModel.togglePrefix(prefix) }
                    )
                }
            }
            .padding(.horizontal)
        }
    }

    private var iPhoneBoardLayout: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: 16) {
                ForEach(TicketStatus.allCases, id: \.self) { status in
                    TicketColumnView(
                        status: status,
                        tickets: viewModel.tickets(for: status),
                        onTap: { selectedTicket = $0 }
                    )
                }
            }
            .padding()
        }
    }

    private var iPadBoardLayout: some View {
        GeometryReader { geometry in
            let columnWidth = (geometry.size.width - 80) / 4 // 4 columns with padding
            HStack(alignment: .top, spacing: 16) {
                ForEach(TicketStatus.allCases, id: \.self) { status in
                    TicketColumnView(
                        status: status,
                        tickets: viewModel.tickets(for: status),
                        onTap: { selectedTicket = $0 }
                    )
                    .frame(width: max(200, columnWidth))
                }
            }
            .padding()
        }
    }

    // MARK: - Project Selector

    private var projectSelector: some View {
        Button {
            showingProjectPicker = true
        } label: {
            HStack {
                Image(systemName: "folder.fill")
                    .foregroundStyle(.secondary)

                Text(selectedProjectName)
                    .fontWeight(.medium)

                Spacer()

                Image(systemName: "chevron.down")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    private var selectedProjectName: String {
        if let projectId = viewModel.selectedProjectId,
           let project = viewModel.projects.first(where: { $0.id == projectId }) {
            return project.name
        }
        return "Select Project"
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            HStack(spacing: 16) {
                // Refresh button
                Button {
                    Task {
                        await viewModel.loadTickets()
                    }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .disabled(viewModel.isLoading)

                // Loading indicator
                if viewModel.isLoading {
                    ProgressView()
                }
            }
        }
    }

    // MARK: - State Views

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)
            Text("Loading tickets...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private func errorView(_ error: String) -> some View {
        ContentUnavailableView {
            Label("Error", systemImage: "exclamationmark.triangle")
        } description: {
            Text(error)
        } actions: {
            Button("Try Again") {
                Task {
                    await viewModel.loadProjects()
                }
            }
            .buttonStyle(.borderedProminent)
        }
    }

    private var noProjectsView: some View {
        ContentUnavailableView {
            Label("No Projects", systemImage: "folder")
        } description: {
            Text("No projects found. Create a project from the server to see tickets.")
        } actions: {
            Button("Refresh") {
                Task {
                    await viewModel.loadProjects()
                }
            }
        }
    }
}

#Preview {
    TicketBoardView()
}

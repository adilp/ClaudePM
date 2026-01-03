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
    @State private var showingCreateTicket = false

    // Start session confirmation
    @State private var ticketToStart: Ticket?
    @State private var showingStartConfirmation = false
    @State private var isStarting = false

    // Session navigation
    @State private var sessionToView: Session?

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
                        await viewModel.startTicket(ticket.id)
                    },
                    onViewSession: { session in
                        selectedTicket = nil // Dismiss the sheet
                        sessionToView = session
                    },
                    onApprove: {
                        await viewModel.approveTicket(ticket.id)
                    },
                    onReject: { feedback in
                        await viewModel.rejectTicket(ticket.id, feedback: feedback)
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
            .sheet(isPresented: $showingCreateTicket) {
                CreateAdhocTicketSheet(
                    projectName: selectedProjectName,
                    onCreate: { title, slug, isExplore in
                        try await viewModel.createAdhocTicket(title: title, slug: slug, isExplore: isExplore)
                    }
                )
            }
            .alert("Start Session", isPresented: $showingStartConfirmation, presenting: ticketToStart) { ticket in
                Button("Cancel", role: .cancel) {
                    ticketToStart = nil
                }
                Button("Start") {
                    Task {
                        await startSession(for: ticket)
                    }
                }
            } message: { ticket in
                Text("Start a Claude session for \"\(ticket.title)\"?")
            }
            .navigationDestination(item: $sessionToView) { session in
                SessionDetailView(session: session)
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

    // MARK: - Actions

    /// Start a session for a ticket
    private func startSession(for ticket: Ticket) async {
        isStarting = true

        if let response = await viewModel.startTicket(ticket.id) {
            // Convert the StartedSession to a full Session for navigation
            let session = Session(
                id: response.session.id,
                projectId: response.session.projectId,
                ticketId: response.session.ticketId,
                type: .ticket,
                status: .running,
                source: .api,
                contextPercent: 0,
                paneId: response.session.paneId,
                paneName: nil,
                paneCommand: nil,
                paneCwd: nil,
                startedAt: nil,
                endedAt: nil,
                createdAt: Date(),
                updatedAt: Date(),
                project: SessionProject(id: response.session.projectId, name: selectedProjectName),
                ticket: SessionTicket(id: ticket.id, externalId: ticket.externalId, title: ticket.title)
            )
            sessionToView = session

            // Reload to update the session state
            await viewModel.loadTickets()
        }

        isStarting = false
        ticketToStart = nil
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
                        onTap: { selectedTicket = $0 },
                        runningSessionForTicket: { viewModel.runningSession(for: $0) },
                        onStart: { ticket in
                            ticketToStart = ticket
                            showingStartConfirmation = true
                        },
                        onViewSession: { session in
                            sessionToView = session
                        }
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
                        onTap: { selectedTicket = $0 },
                        runningSessionForTicket: { viewModel.runningSession(for: $0) },
                        onStart: { ticket in
                            ticketToStart = ticket
                            showingStartConfirmation = true
                        },
                        onViewSession: { session in
                            sessionToView = session
                        }
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
                // Create ticket button
                Button {
                    showingCreateTicket = true
                } label: {
                    if viewModel.isCreating {
                        ProgressView()
                    } else {
                        Image(systemName: "plus")
                    }
                }
                .disabled(viewModel.selectedProjectId == nil || viewModel.isCreating)

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

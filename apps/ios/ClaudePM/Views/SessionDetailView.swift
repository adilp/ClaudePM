import SwiftUI

/// Detail view for a selected session
/// Shows session information and will be expanded in future tickets
struct SessionDetailView: View {
    let session: Session

    /// Current session state that updates in real-time via WebSocket
    @State private var currentSession: Session

    init(session: Session) {
        self.session = session
        self._currentSession = State(initialValue: session)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header with status
                headerSection

                // Session info cards
                infoSection

                // Context usage
                contextSection

                // Timestamps
                timestampSection

                // Terminal placeholder (for NAT-015)
                terminalSection

                Spacer()
            }
            .padding()
        }
        .navigationTitle(sessionTitle)
        .navigationBarTitleDisplayMode(.large)
        .onAppear {
            startWebSocketObserving()
        }
        .onDisappear {
            stopWebSocketObserving()
        }
    }

    // MARK: - WebSocket Updates

    private func startWebSocketObserving() {
        // Store previous handler to chain if needed
        let previousHandler = WebSocketClient.shared.onSessionUpdate

        WebSocketClient.shared.onSessionUpdate = { update in
            // Only update if it's for our session
            if update.sessionId == session.id {
                Task { @MainActor in
                    handleSessionUpdate(update)
                }
            }

            // Forward to any previous handler (session list)
            previousHandler?(update)
        }
    }

    private func stopWebSocketObserving() {
        // Note: The session list will re-register its handler when needed
    }

    @MainActor
    private func handleSessionUpdate(_ update: SessionUpdate) {
        switch update.type {
        case .status:
            if let newStatus = update.status {
                currentSession = Session(
                    id: currentSession.id,
                    projectId: currentSession.projectId,
                    ticketId: currentSession.ticketId,
                    type: currentSession.type,
                    status: newStatus,
                    contextPercent: currentSession.contextPercent,
                    paneId: currentSession.paneId,
                    startedAt: currentSession.startedAt,
                    endedAt: currentSession.endedAt,
                    createdAt: currentSession.createdAt,
                    updatedAt: Date(),
                    project: currentSession.project,
                    ticket: currentSession.ticket
                )
            }

        case .context:
            if let contextPercent = update.contextPercent {
                currentSession = Session(
                    id: currentSession.id,
                    projectId: currentSession.projectId,
                    ticketId: currentSession.ticketId,
                    type: currentSession.type,
                    status: currentSession.status,
                    contextPercent: contextPercent,
                    paneId: currentSession.paneId,
                    startedAt: currentSession.startedAt,
                    endedAt: currentSession.endedAt,
                    createdAt: currentSession.createdAt,
                    updatedAt: Date(),
                    project: currentSession.project,
                    ticket: currentSession.ticket
                )
            }

        case .waiting:
            // Waiting state is informational - could be used for UI indicator in future
            break
        }
    }

    // MARK: - Header Section

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Status badge
            HStack {
                Text(currentSession.status.displayName)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(currentSession.status.badgeColor)
                    .clipShape(Capsule())
                    .animation(.easeInOut(duration: 0.3), value: currentSession.status)

                Spacer()

                Text(currentSession.type.displayName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color(.tertiarySystemBackground))
                    .clipShape(Capsule())
            }

            // Ticket external ID if available
            if let ticket = currentSession.ticket, let externalId = ticket.externalId {
                Text(externalId)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Info Section

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Session Info")
                .font(.headline)

            infoCard
        }
    }

    private var infoCard: some View {
        VStack(spacing: 0) {
            infoRow(label: "Project", value: currentSession.project.name)
            Divider()
            if let ticket = currentSession.ticket {
                infoRow(label: "Ticket", value: ticket.title)
                Divider()
            }
            infoRow(label: "Session ID", value: String(currentSession.id.prefix(8)) + "...")
            Divider()
            infoRow(label: "Pane ID", value: currentSession.paneId)
        }
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func infoRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .fontWeight(.medium)
        }
        .padding()
    }

    // MARK: - Context Section

    private var contextSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Context Usage")
                .font(.headline)

            contextCard
        }
    }

    private var contextCard: some View {
        VStack(spacing: 12) {
            // Progress bar
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(.tertiarySystemBackground))
                        .frame(height: 24)

                    RoundedRectangle(cornerRadius: 8)
                        .fill(contextColor)
                        .frame(width: geometry.size.width * CGFloat(currentSession.contextPercent) / 100, height: 24)
                        .animation(.easeInOut(duration: 0.3), value: currentSession.contextPercent)
                }
            }
            .frame(height: 24)

            HStack {
                Text("\(currentSession.contextPercent)% used")
                    .font(.subheadline)
                    .fontWeight(.medium)
                Spacer()
                Text("\(100 - currentSession.contextPercent)% remaining")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Timestamp Section

    private var timestampSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Timestamps")
                .font(.headline)

            VStack(spacing: 0) {
                timestampRow(label: "Created", date: currentSession.createdAt)
                Divider()
                if let startedAt = currentSession.startedAt {
                    timestampRow(label: "Started", date: startedAt)
                    Divider()
                }
                if let endedAt = currentSession.endedAt {
                    timestampRow(label: "Ended", date: endedAt)
                    Divider()
                }
                timestampRow(label: "Updated", date: currentSession.updatedAt)
            }
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Terminal Section

    private var terminalSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Terminal")
                .font(.headline)

            TerminalContainerView(sessionId: currentSession.id)
                .frame(height: 300)
        }
    }

    private func timestampRow(label: String, date: Date) -> some View {
        HStack {
            Text(label)
                .foregroundStyle(.secondary)
            Spacer()
            Text(date, format: .dateTime.month().day().hour().minute())
                .fontWeight(.medium)
        }
        .padding()
    }

    // MARK: - Computed Properties

    private var sessionTitle: String {
        if let ticket = currentSession.ticket {
            return ticket.title
        }
        return currentSession.project.name
    }

    private var contextColor: Color {
        let percent = currentSession.contextPercent
        if percent >= 80 {
            return .red
        } else if percent >= 60 {
            return .orange
        } else if percent >= 40 {
            return .yellow
        }
        return .green
    }
}

// MARK: - Preview

#Preview("Running Session") {
    NavigationStack {
        SessionDetailView(session: Session(
            id: "550e8400-e29b-41d4-a716-446655440000",
            projectId: "proj-1",
            ticketId: "ticket-1",
            type: .ticket,
            status: .running,
            contextPercent: 45,
            paneId: "%1",
            startedAt: Date().addingTimeInterval(-3600),
            endedAt: nil,
            createdAt: Date().addingTimeInterval(-7200),
            updatedAt: Date(),
            project: SessionProject(id: "proj-1", name: "Claude PM"),
            ticket: SessionTicket(id: "ticket-1", externalId: "NAT-012", title: "iOS Session List View")
        ))
    }
}

#Preview("Completed Ad-hoc") {
    NavigationStack {
        SessionDetailView(session: Session(
            id: "550e8400-e29b-41d4-a716-446655440001",
            projectId: "proj-2",
            ticketId: nil,
            type: .adhoc,
            status: .completed,
            contextPercent: 85,
            paneId: "%2",
            startedAt: Date().addingTimeInterval(-7200),
            endedAt: Date().addingTimeInterval(-3600),
            createdAt: Date().addingTimeInterval(-10800),
            updatedAt: Date(),
            project: SessionProject(id: "proj-2", name: "My Project"),
            ticket: nil
        ))
    }
}

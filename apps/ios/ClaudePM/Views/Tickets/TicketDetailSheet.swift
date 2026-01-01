import SwiftUI

/// Sheet view for displaying ticket details, content, and AI analysis
struct TicketDetailSheet: View {
    let ticket: Ticket
    let projectId: String
    let onMove: (TicketStatus) async -> Void
    let onStart: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var ticketDetail: TicketDetail?
    @State private var sessions: [Session] = []
    @State private var isLoadingDetail = false
    @State private var isLoadingSessions = false
    @State private var isMoving = false
    @State private var isStarting = false
    @State private var error: String?
    @State private var showDiffViewer = false
    @State private var selectedSection: DetailSection = .content

    private enum DetailSection: String, CaseIterable {
        case content = "Content"
        case analysis = "Analysis"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Latest review result banner (shows at top when there's a review)
                    if latestSession != nil {
                        ReviewResultBanner(ticketId: ticket.id)
                    }

                    // Header section
                    headerSection

                    // Status section
                    statusSection

                    // Section picker
                    if latestSession != nil || ticketDetail != nil {
                        sectionPicker
                    }

                    // Content based on selected section
                    switch selectedSection {
                    case .content:
                        contentSection

                    case .analysis:
                        analysisSection
                    }

                    Divider()

                    // Actions section
                    actionsSection
                }
                .padding()
            }
            .navigationTitle("Ticket Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .sheet(isPresented: $showDiffViewer) {
                DiffViewer(projectId: projectId)
                    .presentationDetents([.large])
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .task {
            await loadData()
        }
    }

    // MARK: - Computed Properties

    /// Get the most relevant session - prefer running, then latest by creation date
    private var latestSession: Session? {
        // Prefer running session
        if let running = sessions.first(where: { $0.status == .running }) {
            return running
        }
        // Otherwise return the most recent session (already sorted by createdAt desc)
        return sessions.first
    }

    // MARK: - Sections

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            // External ID
            if let externalId = ticket.externalId {
                Text(externalId)
                    .font(.subheadline)
                    .fontDesign(.monospaced)
                    .foregroundStyle(.secondary)
            }

            // Title
            Text(ticket.title)
                .font(.title2)
                .fontWeight(.semibold)

            // Badges
            HStack(spacing: 8) {
                if ticket.isAdhoc {
                    badgeView(text: "ADHOC", color: .purple)
                }
                if ticket.isExplore {
                    badgeView(text: "EXPLORE", color: .indigo)
                }
            }

            // Timestamps
            HStack(spacing: 16) {
                if let startedAt = ticket.startedAt {
                    Label(startedAt.formatted(.relative(presentation: .named)), systemImage: "play.circle")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Label(ticket.updatedAt.formatted(.relative(presentation: .named)), systemImage: "clock")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var statusSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Current Status")
                .font(.headline)

            HStack(spacing: 8) {
                Circle()
                    .fill(statusColor(for: ticket.state))
                    .frame(width: 12, height: 12)

                Text(ticket.state.displayName)
                    .font(.body)
                    .fontWeight(.medium)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    private var sectionPicker: some View {
        Picker("Section", selection: $selectedSection) {
            ForEach(DetailSection.allCases, id: \.self) { section in
                Text(section.rawValue).tag(section)
            }
        }
        .pickerStyle(.segmented)
    }

    @ViewBuilder
    private var contentSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Description")
                .font(.headline)

            if isLoadingDetail {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .padding()
            } else if let detail = ticketDetail, !detail.content.isEmpty {
                SimpleMarkdownView(content: detail.content)
                    .padding()
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            } else if let error = error {
                errorView(message: error) {
                    Task {
                        await loadData()
                    }
                }
            } else {
                Text("No content available")
                    .foregroundStyle(.secondary)
                    .font(.subheadline)
                    .padding()
            }
        }
    }

    @ViewBuilder
    private var analysisSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            if isLoadingSessions {
                HStack {
                    Spacer()
                    ProgressView()
                    Spacer()
                }
                .padding()
            } else if let session = latestSession {
                // Session Summary
                SessionSummaryCard(sessionId: session.id)

                // Review Report (for review/done tickets)
                if ticket.state == .review || ticket.state == .done {
                    ReviewReportPanel(sessionId: session.id, projectId: projectId)
                }

                // Review History
                ReviewHistoryPanel(ticketId: ticket.id)

                // View Diff button
                Button {
                    showDiffViewer = true
                } label: {
                    HStack {
                        Image(systemName: "arrow.left.arrow.right")
                        Text("View Code Changes")
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.7))
                    }
                    .padding()
                    .background(Color.purple)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "sparkles")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                    Text("No AI Analysis")
                        .font(.headline)
                    Text("Start a session to generate AI analysis")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 32)
            }
        }
    }

    private var actionsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Actions")
                .font(.headline)

            // Move to previous column (if not in backlog)
            if let previousStatus = previousStatus {
                actionButton(
                    title: "Move to \(previousStatus.displayName)",
                    icon: "arrow.left.circle.fill",
                    color: .blue
                ) {
                    await performMove(to: previousStatus)
                }
            }

            // Move to next column (if not done)
            if let nextStatus = nextStatus {
                actionButton(
                    title: "Move to \(nextStatus.displayName)",
                    icon: "arrow.right.circle.fill",
                    color: .green
                ) {
                    await performMove(to: nextStatus)
                }
            }

            // Start button (if not done and not currently starting)
            if ticket.state != .done {
                actionButton(
                    title: "Start Session",
                    icon: "play.circle.fill",
                    color: .orange,
                    isLoading: isStarting
                ) {
                    await performStart()
                }
            }
        }
    }

    // MARK: - Subviews

    private func badgeView(text: String, color: Color) -> some View {
        Text(text)
            .font(.caption)
            .fontWeight(.semibold)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.2))
            .foregroundStyle(color)
            .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private func actionButton(
        title: String,
        icon: String,
        color: Color,
        isLoading: Bool = false,
        action: @escaping () async -> Void
    ) -> some View {
        Button {
            Task {
                await action()
            }
        } label: {
            HStack {
                if isLoading {
                    ProgressView()
                        .tint(.white)
                } else {
                    Image(systemName: icon)
                }
                Text(title)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.7))
            }
            .padding()
            .background(color)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .disabled(isLoading || isMoving)
    }

    private func errorView(message: String, onRetry: @escaping () -> Void) -> some View {
        VStack(spacing: 8) {
            HStack {
                Image(systemName: "exclamationmark.triangle")
                    .foregroundStyle(.orange)
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Button("Retry", action: onRetry)
                .font(.caption)
                .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity)
        .padding()
    }

    // MARK: - Helpers

    private var previousStatus: TicketStatus? {
        let allCases = TicketStatus.allCases
        guard let currentIndex = allCases.firstIndex(of: ticket.state),
              currentIndex > 0 else {
            return nil
        }
        return allCases[currentIndex - 1]
    }

    private var nextStatus: TicketStatus? {
        let allCases = TicketStatus.allCases
        guard let currentIndex = allCases.firstIndex(of: ticket.state),
              currentIndex < allCases.count - 1 else {
            return nil
        }
        return allCases[currentIndex + 1]
    }

    private func statusColor(for status: TicketStatus) -> Color {
        switch status {
        case .backlog: return .gray
        case .inProgress: return .blue
        case .review: return .orange
        case .done: return .green
        }
    }

    // MARK: - Actions

    private func loadData() async {
        // Load ticket detail and sessions in parallel
        async let detailTask: () = loadTicketDetail()
        async let sessionsTask: () = loadSessions()

        await detailTask
        await sessionsTask
    }

    private func loadTicketDetail() async {
        isLoadingDetail = true
        error = nil

        do {
            ticketDetail = try await APIClient.shared.getTicketDetail(ticketId: ticket.id)
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
        }

        isLoadingDetail = false
    }

    private func loadSessions() async {
        isLoadingSessions = true

        do {
            sessions = try await APIClient.shared.getSessionsForTicket(projectId: projectId, ticketId: ticket.id)
        } catch {
            // Silently fail for sessions - not critical
            print("Failed to load sessions: \(error)")
        }

        isLoadingSessions = false
    }

    private func performMove(to status: TicketStatus) async {
        isMoving = true
        await onMove(status)
        isMoving = false
        dismiss()
    }

    private func performStart() async {
        isStarting = true
        await onStart()
        isStarting = false
        dismiss()
    }
}

#Preview {
    TicketDetailSheet(
        ticket: Ticket(
            id: "1",
            externalId: "CSM-001",
            title: "Implement new feature with detailed description",
            state: .inProgress,
            filePath: "/path",
            prefix: "CSM",
            isAdhoc: false,
            isExplore: false,
            startedAt: Date().addingTimeInterval(-3600),
            completedAt: nil,
            createdAt: Date().addingTimeInterval(-86400),
            updatedAt: Date()
        ),
        projectId: "test-project",
        onMove: { _ in },
        onStart: { }
    )
}

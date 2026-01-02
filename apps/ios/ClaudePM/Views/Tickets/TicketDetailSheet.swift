import SwiftUI

/// Sheet view for displaying ticket details, content, and AI analysis
struct TicketDetailSheet: View {
    let ticket: Ticket
    let projectId: String
    let onMove: (TicketStatus) async -> Void
    let onStart: () async -> StartTicketResponse?
    var onViewSession: ((Session) -> Void)? = nil
    var onApprove: (() async -> TransitionResult?)? = nil
    var onReject: ((String) async -> TransitionResult?)? = nil

    @Environment(\.dismiss) private var dismiss
    @State private var ticketDetail: TicketDetail?
    @State private var sessions: [Session] = []
    @State private var isLoadingDetail = false
    @State private var isLoadingSessions = false
    @State private var isMoving = false
    @State private var isStarting = false
    @State private var isApproving = false
    @State private var isRejecting = false
    @State private var error: String?
    @State private var showDiffViewer = false
    @State private var selectedSection: DetailSection = .content
    @State private var showStartConfirmation = false
    @State private var showRejectSheet = false
    @State private var rejectFeedback = ""

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

    /// Get the running session if one exists
    private var runningSession: Session? {
        sessions.first(where: { $0.status == .running })
    }

    /// Whether the ticket has a running session
    private var hasRunningSession: Bool {
        runningSession != nil
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

            // View Session button (if ticket has a running session)
            if let session = runningSession, let onViewSession = onViewSession {
                Button {
                    dismiss()
                    // Small delay to let the sheet dismiss before navigating
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        onViewSession(session)
                    }
                } label: {
                    HStack {
                        Image(systemName: "terminal.fill")
                        Text("View Session")
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.7))
                    }
                    .padding()
                    .background(Color.blue)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }

            // Approve/Reject buttons (only when ticket is in review state)
            if ticket.state == .review {
                HStack(spacing: 12) {
                    // Reject button
                    Button {
                        showRejectSheet = true
                    } label: {
                        HStack {
                            Image(systemName: "xmark.circle.fill")
                            Text(isRejecting ? "Rejecting..." : "Reject")
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.red)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .disabled(isApproving || isRejecting)

                    // Approve button
                    Button {
                        Task {
                            await performApprove()
                        }
                    } label: {
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                            Text(isApproving ? "Approving..." : "Approve")
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.green)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    .disabled(isApproving || isRejecting)
                }
            }

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

            // Start button (if not done and no running session)
            if ticket.state != .done && !hasRunningSession {
                actionButton(
                    title: "Start Session",
                    icon: "play.circle.fill",
                    color: .orange,
                    isLoading: isStarting
                ) {
                    showStartConfirmation = true
                }
            }
        }
        .alert("Start Session", isPresented: $showStartConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Start") {
                Task {
                    await performStart()
                }
            }
        } message: {
            Text("Start a Claude session for \"\(ticket.title)\"?")
        }
        .sheet(isPresented: $showRejectSheet) {
            rejectFeedbackSheet
        }
    }

    /// Sheet for collecting rejection feedback
    private var rejectFeedbackSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text("Please provide feedback explaining why this ticket is being rejected. This will be sent back to the session for revision.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                TextEditor(text: $rejectFeedback)
                    .frame(minHeight: 150)
                    .padding(8)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color(.systemGray4), lineWidth: 1)
                    )

                Spacer()
            }
            .padding()
            .navigationTitle("Reject Ticket")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        showRejectSheet = false
                        rejectFeedback = ""
                    }
                    .disabled(isRejecting)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task {
                            await performReject()
                        }
                    } label: {
                        if isRejecting {
                            ProgressView()
                        } else {
                            Text("Reject")
                        }
                    }
                    .disabled(rejectFeedback.trimmingCharacters(in: .whitespaces).isEmpty || isRejecting)
                }
            }
            .interactiveDismissDisabled(isRejecting)
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
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
        if let response = await onStart(), let onViewSession = onViewSession {
            // Navigate to the new session
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
                project: SessionProject(id: response.session.projectId, name: ""),
                ticket: SessionTicket(id: ticket.id, externalId: ticket.externalId, title: ticket.title)
            )
            dismiss()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                onViewSession(session)
            }
        }
        isStarting = false
    }

    private func performApprove() async {
        isApproving = true
        if let _ = await onApprove?() {
            dismiss()
        }
        isApproving = false
    }

    private func performReject() async {
        isRejecting = true
        let feedback = rejectFeedback.trimmingCharacters(in: .whitespaces)
        if let _ = await onReject?(feedback) {
            showRejectSheet = false
            rejectFeedback = ""
            dismiss()
        }
        isRejecting = false
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
        onStart: { nil }
    )
}

import SwiftUI

/// Sheet view for displaying ticket details and actions
struct TicketDetailSheet: View {
    let ticket: Ticket
    let onMove: (TicketStatus) async -> Void
    let onStart: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var isMoving = false
    @State private var isStarting = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Header section
                    headerSection

                    Divider()

                    // Status section
                    statusSection

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
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
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
            isAdhoc: false,
            isExplore: false,
            startedAt: nil,
            completedAt: nil,
            createdAt: Date(),
            updatedAt: Date()
        ),
        onMove: { _ in },
        onStart: { }
    )
}

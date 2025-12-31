import SwiftUI

/// A row view displaying session info in the session list
struct SessionRowView: View {
    let session: Session

    var body: some View {
        HStack(spacing: 12) {
            // Status indicator
            statusBadge

            VStack(alignment: .leading, spacing: 4) {
                // Session name (project name or ticket title)
                Text(sessionDisplayName)
                    .font(.headline)
                    .lineLimit(1)

                // Subtitle with session type and project
                HStack(spacing: 4) {
                    Text(session.type.displayName)
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if session.ticket != nil {
                        Text("•")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(session.project.name)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            }

            Spacer()

            // Context usage indicator
            contextIndicator
        }
        .padding(.vertical, 4)
    }

    // MARK: - Subviews

    /// Status badge showing session state
    private var statusBadge: some View {
        Text(session.status.displayName)
            .font(.caption2)
            .fontWeight(.semibold)
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(session.status.badgeColor)
            .clipShape(Capsule())
    }

    /// Context usage percentage indicator
    private var contextIndicator: some View {
        HStack(spacing: 4) {
            // Context percentage circle
            ZStack {
                Circle()
                    .stroke(Color.secondary.opacity(0.2), lineWidth: 3)

                Circle()
                    .trim(from: 0, to: CGFloat(session.contextPercent) / 100)
                    .stroke(contextColor, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            .frame(width: 24, height: 24)

            Text("\(session.contextPercent)%")
                .font(.caption)
                .foregroundStyle(.secondary)
                .monospacedDigit()
        }
    }

    // MARK: - Computed Properties

    /// Display name for the session
    private var sessionDisplayName: String {
        if let ticket = session.ticket {
            return ticket.title
        }
        return session.project.name
    }

    /// Color for context percentage based on usage level
    private var contextColor: Color {
        let percent = session.contextPercent
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

// MARK: - SessionStatus Badge Color Extension

extension SessionStatus {
    /// Color for the status badge
    var badgeColor: Color {
        switch self {
        case .running:
            return .green
        case .paused:
            return .yellow
        case .completed:
            return .blue
        case .error:
            return .red
        }
    }
}

// MARK: - SessionType Display Extension

extension SessionType {
    /// Display name for session type
    var displayName: String {
        switch self {
        case .ticket:
            return "Ticket"
        case .adhoc:
            return "Ad-hoc"
        }
    }
}

// MARK: - Preview

#Preview {
    List {
        SessionRowView(session: Session(
            id: "1",
            projectId: "proj-1",
            ticketId: "ticket-1",
            type: .ticket,
            status: .running,
            contextPercent: 45,
            paneId: "%1",
            startedAt: Date(),
            endedAt: nil,
            createdAt: Date(),
            updatedAt: Date(),
            project: SessionProject(id: "proj-1", name: "Claude PM"),
            ticket: SessionTicket(id: "ticket-1", externalId: "NAT-012", title: "iOS Session List View")
        ))

        SessionRowView(session: Session(
            id: "2",
            projectId: "proj-1",
            ticketId: nil,
            type: .adhoc,
            status: .paused,
            contextPercent: 72,
            paneId: "%2",
            startedAt: Date(),
            endedAt: nil,
            createdAt: Date(),
            updatedAt: Date(),
            project: SessionProject(id: "proj-1", name: "My Project"),
            ticket: nil
        ))

        SessionRowView(session: Session(
            id: "3",
            projectId: "proj-2",
            ticketId: "ticket-2",
            type: .ticket,
            status: .completed,
            contextPercent: 95,
            paneId: "%3",
            startedAt: Date(),
            endedAt: Date(),
            createdAt: Date(),
            updatedAt: Date(),
            project: SessionProject(id: "proj-2", name: "Backend API"),
            ticket: SessionTicket(id: "ticket-2", externalId: "API-001", title: "Implement Authentication")
        ))

        SessionRowView(session: Session(
            id: "4",
            projectId: "proj-1",
            ticketId: "ticket-3",
            type: .ticket,
            status: .error,
            contextPercent: 15,
            paneId: "%4",
            startedAt: Date(),
            endedAt: Date(),
            createdAt: Date(),
            updatedAt: Date(),
            project: SessionProject(id: "proj-1", name: "Claude PM"),
            ticket: SessionTicket(id: "ticket-3", externalId: "BUG-005", title: "Fix memory leak in WebSocket")
        ))
    }
}

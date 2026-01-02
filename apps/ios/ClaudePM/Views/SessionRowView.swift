import SwiftUI

/// A row view displaying session info in the session list
struct SessionRowView: View {
    let session: Session

    var body: some View {
        HStack(spacing: 12) {
            // Status indicator
            statusBadge

            VStack(alignment: .leading, spacing: 4) {
                // Session name with discovered badge
                HStack(spacing: 6) {
                    Text(session.displayName)
                        .font(.headline)
                        .lineLimit(1)

                    if session.isDiscovered {
                        Text("DISCOVERED")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(.orange)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Color.orange.opacity(0.15))
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                }

                // Subtitle with session type, project, and command
                HStack(spacing: 4) {
                    Text(session.type.displayName)
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    if session.ticket != nil || session.paneCommand != nil {
                        Text("•")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    if let command = session.paneCommand {
                        commandBadge(command)
                    }

                    if session.ticket != nil {
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

    /// Command badge showing what's running in the pane
    @ViewBuilder
    private func commandBadge(_ command: String) -> some View {
        let (color, hint) = commandInfo(command)
        HStack(spacing: 2) {
            Text(command)
                .font(.caption2)
                .fontWeight(.medium)
                .foregroundStyle(color)
            if let hint = hint {
                Text("(\(hint))")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 5)
        .padding(.vertical, 2)
        .background(color.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }

    /// Get color and hint for command
    private func commandInfo(_ command: String) -> (Color, String?) {
        switch command {
        case "node": return (.green, "Claude?")
        case "nvim", "vim": return (.blue, nil)
        case "zsh", "bash": return (.gray, nil)
        default: return (.secondary, nil)
        }
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
        // API session with ticket
        SessionRowView(session: Session(
            id: "1",
            projectId: "proj-1",
            ticketId: "ticket-1",
            type: .ticket,
            status: .running,
            source: .api,
            contextPercent: 45,
            paneId: "%1",
            paneName: nil,
            paneCommand: "node",
            paneCwd: "/Users/dev/project",
            startedAt: Date(),
            endedAt: nil,
            createdAt: Date(),
            updatedAt: Date(),
            project: SessionProject(id: "proj-1", name: "Claude PM"),
            ticket: SessionTicket(id: "ticket-1", externalId: "NAT-012", title: "iOS Session List View")
        ))

        // Discovered session with node (likely Claude)
        SessionRowView(session: Session(
            id: "2",
            projectId: "proj-1",
            ticketId: nil,
            type: .adhoc,
            status: .running,
            source: .discovered,
            contextPercent: 72,
            paneId: "%2",
            paneName: "My Claude Work",
            paneCommand: "node",
            paneCwd: "/Users/dev/project",
            startedAt: Date(),
            endedAt: nil,
            createdAt: Date(),
            updatedAt: Date(),
            project: SessionProject(id: "proj-1", name: "My Project"),
            ticket: nil
        ))

        // Discovered session with nvim
        SessionRowView(session: Session(
            id: "3",
            projectId: "proj-2",
            ticketId: nil,
            type: .adhoc,
            status: .running,
            source: .discovered,
            contextPercent: 10,
            paneId: "%3",
            paneName: nil,
            paneCommand: "nvim",
            paneCwd: "/Users/dev/backend",
            startedAt: Date(),
            endedAt: nil,
            createdAt: Date(),
            updatedAt: Date(),
            project: SessionProject(id: "proj-2", name: "Backend API"),
            ticket: nil
        ))

        // Completed API session
        SessionRowView(session: Session(
            id: "4",
            projectId: "proj-1",
            ticketId: "ticket-3",
            type: .ticket,
            status: .completed,
            source: .api,
            contextPercent: 95,
            paneId: "%4",
            paneName: nil,
            paneCommand: nil,
            paneCwd: nil,
            startedAt: Date(),
            endedAt: Date(),
            createdAt: Date(),
            updatedAt: Date(),
            project: SessionProject(id: "proj-1", name: "Claude PM"),
            ticket: SessionTicket(id: "ticket-3", externalId: "BUG-005", title: "Fix memory leak in WebSocket")
        ))
    }
}

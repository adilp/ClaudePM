import SwiftUI

/// A single column in the kanban board showing tickets of a specific status
struct TicketColumnView: View {
    let status: TicketStatus
    let tickets: [Ticket]
    let onTap: (Ticket) -> Void
    var runningSessionForTicket: ((String) -> Session?)? = nil
    var onStart: ((Ticket) -> Void)? = nil
    var onViewSession: ((Session) -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Column header
            columnHeader

            // Ticket list
            if tickets.isEmpty {
                emptyState
            } else {
                ticketList
            }

            Spacer(minLength: 0)
        }
        .frame(width: 280)
        .padding(.vertical, 8)
    }

    // MARK: - Subviews

    private var columnHeader: some View {
        HStack(spacing: 8) {
            // Status indicator dot
            Circle()
                .fill(statusColor)
                .frame(width: 10, height: 10)

            Text(status.displayName)
                .font(.headline)
                .foregroundStyle(.primary)

            // Ticket count badge
            Text("\(tickets.count)")
                .font(.caption)
                .fontWeight(.medium)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(Color(.systemGray5))
                .clipShape(Capsule())

            Spacer()
        }
        .padding(.horizontal, 4)
    }

    private var ticketList: some View {
        ScrollView(.vertical, showsIndicators: false) {
            LazyVStack(spacing: 8) {
                ForEach(tickets) { ticket in
                    TicketCardView(
                        ticket: ticket,
                        runningSession: runningSessionForTicket?(ticket.id),
                        onStart: onStart != nil ? { onStart?(ticket) } : nil,
                        onViewSession: onViewSession
                    )
                    .onTapGesture { onTap(ticket) }
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "tray")
                .font(.title2)
                .foregroundStyle(.tertiary)
            Text("No tickets")
                .font(.subheadline)
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
    }

    // MARK: - Helpers

    private var statusColor: Color {
        switch status {
        case .backlog:
            return .gray
        case .inProgress:
            return .blue
        case .review:
            return .orange
        case .done:
            return .green
        }
    }
}

#Preview {
    ScrollView(.horizontal) {
        HStack(spacing: 16) {
            TicketColumnView(
                status: .backlog,
                tickets: [
                    Ticket(
                        id: "1",
                        externalId: "CSM-001",
                        title: "Sample Ticket",
                        state: .backlog,
                        filePath: "/path",
                        prefix: "CSM",
                        isAdhoc: false,
                        isExplore: false,
                        startedAt: nil,
                        completedAt: nil,
                        createdAt: Date(),
                        updatedAt: Date()
                    )
                ],
                onTap: { _ in }
            )

            TicketColumnView(
                status: .inProgress,
                tickets: [],
                onTap: { _ in }
            )
        }
        .padding()
    }
}

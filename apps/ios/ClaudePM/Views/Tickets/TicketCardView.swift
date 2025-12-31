import SwiftUI

/// A card displaying a single ticket in the kanban board
struct TicketCardView: View {
    let ticket: Ticket

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Title row with icon
            HStack(alignment: .top, spacing: 8) {
                ticketIcon
                    .frame(width: 16, height: 16)

                Text(ticket.title)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)

                Spacer(minLength: 0)
            }

            // Badges row
            HStack(spacing: 6) {
                // Adhoc badge
                if ticket.isAdhoc {
                    badgeView(text: "ADHOC", color: .purple)
                }

                // Explore badge
                if ticket.isExplore {
                    badgeView(text: "EXPLORE", color: .indigo)
                }

                // External ID
                if let externalId = ticket.externalId {
                    Text(externalId)
                        .font(.caption)
                        .fontDesign(.monospaced)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 0)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(color: .black.opacity(0.05), radius: 2, x: 0, y: 1)
    }

    // MARK: - Subviews

    private var ticketIcon: some View {
        Group {
            if ticket.isExplore {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.indigo)
            } else {
                Image(systemName: "doc.text")
                    .foregroundStyle(.secondary)
            }
        }
        .font(.caption)
    }

    private var cardBackground: Color {
        if ticket.isExplore {
            return Color(.systemIndigo).opacity(0.1)
        }
        return Color(.secondarySystemGroupedBackground)
    }

    private func badgeView(text: String, color: Color) -> some View {
        Text(text)
            .font(.caption2)
            .fontWeight(.semibold)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.2))
            .foregroundStyle(color)
            .clipShape(RoundedRectangle(cornerRadius: 4))
    }
}

#Preview {
    VStack(spacing: 12) {
        TicketCardView(
            ticket: Ticket(
                id: "1",
                externalId: "CSM-001",
                title: "Implement new feature with a longer title that wraps",
                state: .backlog,
                filePath: "/path",
                isAdhoc: false,
                isExplore: false,
                startedAt: nil,
                completedAt: nil,
                createdAt: Date(),
                updatedAt: Date()
            )
        )

        TicketCardView(
            ticket: Ticket(
                id: "2",
                externalId: "NAT-002",
                title: "Ad-hoc investigation task",
                state: .inProgress,
                filePath: "/path",
                isAdhoc: true,
                isExplore: false,
                startedAt: nil,
                completedAt: nil,
                createdAt: Date(),
                updatedAt: Date()
            )
        )

        TicketCardView(
            ticket: Ticket(
                id: "3",
                externalId: "EXP-003",
                title: "Explore codebase architecture",
                state: .review,
                filePath: "/path",
                isAdhoc: false,
                isExplore: true,
                startedAt: nil,
                completedAt: nil,
                createdAt: Date(),
                updatedAt: Date()
            )
        )
    }
    .padding()
    .frame(width: 300)
    .background(Color(.systemGroupedBackground))
}

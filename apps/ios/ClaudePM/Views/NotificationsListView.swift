import SwiftUI

/// A view that displays a list of recent notifications
struct NotificationsListView: View {
    @Bindable var notificationManager: NotificationManager
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if notificationManager.notifications.isEmpty {
                    emptyState
                } else {
                    notificationsList
                }
            }
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") {
                        dismiss()
                    }
                }

                if !notificationManager.notifications.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Clear All") {
                            withAnimation {
                                notificationManager.clearAll()
                            }
                        }
                        .foregroundStyle(.red)
                    }
                }
            }
        }
        // Use medium detent by default, allow expansion to large
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(20)
        // iOS 26+ Liquid Glass background
        .presentationBackground(.regularMaterial)
    }

    // MARK: - Empty State

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No Notifications", systemImage: "bell.slash")
        } description: {
            Text("You're all caught up! Notifications will appear here when sessions need attention.")
        }
    }

    // MARK: - Notifications List

    private var notificationsList: some View {
        List {
            ForEach(notificationManager.notifications) { notification in
                NotificationRowView(notification: notification)
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button(role: .destructive) {
                            withAnimation {
                                notificationManager.markAsRead(notification.id)
                            }
                        } label: {
                            Label("Dismiss", systemImage: "xmark")
                        }
                    }
            }
        }
        .listStyle(.plain)
    }
}

/// A single notification row
struct NotificationRowView: View {
    let notification: InAppNotification

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Icon
            Image(systemName: iconName)
                .font(.title3)
                .foregroundStyle(iconColor)
                .frame(width: 28)

            // Content
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(notification.title)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(notification.isRead ? .secondary : .primary)

                    Spacer()

                    Text(timeAgo)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }

                Text(notification.body)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                // Category tag
                HStack(spacing: 4) {
                    Text(notification.category.rawValue.capitalized)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color(.tertiarySystemFill))
                        .clipShape(Capsule())

                    if let ticketId = notification.ticketId {
                        Text(ticketId)
                            .font(.caption2)
                            .foregroundStyle(.blue)
                    }
                }
            }

            // Unread indicator
            if !notification.isRead {
                Circle()
                    .fill(.blue)
                    .frame(width: 8, height: 8)
            }
        }
        .padding(.vertical, 4)
        .opacity(notification.isRead ? 0.7 : 1.0)
    }

    // MARK: - Computed Properties

    private var iconName: String {
        switch notification.category {
        case .session:
            switch notification.priority {
            case .high, .urgent:
                return "exclamationmark.bubble.fill"
            default:
                return "terminal.fill"
            }
        case .ticket:
            return "ticket.fill"
        case .review:
            if notification.title.lowercased().contains("complete") {
                return "checkmark.circle.fill"
            } else if notification.title.lowercased().contains("clarification") {
                return "questionmark.circle.fill"
            }
            return "doc.text.magnifyingglass"
        case .analysis:
            return "sparkles"
        case .system:
            if notification.priority == .urgent {
                return "exclamationmark.triangle.fill"
            }
            return "bell.fill"
        }
    }

    private var iconColor: Color {
        switch notification.priority {
        case .low:
            return .secondary
        case .normal:
            return .blue
        case .high:
            return .orange
        case .urgent:
            return .red
        }
    }

    private var timeAgo: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: notification.timestamp, relativeTo: Date())
    }
}

/// Bell icon button with notification count badge
struct NotificationBellButton: View {
    let unreadCount: Int
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "bell.fill")
                    .font(.body)

                // Badge
                if unreadCount > 0 {
                    Text(unreadCount > 99 ? "99+" : "\(unreadCount)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 1)
                        .background(Color.red)
                        .clipShape(Capsule())
                        .offset(x: 8, y: -8)
                }
            }
        }
    }
}

#Preview("Notifications List") {
    let manager = NotificationManager.shared
    // Add some sample notifications for preview
    manager.add(InAppNotification(
        title: "Input Required",
        body: "Claude is waiting for input (question)",
        category: .session,
        priority: .high,
        sessionId: "123"
    ))
    manager.add(InAppNotification(
        title: "Review: Needs Clarification",
        body: "The git diff only shows changes to an Xcode user state file (binary), which is just IDE state and not actual code changes.",
        category: .review,
        priority: .urgent,
        sessionId: "123",
        ticketId: "NAT-013"
    ))
    manager.add(InAppNotification(
        title: "Summary Ready",
        body: "AI analysis completed",
        category: .analysis,
        priority: .normal,
        sessionId: "456"
    ))
    manager.add(InAppNotification(
        title: "Ticket Update",
        body: "Ticket moved to in_review",
        category: .ticket,
        priority: .normal,
        ticketId: "NAT-014"
    ))

    return NotificationsListView(notificationManager: manager)
}

#Preview("Bell Button") {
    HStack(spacing: 20) {
        NotificationBellButton(unreadCount: 0) {}
        NotificationBellButton(unreadCount: 3) {}
        NotificationBellButton(unreadCount: 99) {}
        NotificationBellButton(unreadCount: 150) {}
    }
    .padding()
}

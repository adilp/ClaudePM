import SwiftUI

/// A banner that displays the current notification
struct NotificationBannerView: View {
    let notification: InAppNotification
    let onDismiss: () -> Void
    let onTap: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            // Category icon
            Image(systemName: iconName)
                .font(.title2)
                .foregroundStyle(iconColor)
                .frame(width: 32)

            // Content
            VStack(alignment: .leading, spacing: 2) {
                Text(notification.title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Text(notification.body)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Spacer(minLength: 8)

            // Dismiss button
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(8)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background {
            RoundedRectangle(cornerRadius: 12)
                .fill(backgroundColor)
                .shadow(color: .black.opacity(0.1), radius: 8, x: 0, y: 4)
        }
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(borderColor, lineWidth: 1)
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onTap)
    }

    // MARK: - Computed Properties

    private var iconName: String {
        switch notification.category {
        case .session:
            return notification.priority == .high ? "exclamationmark.bubble.fill" : "terminal.fill"
        case .ticket:
            return "ticket.fill"
        case .review:
            switch notification.title.lowercased() {
            case let t where t.contains("complete"):
                return "checkmark.circle.fill"
            case let t where t.contains("clarification"):
                return "questionmark.circle.fill"
            default:
                return "doc.text.magnifyingglass"
            }
        case .analysis:
            return "sparkles"
        case .system:
            return notification.priority == .urgent ? "exclamationmark.triangle.fill" : "bell.fill"
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

    private var backgroundColor: Color {
        switch notification.priority {
        case .low, .normal:
            return Color(.systemBackground)
        case .high:
            return Color.orange.opacity(0.1)
        case .urgent:
            return Color.red.opacity(0.1)
        }
    }

    private var borderColor: Color {
        switch notification.priority {
        case .low, .normal:
            return Color(.separator).opacity(0.3)
        case .high:
            return Color.orange.opacity(0.3)
        case .urgent:
            return Color.red.opacity(0.3)
        }
    }
}

/// Container for showing/hiding the notification banner with animation
struct NotificationBannerContainer: View {
    @Bindable var notificationManager: NotificationManager

    var body: some View {
        VStack {
            if notificationManager.showBanner, let notification = notificationManager.currentBannerNotification {
                NotificationBannerView(
                    notification: notification,
                    onDismiss: {
                        withAnimation(.easeOut(duration: 0.2)) {
                            notificationManager.dismissBanner()
                        }
                    },
                    onTap: {
                        // Could navigate to relevant screen in future
                        withAnimation(.easeOut(duration: 0.2)) {
                            notificationManager.dismissBanner()
                        }
                    }
                )
                .transition(.asymmetric(
                    insertion: .move(edge: .top).combined(with: .opacity),
                    removal: .move(edge: .top).combined(with: .opacity)
                ))
                .padding(.horizontal)
            }

            Spacer()
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: notificationManager.showBanner)
    }
}

#Preview {
    VStack(spacing: 20) {
        NotificationBannerView(
            notification: InAppNotification(
                title: "Input Required",
                body: "Claude is waiting for input (question)",
                category: .session,
                priority: .high,
                sessionId: "123"
            ),
            onDismiss: {},
            onTap: {}
        )

        NotificationBannerView(
            notification: InAppNotification(
                title: "Review: Needs Clarification",
                body: "The git diff only shows changes to an Xcode user state file...",
                category: .review,
                priority: .urgent,
                sessionId: "123",
                ticketId: "NAT-013"
            ),
            onDismiss: {},
            onTap: {}
        )

        NotificationBannerView(
            notification: InAppNotification(
                title: "Summary Ready",
                body: "AI analysis completed",
                category: .analysis,
                priority: .normal,
                sessionId: "123"
            ),
            onDismiss: {},
            onTap: {}
        )

        NotificationBannerView(
            notification: InAppNotification(
                title: "Error: SESSION_NOT_FOUND",
                body: "The requested session does not exist",
                category: .system,
                priority: .urgent
            ),
            onDismiss: {},
            onTap: {}
        )
    }
    .padding()
}

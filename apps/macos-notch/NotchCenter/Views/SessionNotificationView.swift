import SwiftUI
import AppKit

struct SessionNotificationView: View {
    let notification: SessionNotification
    let onView: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 16) {
            // Status icon
            ZStack {
                Circle()
                    .fill(iconColor)
                    .frame(width: 44, height: 44)

                Image(systemName: notification.icon)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(.white)
            }

            // Notification info - flexible width, text wraps as needed
            VStack(alignment: .leading, spacing: 4) {
                Text(notification.title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Text(notification.subtitle)
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                    .lineLimit(nil)  // Allow unlimited lines for long text
                    .fixedSize(horizontal: false, vertical: true)

                if let detail = notification.detail {
                    Text(detail)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary.opacity(0.8))
                        .lineLimit(4)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Spacer(minLength: 12)

            // Action buttons
            HStack(spacing: 8) {
                // View button - opens Claude PM desktop app
                Button(action: onView) {
                    Text("View")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(
                            Capsule()
                                .fill(iconColor)
                        )
                }
                .buttonStyle(.plain)

                // Dismiss button
                Button(action: onDismiss) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 24))
                        .foregroundStyle(.white.opacity(0.7))
                }
                .buttonStyle(.plain)
                .contentShape(Circle())
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .frame(minWidth: 500, maxWidth: 700)  // Wider max to fit longer text
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.black.opacity(0.85))
        )
    }

    private var iconColor: Color {
        switch notification.iconColor {
        case "green":
            return .green
        case "orange":
            return .orange
        case "red":
            return .red
        default:
            return .blue
        }
    }
}

// MARK: - Claude PM App Activation

extension SessionNotificationView {
    /// Activate the Claude PM desktop app
    static func activateClaudePM() {
        // Try to find by bundle identifier first
        if let app = NSRunningApplication.runningApplications(withBundleIdentifier: "com.claudepm.desktop").first {
            app.activate()
            print("[ClaudePM] Activated desktop app via bundle ID")
        } else {
            // Fallback: try to launch by bundle ID using modern API
            if let appURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.claudepm.desktop") {
                NSWorkspace.shared.openApplication(at: appURL, configuration: NSWorkspace.OpenConfiguration()) { app, error in
                    if let error = error {
                        print("[ClaudePM] Failed to launch: \(error.localizedDescription)")
                    } else {
                        print("[ClaudePM] Launched desktop app")
                    }
                }
            } else {
                print("[ClaudePM] Could not find Claude PM desktop app")
            }
        }
    }
}

// MARK: - Previews

#Preview("Session Complete") {
    SessionNotificationView(
        notification: .completed(sessionId: "abc-123-def", ticketTitle: "Fix authentication bug"),
        onView: { print("View tapped") },
        onDismiss: { print("Dismiss tapped") }
    )
    .padding()
}

#Preview("Input Required") {
    SessionNotificationView(
        notification: .inputRequired(sessionId: "abc-123-def", ticketTitle: "Add user registration", reason: "permission_prompt"),
        onView: { print("View tapped") },
        onDismiss: { print("Dismiss tapped") }
    )
    .padding()
}

#Preview("Session Error") {
    SessionNotificationView(
        notification: .error(sessionId: "abc-123-def", ticketTitle: "Database migration", message: "Connection timeout"),
        onView: { print("View tapped") },
        onDismiss: { print("Dismiss tapped") }
    )
    .padding()
}

#Preview("No Ticket Title") {
    SessionNotificationView(
        notification: .completed(sessionId: "abc123def456", ticketTitle: nil),
        onView: { print("View tapped") },
        onDismiss: { print("Dismiss tapped") }
    )
    .padding()
}

#Preview("Long Text") {
    SessionNotificationView(
        notification: .completed(
            sessionId: "abc-123-def",
            ticketTitle: "Context Low: Ticket Roster improvement still in progress: The session output shows Claude has presented multiple design options for the roster improvement (Sleeper-style player cards with expandable details, compact grid view, and hybrid approach)"
        ),
        onView: { print("View tapped") },
        onDismiss: { print("Dismiss tapped") }
    )
    .padding()
}

import SwiftUI

/// Represents a notification scheduled for display
struct ScheduledNotification: Identifiable {
    let id: String
    let type: NotificationType
    let title: String
    let subtitle: String?
    let icon: String
    let triggerDate: Date
    let autoDismissAfter: TimeInterval?
    let persistUntilDismissed: Bool

    init(
        id: String = UUID().uuidString,
        type: NotificationType,
        title: String,
        subtitle: String? = nil,
        icon: String,
        triggerDate: Date = Date(),
        autoDismissAfter: TimeInterval? = 5.0,
        persistUntilDismissed: Bool = false
    ) {
        self.id = id
        self.type = type
        self.title = title
        self.subtitle = subtitle
        self.icon = icon
        self.triggerDate = triggerDate
        self.autoDismissAfter = autoDismissAfter
        self.persistUntilDismissed = persistUntilDismissed
    }

    enum NotificationType {
        case test
        case meetingEarlyWarning
        case meetingStarting
        case claudeSessionComplete
        case claudeInputRequired
        case claudeError
    }

    /// Creates a test notification
    static func test() -> ScheduledNotification {
        ScheduledNotification(
            type: .test,
            title: "Test Notification",
            subtitle: "NotchCenter is working!",
            icon: "bell.fill",
            autoDismissAfter: 5.0
        )
    }
}

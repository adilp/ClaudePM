import Foundation

/// Manages in-app notifications for display
@Observable
final class NotificationManager {
    // MARK: - Singleton

    static let shared = NotificationManager()

    private init() {}

    // MARK: - Published Properties

    /// All notifications (most recent first)
    private(set) var notifications: [InAppNotification] = []

    /// Track server notification IDs we've already loaded
    private var serverNotificationIds: Set<String> = []

    /// Whether we're currently fetching from server
    private(set) var isFetching: Bool = false

    /// The current notification to show in the banner (most recent unread high-priority)
    var currentBannerNotification: InAppNotification? {
        notifications.first { !$0.isRead && $0.priority >= .normal }
    }

    /// Unread notification count
    var unreadCount: Int {
        notifications.filter { !$0.isRead }.count
    }

    /// Whether to show the notification banner
    var showBanner: Bool = false

    // MARK: - Configuration

    /// Maximum number of notifications to keep
    private let maxNotifications = 50

    /// How long to show the banner (seconds)
    private let bannerDuration: TimeInterval = 5.0

    /// Timer to auto-dismiss banner
    private var dismissTimer: Timer?

    // MARK: - Public Methods

    /// Add a new notification
    func add(_ notification: InAppNotification) {
        // Insert at the beginning (most recent first)
        notifications.insert(notification, at: 0)

        // Trim old notifications
        if notifications.count > maxNotifications {
            notifications = Array(notifications.prefix(maxNotifications))
        }

        // Show banner for high+ priority notifications
        if notification.priority >= .high {
            showBannerWithAutoDismiss()
        }

        print("[NotificationManager] Added: \(notification.title) - \(notification.body)")
    }

    /// Mark a notification as read
    func markAsRead(_ id: String) {
        if let index = notifications.firstIndex(where: { $0.id == id }) {
            notifications[index].isRead = true
        }
    }

    /// Mark all notifications as read
    func markAllAsRead() {
        for index in notifications.indices {
            notifications[index].isRead = true
        }
    }

    /// Dismiss the current banner
    func dismissBanner() {
        showBanner = false
        dismissTimer?.invalidate()
        dismissTimer = nil

        // Mark the current banner notification as read
        if let notification = currentBannerNotification {
            markAsRead(notification.id)
        }
    }

    /// Clear all notifications (also dismisses on server)
    func clearAll() {
        notifications.removeAll()
        serverNotificationIds.removeAll()
        dismissBanner()

        // Also dismiss on server
        Task {
            do {
                let dismissed = try await APIClient.shared.dismissAllNotifications()
                print("[NotificationManager] Dismissed \(dismissed) notifications on server")
            } catch {
                print("[NotificationManager] Failed to dismiss on server: \(error)")
            }
        }
    }

    // MARK: - Server Sync

    /// Fetch notifications from server and merge with local notifications
    func fetchFromServer() {
        guard !isFetching else {
            print("[NotificationManager] Already fetching, skipping")
            return
        }

        isFetching = true

        Task {
            defer {
                Task { @MainActor in
                    self.isFetching = false
                }
            }

            do {
                let serverNotifications = try await APIClient.shared.getNotifications()
                print("[NotificationManager] Fetched \(serverNotifications.count) notifications from server")

                await MainActor.run {
                    self.mergeServerNotifications(serverNotifications)
                }
            } catch {
                print("[NotificationManager] Failed to fetch notifications: \(error)")
            }
        }
    }

    /// Merge server notifications with local notifications
    private func mergeServerNotifications(_ serverNotifications: [ServerNotification]) {
        var newNotifications: [InAppNotification] = []
        var hasNewHighPriority = false

        for serverNotif in serverNotifications {
            // Skip if we already have this notification
            if serverNotificationIds.contains(serverNotif.id) {
                continue
            }

            // Also skip if it's already in our local list (by ID)
            if notifications.contains(where: { $0.id == serverNotif.id }) {
                serverNotificationIds.insert(serverNotif.id)
                continue
            }

            // Convert and add
            let inAppNotif = serverNotif.toInAppNotification()
            newNotifications.append(inAppNotif)
            serverNotificationIds.insert(serverNotif.id)

            if inAppNotif.priority >= .high {
                hasNewHighPriority = true
            }

            print("[NotificationManager] Added server notification: \(inAppNotif.title) - \(inAppNotif.body)")
        }

        if !newNotifications.isEmpty {
            // Insert new notifications at the beginning
            notifications.insert(contentsOf: newNotifications, at: 0)

            // Sort by timestamp (most recent first)
            notifications.sort { $0.timestamp > $1.timestamp }

            // Trim old notifications
            if notifications.count > maxNotifications {
                notifications = Array(notifications.prefix(maxNotifications))
            }

            // Show banner for high+ priority notifications
            if hasNewHighPriority {
                showBannerWithAutoDismiss()
            }
        }
    }

    // MARK: - Convenience Methods

    /// Create notification from session status change
    func notifySessionStatus(sessionId: String, previousStatus: String?, newStatus: String) {
        let title = "Session Status"
        let body = previousStatus != nil
            ? "Session changed from \(previousStatus!) to \(newStatus)"
            : "Session is now \(newStatus)"

        let priority: NotificationPriority = (newStatus == "error") ? .high : .low

        add(InAppNotification(
            title: title,
            body: body,
            category: .session,
            priority: priority,
            sessionId: sessionId
        ))
    }

    /// Create notification from session waiting state
    func notifySessionWaiting(sessionId: String, waiting: Bool, reason: String?) {
        guard waiting else { return } // Only notify when waiting starts

        let reasonText = reason ?? "unknown"
        let title = "Input Required"
        let body = "Claude is waiting for input (\(reasonText))"

        add(InAppNotification(
            title: title,
            body: body,
            category: .session,
            priority: .high,
            sessionId: sessionId
        ))
    }

    /// Create notification from review result
    func notifyReviewResult(sessionId: String, ticketId: String, decision: String, reasoning: String) {
        let decisionEnum = ReviewDecision(rawValue: decision)
        let title = "Review: \(decisionEnum?.displayText ?? decision)"

        let priority: NotificationPriority
        switch decisionEnum {
        case .complete:
            priority = .normal
        case .notComplete:
            priority = .high
        case .needsClarification:
            priority = .urgent
        case .none:
            priority = .normal
        }

        add(InAppNotification(
            title: title,
            body: reasoning,
            category: .review,
            priority: priority,
            sessionId: sessionId,
            ticketId: ticketId
        ))
    }

    /// Create notification from ticket state change
    func notifyTicketState(ticketId: String, previousState: String, newState: String, reason: String?) {
        let title = "Ticket Update"
        let body = reason != nil
            ? "Ticket moved to \(newState): \(reason!)"
            : "Ticket moved from \(previousState) to \(newState)"

        add(InAppNotification(
            title: title,
            body: body,
            category: .ticket,
            priority: .normal,
            ticketId: ticketId
        ))
    }

    /// Create notification from AI analysis status
    func notifyAnalysisStatus(sessionId: String, ticketId: String?, analysisType: String, status: String, error: String?) {
        let typeEnum = AnalysisType(rawValue: analysisType)
        let statusEnum = AnalysisStatus(rawValue: status)

        let title: String
        let body: String
        let priority: NotificationPriority

        switch statusEnum {
        case .generating:
            title = "Generating \(typeEnum?.displayText ?? analysisType)"
            body = "AI is generating analysis..."
            priority = .low
        case .completed:
            title = "\(typeEnum?.displayText ?? analysisType) Ready"
            body = "AI analysis completed"
            priority = .normal
        case .failed:
            title = "\(typeEnum?.displayText ?? analysisType) Failed"
            body = error ?? "Analysis generation failed"
            priority = .high
        case .none:
            title = "Analysis Update"
            body = "\(analysisType): \(status)"
            priority = .normal
        }

        add(InAppNotification(
            title: title,
            body: body,
            category: .analysis,
            priority: priority,
            sessionId: sessionId,
            ticketId: ticketId
        ))
    }

    /// Create notification from generic notification message
    func notifyGeneric(id: String, title: String, body: String) {
        add(InAppNotification(
            id: id,
            title: title,
            body: body,
            category: .system,
            priority: .high
        ))
    }

    /// Create notification from error
    func notifyError(code: String, message: String) {
        add(InAppNotification(
            title: "Error: \(code)",
            body: message,
            category: .system,
            priority: .urgent
        ))
    }

    // MARK: - Private Methods

    private func showBannerWithAutoDismiss() {
        showBanner = true

        // Cancel existing timer
        dismissTimer?.invalidate()

        // Set up auto-dismiss
        dismissTimer = Timer.scheduledTimer(withTimeInterval: bannerDuration, repeats: false) { [weak self] _ in
            Task { @MainActor in
                self?.dismissBanner()
            }
        }
    }
}

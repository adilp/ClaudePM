import SwiftUI
import DynamicNotchKit
import AppKit

@MainActor
final class NotchPresenter: ObservableObject {
    // MARK: - Singleton
    static let shared = NotchPresenter()

    private var activeTestNotch: DynamicNotch<TestNotificationView, EmptyView, EmptyView>?
    private var activeMeetingNotch: DynamicNotch<MeetingNotificationView, EmptyView, EmptyView>?
    private var activeSessionNotch: DynamicNotch<SessionNotificationView, EmptyView, EmptyView>?
    private var autoDismissTask: Task<Void, Never>?
    private var ringTimeoutTask: Task<Void, Never>?
    private var isPresenting = false

    /// How long the ring plays before auto-stopping (2 minutes)
    private let ringTimeoutSeconds: TimeInterval = 120

    /// Pending session notification (queued if one is already presenting)
    private var pendingSessionNotification: SessionNotification?

    private init() {}

    /// Presents a test notification from the notch
    func presentTest(persistent: Bool = false) async {
        guard !isPresenting else { return }
        isPresenting = true
        defer { isPresenting = false }

        // Dismiss any existing notification first
        await dismissAll()

        let notch = DynamicNotch {
            TestNotificationView(
                icon: "bell.fill",
                title: persistent ? "Persistent Notification" : "Test Notification",
                subtitle: persistent ? "Click X to dismiss" : "NotchCenter is working!",
                onDismiss: { [weak self] in
                    Task { @MainActor in
                        await self?.dismiss()
                    }
                }
            )
        }

        activeTestNotch = notch
        await notch.expand()

        // Schedule auto-dismiss after 5 seconds (unless persistent)
        if !persistent {
            scheduleAutoDismiss(seconds: 5)
        }
    }

    /// Presents a meeting notification from the notch
    func presentMeeting(_ meeting: MeetingEvent, isStarting: Bool) async {
        guard !isPresenting else { return }
        isPresenting = true
        defer { isPresenting = false }

        // Dismiss any existing notification first
        await dismissAll()

        // Start looping ring sound for T-0 notifications (with timeout)
        if isStarting && meeting.hasVideoLink {
            SoundPlayer.shared.startMeetingRing()
            scheduleRingTimeout()
        }

        let notch = DynamicNotch {
            MeetingNotificationView(
                meeting: meeting,
                isStarting: isStarting,
                onJoin: meeting.hasVideoLink ? {
                    if let url = meeting.videoLink?.url {
                        NSWorkspace.shared.open(url)
                    }
                    Task { @MainActor [weak self] in
                        await self?.dismiss()
                    }
                } : nil,
                onDismiss: { [weak self] in
                    Task { @MainActor in
                        await self?.dismiss()
                    }
                }
            )
        }

        activeMeetingNotch = notch
        await notch.expand()

        // T-5 notifications auto-dismiss after 10 seconds
        // T-0 notifications persist until dismissed
        if !isStarting {
            scheduleAutoDismiss(seconds: 10)
        }
    }

    /// Presents a Claude PM session notification from the notch
    /// If already presenting, queues the notification and shows it after current one finishes
    func presentSession(_ notification: SessionNotification) async {
        // If already presenting, queue this notification (latest wins)
        if isPresenting {
            pendingSessionNotification = notification
            return
        }

        isPresenting = true
        defer {
            isPresenting = false
            // Check for pending notification after this one completes
            if let pending = pendingSessionNotification {
                pendingSessionNotification = nil
                Task { @MainActor in
                    await self.presentSession(pending)
                }
            }
        }

        // Cancel any pending auto-dismiss
        autoDismissTask?.cancel()
        autoDismissTask = nil

        // Dismiss any existing notification first
        await dismissAll()

        let notch = DynamicNotch {
            SessionNotificationView(
                notification: notification,
                onView: {
                    // Activate Claude PM desktop app
                    SessionNotificationView.activateClaudePM()
                    Task { @MainActor [weak self] in
                        await self?.dismiss()
                    }
                },
                onDismiss: { [weak self] in
                    Task { @MainActor in
                        await self?.dismiss()
                    }
                }
            )
        }

        activeSessionNotch = notch
        await notch.expand()

        // Auto-dismiss after configured time (all session notifications auto-dismiss)
        scheduleAutoDismiss(seconds: notification.autoDismissAfter)
    }

    /// Public dismiss - cancels auto-dismiss, stops sound, and hides all
    func dismiss() async {
        autoDismissTask?.cancel()
        autoDismissTask = nil
        ringTimeoutTask?.cancel()
        ringTimeoutTask = nil
        SoundPlayer.shared.stopMeetingRing()
        await dismissAll()
    }

    /// Hide all notches
    /// NOTE: We capture and clear references BEFORE awaiting hide() to prevent
    /// race conditions where a new notification arrives during the hide animation.
    /// If we cleared after hide(), a new notch could be created and then immediately
    /// have its reference set to nil when the old hide() completes.
    private func dismissAll() async {
        // Capture and clear references atomically BEFORE awaiting
        let testNotch = activeTestNotch
        activeTestNotch = nil

        let meetingNotch = activeMeetingNotch
        activeMeetingNotch = nil

        let sessionNotch = activeSessionNotch
        activeSessionNotch = nil

        // Now hide all captured notches (safe even if new ones are created during await)
        if let notch = testNotch {
            await notch.hide()
        }
        if let notch = meetingNotch {
            await notch.hide()
        }
        if let notch = sessionNotch {
            await notch.hide()
        }
    }

    private func scheduleAutoDismiss(seconds: TimeInterval) {
        autoDismissTask?.cancel()
        autoDismissTask = Task {
            try? await Task.sleep(for: .seconds(seconds))
            if !Task.isCancelled {
                await self.dismissAll()
            }
        }
    }

    /// Schedules the ring to stop after timeout (notification stays visible)
    private func scheduleRingTimeout() {
        ringTimeoutTask?.cancel()
        ringTimeoutTask = Task {
            try? await Task.sleep(for: .seconds(ringTimeoutSeconds))
            if !Task.isCancelled {
                SoundPlayer.shared.stopMeetingRing()
            }
        }
    }
}

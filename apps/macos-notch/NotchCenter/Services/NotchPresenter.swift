import SwiftUI
import DynamicNotchKit
import AppKit

@MainActor
final class NotchPresenter: ObservableObject {
    private var activeTestNotch: DynamicNotch<TestNotificationView, EmptyView, EmptyView>?
    private var activeMeetingNotch: DynamicNotch<MeetingNotificationView, EmptyView, EmptyView>?
    private var autoDismissTask: Task<Void, Never>?
    private var isPresenting = false

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

        // Start looping ring sound for T-0 notifications
        if isStarting && meeting.hasVideoLink {
            SoundPlayer.shared.startMeetingRing()
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

    /// Public dismiss - cancels auto-dismiss, stops sound, and hides all
    func dismiss() async {
        autoDismissTask?.cancel()
        autoDismissTask = nil
        SoundPlayer.shared.stopMeetingRing()
        await dismissAll()
    }

    /// Hide all notches
    private func dismissAll() async {
        if let notch = activeTestNotch {
            await notch.hide()
            activeTestNotch = nil
        }
        if let notch = activeMeetingNotch {
            await notch.hide()
            activeMeetingNotch = nil
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
}

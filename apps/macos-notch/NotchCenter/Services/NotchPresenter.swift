import SwiftUI
import DynamicNotchKit
import AppKit

@MainActor
final class NotchPresenter: ObservableObject {
    private var activeNotch: DynamicNotch<TestNotificationView, EmptyView, EmptyView>?
    private var autoDismissTask: Task<Void, Never>?

    /// Presents a test notification from the notch
    /// - Parameter persistent: If true, notification won't auto-dismiss after 5 seconds
    func presentTest(persistent: Bool = false) async {
        // Dismiss any existing notification first
        await dismiss()

        let notch = DynamicNotch {
            TestNotificationView(
                icon: "bell.fill",
                title: persistent ? "Persistent Notification" : "Test Notification",
                subtitle: persistent ? "Click X to dismiss" : "NotchCenter is working!",
                onDismiss: { [weak self] in
                    Task { await self?.dismiss() }
                }
            )
        }

        activeNotch = notch
        await notch.expand()

        // Ensure the notification window doesn't steal focus
        if let window = notch.windowController?.window {
            window.level = .floating
            // Resign key status if accidentally became key
            if window.isKeyWindow {
                window.resignKey()
            }
        }

        // Schedule auto-dismiss after 5 seconds (unless persistent)
        if !persistent {
            autoDismissTask = Task {
                try? await Task.sleep(for: .seconds(5))
                if !Task.isCancelled {
                    await self.dismiss()
                }
            }
        }
    }

    /// Dismisses the current notification
    func dismiss() async {
        autoDismissTask?.cancel()
        autoDismissTask = nil

        await activeNotch?.hide()
        activeNotch = nil
    }
}

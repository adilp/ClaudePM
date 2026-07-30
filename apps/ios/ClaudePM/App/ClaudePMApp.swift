import SwiftUI
import UIKit
import UserNotifications

@main
struct ClaudePMApp: App {
    @Environment(\.scenePhase) private var scenePhase

    // Bridges into UIKit so we can receive the APNs device token callbacks,
    // which SwiftUI's App lifecycle doesn't surface directly.
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .onChange(of: scenePhase) { oldPhase, newPhase in
            handleScenePhaseChange(from: oldPhase, to: newPhase)
        }
    }

    /// Handle app lifecycle changes to manage WebSocket connection
    private func handleScenePhaseChange(from oldPhase: ScenePhase, to newPhase: ScenePhase) {
        switch newPhase {
        case .active:
            // App came to foreground - connect WebSocket
            print("[App] Scene became active, connecting WebSocket")
            WebSocketClient.shared.connect()

            // Fetch any missed notifications from server
            NotificationManager.shared.fetchFromServer()

        case .background:
            // App went to background - disconnect WebSocket to save battery
            print("[App] Scene went to background, disconnecting WebSocket")
            WebSocketClient.shared.disconnect()

        case .inactive:
            // Transitional state - no action needed
            break

        @unknown default:
            break
        }
    }
}

/// UIKit app delegate: owns push-notification registration and delivers the
/// APNs device token to the backend so the server can send push / Live Activity
/// updates.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        requestPushAuthorization()

        // Start the Live Activity observers up front (issue #13): the push-to-start
        // token must be registered even before any activity exists, so the server
        // can revive the lock-screen activity after iOS's ~8h expiry with no launch.
        Task { @MainActor in AgentLiveActivityManager.shared.bootstrap() }
        return true
    }

    /// Ask for notification permission; on grant, register for remote pushes.
    private func requestPushAuthorization() {
        UNUserNotificationCenter.current().requestAuthorization(
            options: [.alert, .sound, .badge]
        ) { granted, error in
            if let error = error {
                print("[Push] Authorization error: \(error.localizedDescription)")
            }
            guard granted else {
                print("[Push] Notification permission not granted")
                return
            }
            // registerForRemoteNotifications must be called on the main thread.
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    /// APNs handed us a device token — encode it as hex and send it to the server.
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        print("[Push] Registered APNs device token: \(token)")

        Task {
            do {
                try await APIClient.shared.registerDevice(token: token)
                print("[Push] Device token registered with backend")
            } catch {
                // Most likely the backend URL isn't configured yet; we'll retry
                // on the next launch when APNs re-issues the token.
                print("[Push] Failed to register token with backend: \(error.localizedDescription)")
            }
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("[Push] Failed to register for remote notifications: \(error.localizedDescription)")
    }

    /// Show pushes as a banner even when the app is in the foreground — useful
    /// for confirming the test push while the app is open.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }
}

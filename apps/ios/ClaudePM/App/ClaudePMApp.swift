import SwiftUI

@main
struct ClaudePMApp: App {
    @Environment(\.scenePhase) private var scenePhase

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

import SwiftUI

@main
struct NotchCenterApp: App {
    var body: some Scene {
        MenuBarExtra {
            VStack(spacing: 12) {
                Text("NotchCenter")
                    .font(.headline)
                Divider()
                Button("Quit") {
                    NSApplication.shared.terminate(nil)
                }
            }
            .padding()
            .frame(width: 200)
        } label: {
            Image(systemName: "bell.badge")
        }
        .menuBarExtraStyle(.window)
    }
}

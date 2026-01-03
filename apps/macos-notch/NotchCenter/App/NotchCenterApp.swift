import SwiftUI

@main
struct NotchCenterApp: App {
    @StateObject private var notchPresenter = NotchPresenter()

    var body: some Scene {
        MenuBarExtra {
            VStack(spacing: 12) {
                Text("NotchCenter")
                    .font(.headline)

                Divider()

                Button("Test Notification") {
                    Task {
                        await notchPresenter.presentTest()
                    }
                }

                Button("Test Persistent") {
                    Task {
                        await notchPresenter.presentTest(persistent: true)
                    }
                }

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

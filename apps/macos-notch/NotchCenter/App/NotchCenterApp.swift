import SwiftUI
import EventKit
import ServiceManagement

@main
struct NotchCenterApp: App {
    @StateObject private var notchPresenter = NotchPresenter()
    @StateObject private var calendarService = CalendarService()
    @AppStorage("launchAtLogin") private var launchAtLogin = false

    var body: some Scene {
        MenuBarExtra {
            VStack(spacing: 12) {
                Text("NotchCenter")
                    .font(.headline)

                Divider()

                // Calendar Status Section
                CalendarStatusView(calendarService: calendarService)

                Divider()

                // Launch at Login toggle
                Toggle("Launch at Login", isOn: Binding(
                    get: { launchAtLogin },
                    set: { newValue in
                        launchAtLogin = newValue
                        setLaunchAtLogin(newValue)
                    }
                ))

                Divider()

                // Test buttons
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
            .frame(width: 240)
            .onAppear {
                setupCalendarNotifications()
                syncLaunchAtLoginState()
            }
        } label: {
            Image(systemName: "bell.badge")
        }
        .menuBarExtraStyle(.window)
    }

    private func setupCalendarNotifications() {
        // Wire up calendar service to notch presenter
        calendarService.onMeetingNotification = { meeting, type in
            Task { @MainActor in
                let isStarting = type == .starting
                await notchPresenter.presentMeeting(meeting, isStarting: isStarting)
            }
        }

        // If already authorized, start monitoring
        if calendarService.isConnected {
            Task {
                await calendarService.refreshUpcomingMeetings()
                calendarService.startMonitoring()
            }
        }
    }

    private func setLaunchAtLogin(_ enabled: Bool) {
        do {
            if enabled {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
        } catch {
            print("Failed to \(enabled ? "enable" : "disable") launch at login: \(error)")
        }
    }

    private func syncLaunchAtLoginState() {
        // Sync the toggle with actual system state
        launchAtLogin = SMAppService.mainApp.status == .enabled
    }
}

// MARK: - Calendar Status View
struct CalendarStatusView: View {
    @ObservedObject var calendarService: CalendarService

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Calendar")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Spacer()

                // Status indicator
                HStack(spacing: 4) {
                    Circle()
                        .fill(calendarService.isConnected ? .green : .orange)
                        .frame(width: 8, height: 8)
                    Text(calendarService.statusText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if !calendarService.isConnected {
                Button("Grant Access") {
                    Task {
                        let granted = await calendarService.requestAccess()
                        if granted {
                            calendarService.startMonitoring()
                        }
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
            }
        }
    }
}

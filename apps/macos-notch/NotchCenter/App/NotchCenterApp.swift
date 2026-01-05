import SwiftUI
import EventKit
import ServiceManagement
import AppKit

// MARK: - App Delegate for reliable startup
class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        print("[NotchCenter] applicationDidFinishLaunching - setting up services")

        // Setup Claude PM WebSocket connection at app launch
        let service = ClaudePMService.shared
        let presenter = NotchPresenter.shared

        // Wire up notification callback
        service.onNotification = { notification in
            Task { @MainActor in
                print("[NotchCenter] Received notification, presenting...")
                await presenter.presentSession(notification)
            }
        }

        // Auto-connect if server URL is configured
        if !service.serverURL.isEmpty {
            print("[NotchCenter] Connecting to Claude PM server...")
            service.connect()
        } else {
            print("[NotchCenter] No server URL configured, skipping auto-connect")
        }
    }
}

@main
struct NotchCenterApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var notchPresenter = NotchPresenter.shared
    @StateObject private var calendarService = CalendarService()
    @StateObject private var claudePMService = ClaudePMService.shared
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

                // Claude PM Status Section
                ClaudePMStatusView(
                    service: claudePMService,
                    notchPresenter: notchPresenter
                )

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
            .frame(width: 280)
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

    // Claude PM setup is done in init() to ensure WebSocket connects at app launch

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

// MARK: - Claude PM Status View
struct ClaudePMStatusView: View {
    @ObservedObject var service: ClaudePMService
    @ObservedObject var notchPresenter: NotchPresenter
    @State private var editingURL: String = ""
    @State private var isEditing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Claude PM")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Spacer()

                // Status indicator
                HStack(spacing: 4) {
                    Circle()
                        .fill(statusColor)
                        .frame(width: 8, height: 8)
                    Text(service.connectionState.displayText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            // Server URL field
            HStack(spacing: 8) {
                if isEditing {
                    TextField("Server URL", text: $editingURL)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 11))
                        .onSubmit {
                            saveURL()
                        }

                    Button("Save") {
                        saveURL()
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                } else {
                    Text(service.serverURL.isEmpty ? "Not configured" : service.serverURL)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)

                    Spacer()

                    Button("Edit") {
                        editingURL = service.serverURL
                        isEditing = true
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
            }

            // Connect/Disconnect button
            HStack {
                if service.connectionState.isConnected {
                    Button("Disconnect") {
                        service.disconnect()
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)

                    // Test button when connected
                    Button("Test") {
                        Task {
                            // Show a test session notification
                            await notchPresenter.presentSession(
                                .completed(sessionId: "test-123", ticketTitle: "Test Session")
                            )
                        }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                } else if !service.serverURL.isEmpty {
                    Button("Connect") {
                        service.connect()
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                }
            }
        }
    }

    private var statusColor: Color {
        switch service.connectionState.statusColor {
        case "green":
            return .green
        case "yellow":
            return .yellow
        case "red":
            return .red
        default:
            return .gray
        }
    }

    private func saveURL() {
        service.setServerURL(editingURL, andConnect: true)
        isEditing = false
    }
}

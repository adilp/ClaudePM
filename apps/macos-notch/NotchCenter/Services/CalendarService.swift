import EventKit
import Foundation

@MainActor
final class CalendarService: ObservableObject {
    private let eventStore = EKEventStore()

    @Published var authorizationStatus: EKAuthorizationStatus = .notDetermined
    @Published var upcomingMeetings: [MeetingEvent] = []

    /// Scheduled notification timers keyed by "eventId-T5" or "eventId-T0"
    private var scheduledTimers: [String: Timer] = [:]

    /// Callback when a notification should be shown
    var onMeetingNotification: ((MeetingEvent, MeetingNotificationType) -> Void)?

    enum MeetingNotificationType {
        case earlyWarning  // T-5 minutes
        case starting      // T-0
    }

    init() {
        updateAuthorizationStatus()
    }

    /// Check current authorization status
    func updateAuthorizationStatus() {
        authorizationStatus = EKEventStore.authorizationStatus(for: .event)
    }

    /// Request calendar access from user
    func requestAccess() async -> Bool {
        do {
            let granted: Bool
            if #available(macOS 14.0, *) {
                granted = try await eventStore.requestFullAccessToEvents()
            } else {
                // Legacy API for macOS 13
                granted = try await eventStore.requestAccess(to: .event)
            }
            updateAuthorizationStatus()
            if granted {
                await refreshUpcomingMeetings()
                startMonitoring()
            }
            return granted
        } catch {
            print("Calendar access error: \(error)")
            updateAuthorizationStatus()
            return false
        }
    }

    /// Fetch meetings for the next 24 hours
    func refreshUpcomingMeetings() async {
        guard isConnected else { return }

        let now = Date()
        guard let endDate = Calendar.current.date(byAdding: .hour, value: 24, to: now) else { return }

        let predicate = eventStore.predicateForEvents(withStart: now, end: endDate, calendars: nil)
        let events = eventStore.events(matching: predicate)

        upcomingMeetings = events
            .filter { !$0.isAllDay }
            .sorted { $0.startDate < $1.startDate }
            .map { MeetingEvent(from: $0) }

        // Reschedule notifications for all meetings
        scheduleNotifications()
    }

    /// Subscribe to calendar change notifications
    func startMonitoring() {
        NotificationCenter.default.addObserver(
            forName: .EKEventStoreChanged,
            object: eventStore,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                await self?.refreshUpcomingMeetings()
            }
        }
    }

    /// Schedule T-5 and T-0 notifications for all upcoming meetings
    private func scheduleNotifications() {
        // Cancel all existing timers
        cancelAllTimers()

        let now = Date()

        for meeting in upcomingMeetings {
            let timeUntilStart = meeting.startDate.timeIntervalSince(now)

            // Skip meetings that have already started
            guard timeUntilStart > 0 else { continue }

            // T-5 notification (5 minutes before)
            // All meetings get T-5
            let t5Time = timeUntilStart - 300 // 5 minutes = 300 seconds
            if t5Time > 0 {
                scheduleTimer(
                    id: "\(meeting.id)-T5",
                    delay: t5Time,
                    meeting: meeting,
                    type: .earlyWarning
                )
            } else if timeUntilStart <= 300 && timeUntilStart > 0 {
                // Meeting starts in less than 5 minutes, show T-5 immediately
                onMeetingNotification?(meeting, .earlyWarning)
            }

            // T-1 notification (1 minute before start)
            // Only for meetings WITH video links
            if meeting.hasVideoLink {
                let t1Time = timeUntilStart - 60 // 1 minute = 60 seconds
                if t1Time > 0 {
                    scheduleTimer(
                        id: "\(meeting.id)-T1",
                        delay: t1Time,
                        meeting: meeting,
                        type: .starting
                    )
                } else if timeUntilStart <= 60 && timeUntilStart > 0 {
                    // Meeting starts in less than 1 minute, show T-1 immediately
                    onMeetingNotification?(meeting, .starting)
                }
            }
        }
    }

    private func scheduleTimer(id: String, delay: TimeInterval, meeting: MeetingEvent, type: MeetingNotificationType) {
        let timer = Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
            Task { @MainActor in
                self?.onMeetingNotification?(meeting, type)
                self?.scheduledTimers.removeValue(forKey: id)
            }
        }
        scheduledTimers[id] = timer
    }

    private func cancelAllTimers() {
        for timer in scheduledTimers.values {
            timer.invalidate()
        }
        scheduledTimers.removeAll()
    }

    /// Cancel notifications for a specific event (e.g., user joined early)
    func cancelNotifications(for eventId: String) {
        let keysToRemove = scheduledTimers.keys.filter { $0.hasPrefix(eventId) }
        for key in keysToRemove {
            scheduledTimers[key]?.invalidate()
            scheduledTimers.removeValue(forKey: key)
        }
    }

    var isConnected: Bool {
        if #available(macOS 14.0, *) {
            return authorizationStatus == .fullAccess
        } else {
            return authorizationStatus == .authorized
        }
    }

    var statusText: String {
        if #available(macOS 14.0, *) {
            switch authorizationStatus {
            case .fullAccess:
                return "Connected"
            case .notDetermined:
                return "Not Connected"
            case .denied, .restricted:
                return "Access Denied"
            case .writeOnly:
                return "Write Only (Need Full Access)"
            @unknown default:
                return "Unknown"
            }
        } else {
            switch authorizationStatus {
            case .authorized:
                return "Connected"
            case .notDetermined:
                return "Not Connected"
            case .denied, .restricted:
                return "Access Denied"
            @unknown default:
                return "Unknown"
            }
        }
    }
}

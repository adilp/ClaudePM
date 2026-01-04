import EventKit
import SwiftUI

/// Represents a calendar event with parsed video link information
struct MeetingEvent: Identifiable {
    let id: String
    let title: String
    let startDate: Date
    let endDate: Date
    let calendarName: String
    let calendarColor: Color
    let videoLink: VideoLink?

    var hasVideoLink: Bool { videoLink != nil }

    init(from event: EKEvent) {
        self.id = event.eventIdentifier
        self.title = event.title ?? "Untitled"
        self.startDate = event.startDate
        self.endDate = event.endDate
        self.calendarName = event.calendar.title
        self.calendarColor = Color(cgColor: event.calendar.cgColor)
        self.videoLink = LinkParser.extractVideoLink(from: event)
    }

    /// Preview/test initializer
    init(
        id: String,
        title: String,
        startDate: Date,
        endDate: Date,
        calendarName: String,
        calendarColor: Color,
        videoLink: VideoLink?
    ) {
        self.id = id
        self.title = title
        self.startDate = startDate
        self.endDate = endDate
        self.calendarName = calendarName
        self.calendarColor = calendarColor
        self.videoLink = videoLink
    }

    /// Time until meeting starts
    var timeUntilStart: TimeInterval {
        startDate.timeIntervalSinceNow
    }

    /// Formatted start time (e.g., "2:30 PM")
    var formattedStartTime: String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: startDate)
    }

    /// Relative time description (e.g., "in 5 minutes", "starting now")
    var relativeTimeDescription: String {
        let minutes = Int(timeUntilStart / 60)
        if minutes <= 0 {
            return "starting now"
        } else if minutes == 1 {
            return "in 1 minute"
        } else if minutes < 60 {
            return "in \(minutes) minutes"
        } else {
            let hours = minutes / 60
            return hours == 1 ? "in 1 hour" : "in \(hours) hours"
        }
    }
}

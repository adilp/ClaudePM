import EventKit
import Foundation

enum VideoLinkType {
    case googleMeet
    case zoom

    var displayName: String {
        switch self {
        case .googleMeet: return "Meet"
        case .zoom: return "Zoom"
        }
    }

    var iconName: String {
        switch self {
        case .googleMeet: return "video.fill"
        case .zoom: return "video.fill"
        }
    }
}

struct VideoLink {
    let url: URL
    let type: VideoLinkType
}

struct LinkParser {
    // Google Meet: https://meet.google.com/abc-defg-hij
    private static let meetPattern = /https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/

    // Zoom: https://zoom.us/j/123456789 or https://company.zoom.us/j/123456789?pwd=xxx
    private static let zoomPattern = /https:\/\/[\w-]*\.?zoom\.us\/j\/\d+(\?pwd=[\w-]+)?/

    /// Extracts video conference link from calendar event
    /// Searches notes, location, and URL fields
    static func extractVideoLink(from event: EKEvent) -> VideoLink? {
        let searchText = [
            event.notes,
            event.location,
            event.url?.absoluteString
        ]
        .compactMap { $0 }
        .joined(separator: " ")

        // Try Google Meet first
        if let match = searchText.firstMatch(of: meetPattern) {
            if let url = URL(string: String(match.output)) {
                return VideoLink(url: url, type: .googleMeet)
            }
        }

        // Try Zoom (output is tuple due to capture group, .0 is full match)
        if let match = searchText.firstMatch(of: zoomPattern) {
            if let url = URL(string: String(match.output.0)) {
                return VideoLink(url: url, type: .zoom)
            }
        }

        return nil
    }
}

import SwiftUI

struct MeetingNotificationView: View {
    let meeting: MeetingEvent
    let isStarting: Bool  // T-0 vs T-5
    let onJoin: (() -> Void)?
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 16) {
            // Calendar icon with color from calendar
            ZStack {
                Circle()
                    .fill(isStarting ? .green : .orange)
                    .frame(width: 44, height: 44)

                Image(systemName: isStarting ? "video.fill" : "calendar")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(.white)
            }

            // Meeting info
            VStack(alignment: .leading, spacing: 4) {
                Text(meeting.title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    Text(isStarting ? "Starting now" : meeting.relativeTimeDescription)
                        .font(.system(size: 14))
                        .foregroundStyle(.secondary)

                    if let videoLink = meeting.videoLink {
                        Text("•")
                            .foregroundStyle(.secondary)
                        Text(videoLink.type.displayName)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(
                                Capsule()
                                    .fill(videoLink.type == .googleMeet ? .blue : .cyan)
                            )
                    }
                }
            }

            Spacer()

            // Action buttons
            HStack(spacing: 8) {
                // Join button (only for T-0 with video link)
                if isStarting, let onJoin = onJoin, meeting.hasVideoLink {
                    Button(action: onJoin) {
                        Text("Join")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(
                                Capsule()
                                    .fill(.green)
                            )
                    }
                    .buttonStyle(.plain)
                }

                // Dismiss button
                Button(action: onDismiss) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 24))
                        .foregroundStyle(.white.opacity(0.7))
                }
                .buttonStyle(.plain)
                .contentShape(Circle())
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .frame(minWidth: 360)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.black.opacity(0.85))
        )
    }
}

#Preview("T-5 Warning") {
    MeetingNotificationView(
        meeting: MeetingEvent.preview(hasVideoLink: true),
        isStarting: false,
        onJoin: nil,
        onDismiss: {}
    )
    .padding()
}

#Preview("T-0 Starting") {
    MeetingNotificationView(
        meeting: MeetingEvent.preview(hasVideoLink: true),
        isStarting: true,
        onJoin: { print("Join tapped") },
        onDismiss: {}
    )
    .padding()
}

#Preview("No Video Link") {
    MeetingNotificationView(
        meeting: MeetingEvent.preview(hasVideoLink: false),
        isStarting: false,
        onJoin: nil,
        onDismiss: {}
    )
    .padding()
}

// MARK: - Preview Helper
extension MeetingEvent {
    static func preview(hasVideoLink: Bool) -> MeetingEvent {
        MeetingEvent(
            id: "preview-1",
            title: "Team Standup",
            startDate: Date().addingTimeInterval(300),
            endDate: Date().addingTimeInterval(3600),
            calendarName: "Work",
            calendarColor: .blue,
            videoLink: hasVideoLink ? VideoLink(url: URL(string: "https://meet.google.com/abc-defg-hij")!, type: .googleMeet) : nil
        )
    }
}

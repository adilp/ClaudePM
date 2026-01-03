import SwiftUI

struct TestNotificationView: View {
    let icon: String
    let title: String
    let subtitle: String
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 16) {
            // Icon with colored background
            ZStack {
                Circle()
                    .fill(.blue)
                    .frame(width: 44, height: 44)

                Image(systemName: icon)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(.white)
            }

            // Title and subtitle
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.primary)

                Text(subtitle)
                    .font(.system(size: 14))
                    .foregroundStyle(.secondary)
            }

            Spacer()

            // Dismiss button
            Button(action: onDismiss) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 24))
                    .foregroundStyle(.white.opacity(0.7))
            }
            .buttonStyle(.plain)
            .contentShape(Circle())
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .frame(minWidth: 320)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.black.opacity(0.85))
        )
    }
}

#Preview {
    TestNotificationView(
        icon: "bell.fill",
        title: "Test Notification",
        subtitle: "NotchCenter is working!",
        onDismiss: {}
    )
    .padding()
}

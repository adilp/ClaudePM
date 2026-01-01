import SwiftUI

/// Banner showing the latest review result for a ticket
/// Green = Complete, Orange = Not Complete, Blue = Needs Clarification
struct ReviewResultBanner: View {
    let ticketId: String

    @State private var latestResult: ReviewResultEntry?
    @State private var isLoading = false

    var body: some View {
        Group {
            if isLoading {
                // Loading state
                HStack {
                    ProgressView()
                        .scaleEffect(0.8)
                    Text("Loading review status...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            } else if let result = latestResult {
                // Show the banner
                bannerContent(result)
            }
            // If no result, show nothing
        }
        .task {
            await loadLatestResult()
        }
    }

    @ViewBuilder
    private func bannerContent(_ result: ReviewResultEntry) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header row
            HStack(spacing: 8) {
                // Decision badge
                HStack(spacing: 4) {
                    Image(systemName: decisionIcon(result.decision))
                        .font(.caption)
                    Text(result.decision.displayName)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                }
                .foregroundStyle(.white)

                // Trigger badge
                HStack(spacing: 4) {
                    Image(systemName: result.trigger.iconName)
                        .font(.caption2)
                    Text(result.trigger.displayName)
                        .font(.caption)
                }
                .foregroundStyle(.white.opacity(0.8))

                Spacer()

                // Timestamp
                Text(result.createdAt.formatted(.relative(presentation: .named)))
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.7))
            }

            // Reasoning text
            Text(result.reasoning)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.9))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(backgroundColor(for: result.decision))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Helpers

    private func decisionIcon(_ decision: ReviewResultEntry.ReviewDecision) -> String {
        switch decision {
        case .complete: return "checkmark.circle.fill"
        case .notComplete: return "xmark.circle.fill"
        case .needsClarification: return "questionmark.circle.fill"
        }
    }

    private func backgroundColor(for decision: ReviewResultEntry.ReviewDecision) -> Color {
        switch decision {
        case .complete: return .green
        case .notComplete: return .orange
        case .needsClarification: return .blue
        }
    }

    // MARK: - Data Loading

    private func loadLatestResult() async {
        isLoading = true

        do {
            let results = try await APIClient.shared.getReviewHistory(ticketId: ticketId)
            latestResult = results.first  // Results are sorted by createdAt desc
        } catch {
            // Silently fail - banner just won't show
            print("Failed to load review result: \(error)")
        }

        isLoading = false
    }
}

#Preview {
    VStack {
        ReviewResultBanner(ticketId: "test-ticket-id")
    }
    .padding()
}

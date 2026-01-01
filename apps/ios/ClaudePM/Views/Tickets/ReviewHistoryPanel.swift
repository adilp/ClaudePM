import SwiftUI

/// Panel displaying review history for a ticket
struct ReviewHistoryPanel: View {
    let ticketId: String

    @State private var results: [ReviewResultEntry] = []
    @State private var isLoading = false
    @State private var error: String?
    @State private var isExpanded = true

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack {
                    Image(systemName: "clock.arrow.circlepath")
                        .foregroundStyle(.purple)
                    Text("Review History")
                        .font(.headline)

                    if !results.isEmpty {
                        Text("(\(results.count) reviews)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Button {
                        Task {
                            await loadHistory()
                        }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .font(.caption)
                    }
                    .disabled(isLoading)

                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)

            if isExpanded {
                if isLoading {
                    HStack {
                        Spacer()
                        ProgressView()
                            .padding()
                        Spacer()
                    }
                } else if let error = error {
                    errorView(message: error)
                } else if results.isEmpty {
                    Text("No reviews yet")
                        .foregroundStyle(.secondary)
                        .font(.subheadline)
                        .padding(.vertical, 8)
                } else {
                    VStack(spacing: 8) {
                        ForEach(Array(results.enumerated()), id: \.element.id) { index, result in
                            reviewResultRow(result, isLatest: index == 0)
                        }
                    }
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .task {
            await loadHistory()
        }
    }

    // MARK: - Content Views

    private func reviewResultRow(_ result: ReviewResultEntry, isLatest: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header row
            HStack(spacing: 8) {
                // Decision badge
                decisionBadge(result.decision)

                if isLatest {
                    Text("Latest")
                        .font(.caption2)
                        .fontWeight(.medium)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.blue.opacity(0.2))
                        .foregroundStyle(.blue)
                        .clipShape(Capsule())
                }

                Spacer()

                // Trigger
                HStack(spacing: 4) {
                    Image(systemName: result.trigger.iconName)
                        .font(.caption2)
                    Text(result.trigger.displayName)
                        .font(.caption2)
                }
                .foregroundStyle(.secondary)
            }

            // Reasoning
            Text(result.reasoning)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            // Timestamp
            Text(result.createdAt.formatted(.relative(presentation: .named)))
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(10)
        .background(Color(.tertiarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func decisionBadge(_ decision: ReviewResultEntry.ReviewDecision) -> some View {
        HStack(spacing: 4) {
            Image(systemName: decisionIcon(decision))
                .font(.caption2)
            Text(decision.displayName)
                .font(.caption)
                .fontWeight(.medium)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(decisionColor(decision).opacity(0.2))
        .foregroundStyle(decisionColor(decision))
        .clipShape(Capsule())
    }

    private func errorView(message: String) -> some View {
        HStack {
            Image(systemName: "exclamationmark.triangle")
                .foregroundStyle(.orange)
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            Button("Retry") {
                Task {
                    await loadHistory()
                }
            }
            .font(.caption)
        }
    }

    // MARK: - Helpers

    private func decisionIcon(_ decision: ReviewResultEntry.ReviewDecision) -> String {
        switch decision {
        case .complete: return "checkmark.circle.fill"
        case .notComplete: return "xmark.circle.fill"
        case .needsClarification: return "questionmark.circle.fill"
        }
    }

    private func decisionColor(_ decision: ReviewResultEntry.ReviewDecision) -> Color {
        switch decision {
        case .complete: return .green
        case .notComplete: return .orange
        case .needsClarification: return .blue
        }
    }

    // MARK: - Data Loading

    private func loadHistory() async {
        isLoading = true
        error = nil

        do {
            results = try await APIClient.shared.getReviewHistory(ticketId: ticketId)
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }
}

#Preview {
    ReviewHistoryPanel(ticketId: "test-ticket-id")
        .padding()
}

import SwiftUI

/// Card displaying AI-generated session summary
struct SessionSummaryCard: View {
    let sessionId: String
    let onRefresh: (() async -> Void)?

    @State private var summary: SessionSummary?
    @State private var isLoading = false
    @State private var error: String?
    @State private var isRefreshing = false

    init(sessionId: String, onRefresh: (() async -> Void)? = nil) {
        self.sessionId = sessionId
        self.onRefresh = onRefresh
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Label("Session Summary", systemImage: "sparkles")
                    .font(.headline)

                Spacer()

                if let summary = summary {
                    statusBadge(for: summary.status)
                }

                Button {
                    Task {
                        await regenerateSummary()
                    }
                } label: {
                    if isRefreshing {
                        ProgressView()
                            .scaleEffect(0.8)
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                .disabled(isRefreshing || isLoading)
            }

            if isLoading {
                HStack {
                    Spacer()
                    ProgressView()
                        .padding()
                    Spacer()
                }
            } else if let error = error {
                errorView(message: error)
            } else if let summary = summary {
                summaryContent(summary)
            } else {
                Text("No summary available")
                    .foregroundStyle(.secondary)
                    .font(.subheadline)
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .task {
            await loadSummary()
        }
    }

    // MARK: - Content Views

    @ViewBuilder
    private func summaryContent(_ summary: SessionSummary) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            // Headline
            Text(summary.headline)
                .font(.subheadline)
                .fontWeight(.medium)

            // Description
            Text(summary.description)
                .font(.caption)
                .foregroundStyle(.secondary)

            // Actions (first 5)
            if !summary.actions.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Actions")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(.secondary)

                    ForEach(summary.actions.prefix(5)) { action in
                        actionRow(action)
                    }

                    if summary.actions.count > 5 {
                        Text("+\(summary.actions.count - 5) more")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            // Files Changed (first 5)
            if !summary.filesChanged.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Files Changed")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(.secondary)

                    ForEach(summary.filesChanged.prefix(5)) { file in
                        fileChangeRow(file)
                    }

                    if summary.filesChanged.count > 5 {
                        Text("+\(summary.filesChanged.count - 5) more")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            // Analyzed timestamp
            if let analyzedDate = ISO8601DateFormatter().date(from: summary.analyzedAt) {
                Text("Analyzed \(analyzedDate.formatted(.relative(presentation: .named)))")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
    }

    private func actionRow(_ action: SessionAction) -> some View {
        HStack(spacing: 6) {
            Image(systemName: action.type.iconName)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(width: 16)

            Text(action.description)
                .font(.caption)
                .lineLimit(1)

            Spacer()
        }
    }

    private func fileChangeRow(_ file: FileChange) -> some View {
        HStack(spacing: 6) {
            Circle()
                .fill(colorForChangeType(file.changeType))
                .frame(width: 6, height: 6)

            Text(file.path.components(separatedBy: "/").last ?? file.path)
                .font(.caption)
                .fontDesign(.monospaced)
                .lineLimit(1)

            Spacer()

            Text(file.changeType.displayName)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private func statusBadge(for status: SessionSummary.SummaryStatus) -> some View {
        Text(status.displayName)
            .font(.caption2)
            .fontWeight(.medium)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(colorForStatus(status).opacity(0.2))
            .foregroundStyle(colorForStatus(status))
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
                    await loadSummary()
                }
            }
            .font(.caption)
        }
    }

    // MARK: - Helpers

    private func colorForStatus(_ status: SessionSummary.SummaryStatus) -> Color {
        switch status {
        case .completed: return .green
        case .inProgress: return .blue
        case .blocked: return .orange
        case .failed: return .red
        }
    }

    private func colorForChangeType(_ type: FileChange.ChangeType) -> Color {
        switch type {
        case .created, .added: return .green
        case .modified: return .blue
        case .deleted: return .red
        case .renamed: return .yellow
        }
    }

    // MARK: - Data Loading

    private func loadSummary() async {
        isLoading = true
        error = nil

        do {
            summary = try await APIClient.shared.getSessionSummary(sessionId: sessionId)
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    private func regenerateSummary() async {
        isRefreshing = true

        do {
            summary = try await APIClient.shared.getSessionSummary(sessionId: sessionId, regenerate: true)
            await onRefresh?()
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
        }

        isRefreshing = false
    }
}

#Preview {
    SessionSummaryCard(sessionId: "test-session-id")
        .padding()
}

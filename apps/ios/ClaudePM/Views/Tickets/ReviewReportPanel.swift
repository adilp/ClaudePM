import SwiftUI

/// Panel displaying AI-generated review report for a ticket session
struct ReviewReportPanel: View {
    let sessionId: String
    var projectId: String?

    @State private var report: ReviewReport?
    @State private var isLoading = false
    @State private var error: String?
    @State private var expandedSections: Set<String> = ["accomplished", "concerns", "nextSteps"]
    @State private var showFileStager = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Label("Review Report", systemImage: "checkmark.seal")
                    .font(.headline)

                Spacer()

                if let report = report {
                    completionBadge(for: report)
                }
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
            } else if let report = report {
                reportContent(report)
            } else {
                Text("No review report available")
                    .foregroundStyle(.secondary)
                    .font(.subheadline)
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .task {
            await loadReport()
        }
    }

    // MARK: - Content Views

    @ViewBuilder
    private func reportContent(_ report: ReviewReport) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            // Confidence indicator
            confidenceIndicator(report.confidence)

            // Accomplished section
            if !report.accomplished.isEmpty {
                collapsibleSection(
                    title: "Accomplished",
                    icon: "checkmark.circle.fill",
                    color: .green,
                    items: report.accomplished,
                    sectionId: "accomplished"
                )
            }

            // Remaining section
            if !report.remaining.isEmpty {
                collapsibleSection(
                    title: "Remaining",
                    icon: "circle",
                    color: .orange,
                    items: report.remaining,
                    sectionId: "remaining"
                )
            }

            // Concerns section
            if !report.concerns.isEmpty {
                collapsibleSection(
                    title: "Concerns",
                    icon: "exclamationmark.triangle.fill",
                    color: .red,
                    items: report.concerns,
                    sectionId: "concerns"
                )
            }

            // Next Steps section
            if !report.nextSteps.isEmpty {
                collapsibleSection(
                    title: "Next Steps",
                    icon: "arrow.right.circle.fill",
                    color: .blue,
                    items: report.nextSteps,
                    sectionId: "nextSteps"
                )
            }

            // Commit message (if available)
            if let commitMessage = report.suggestedCommitMessage, !commitMessage.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Suggested Commit")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundStyle(.secondary)

                        Spacer()

                        Button {
                            UIPasteboard.general.string = commitMessage
                        } label: {
                            Image(systemName: "doc.on.doc")
                                .font(.caption)
                        }
                    }

                    Text(commitMessage)
                        .font(.caption)
                        .fontDesign(.monospaced)
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(.tertiarySystemBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
            }

            // Generated timestamp
            if let generatedAt = report.generatedAt {
                Text("Generated \(generatedAt.formatted(.relative(presentation: .named)))")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            // Stage & Commit button
            if let projectId = projectId {
                Button {
                    showFileStager = true
                } label: {
                    Label("Stage & Commit", systemImage: "arrow.triangle.branch")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
                .sheet(isPresented: $showFileStager) {
                    FileStagerView(
                        projectId: projectId,
                        initialCommitMessage: report.suggestedCommitMessage
                    )
                }
            }
        }
    }

    private func confidenceIndicator(_ confidence: Int) -> some View {
        HStack(spacing: 8) {
            Text("Confidence")
                .font(.caption)
                .foregroundStyle(.secondary)

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.tertiarySystemFill))
                        .frame(height: 8)

                    RoundedRectangle(cornerRadius: 4)
                        .fill(confidenceColor(confidence))
                        .frame(width: geometry.size.width * CGFloat(confidence) / 100, height: 8)
                }
            }
            .frame(height: 8)

            Text("\(confidence)%")
                .font(.caption)
                .fontWeight(.medium)
                .foregroundStyle(confidenceColor(confidence))
        }
    }

    private func collapsibleSection(
        title: String,
        icon: String,
        color: Color,
        items: [String],
        sectionId: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    if expandedSections.contains(sectionId) {
                        expandedSections.remove(sectionId)
                    } else {
                        expandedSections.insert(sectionId)
                    }
                }
            } label: {
                HStack {
                    Image(systemName: icon)
                        .foregroundStyle(color)
                        .font(.caption)

                    Text(title)
                        .font(.caption)
                        .fontWeight(.semibold)

                    Text("(\(items.count))")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    Spacer()

                    Image(systemName: expandedSections.contains(sectionId) ? "chevron.up" : "chevron.down")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)

            if expandedSections.contains(sectionId) {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(items, id: \.self) { item in
                        HStack(alignment: .top, spacing: 6) {
                            Text("•")
                                .foregroundStyle(.secondary)
                            Text(item)
                                .font(.caption)
                        }
                    }
                }
                .padding(.leading, 20)
            }
        }
    }

    private func completionBadge(for report: ReviewReport) -> some View {
        Text(report.completionStatus.displayName)
            .font(.caption2)
            .fontWeight(.medium)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(completionColor(report.completionStatus).opacity(0.2))
            .foregroundStyle(completionColor(report.completionStatus))
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
                    await loadReport()
                }
            }
            .font(.caption)
        }
    }

    // MARK: - Helpers

    private func confidenceColor(_ confidence: Int) -> Color {
        if confidence >= 80 {
            return .green
        } else if confidence >= 50 {
            return .yellow
        } else {
            return .red
        }
    }

    private func completionColor(_ status: ReviewReport.CompletionStatus) -> Color {
        switch status {
        case .complete: return .green
        case .partial: return .yellow
        case .blocked: return .red
        case .unclear: return .gray
        }
    }

    // MARK: - Data Loading

    private func loadReport() async {
        isLoading = true
        error = nil

        do {
            report = try await APIClient.shared.getSessionReviewReport(sessionId: sessionId)
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }
}

#Preview {
    ReviewReportPanel(sessionId: "test-session-id", projectId: "test-project-id")
        .padding()
}

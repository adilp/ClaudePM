import SwiftUI

/// Mobile-friendly git diff viewer
struct DiffViewer: View {
    let projectId: String

    @State private var diff: GitDiffResult?
    @State private var isLoading = false
    @State private var error: String?
    @State private var expandedFiles: Set<String> = []

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading diff...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error = error {
                    errorView(message: error)
                } else if let diff = diff {
                    if diff.files.isEmpty {
                        emptyView
                    } else {
                        diffContent(diff)
                    }
                } else {
                    emptyView
                }
            }
            .navigationTitle("Code Changes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .task {
            await loadDiff()
        }
    }

    // MARK: - Content Views

    private var emptyView: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.circle")
                .font(.largeTitle)
                .foregroundStyle(.green)
            Text("No Changes")
                .font(.headline)
            Text("There are no uncommitted changes")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorView(message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundStyle(.orange)
            Text("Error Loading Diff")
                .font(.headline)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Retry") {
                Task {
                    await loadDiff()
                }
            }
            .buttonStyle(.bordered)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func diffContent(_ diff: GitDiffResult) -> some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                // Summary header
                summaryHeader(diff)

                // File list
                ForEach(diff.files) { file in
                    fileSection(file)
                }

                // Truncation warning
                if diff.truncated {
                    HStack {
                        Image(systemName: "exclamationmark.circle")
                            .foregroundStyle(.orange)
                        Text("Diff truncated. Total lines: \(diff.totalLines)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
            .padding()
        }
    }

    private func summaryHeader(_ diff: GitDiffResult) -> some View {
        HStack(spacing: 16) {
            statBadge(
                count: diff.files.filter { $0.changeType == .added }.count,
                label: "Added",
                color: .green
            )
            statBadge(
                count: diff.files.filter { $0.changeType == .modified }.count,
                label: "Modified",
                color: .blue
            )
            statBadge(
                count: diff.files.filter { $0.changeType == .deleted }.count,
                label: "Deleted",
                color: .red
            )
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func statBadge(count: Int, label: String, color: Color) -> some View {
        VStack(spacing: 4) {
            Text("\(count)")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundStyle(count > 0 ? color : .secondary)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private func fileSection(_ file: DiffFile) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // File header
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    if expandedFiles.contains(file.id) {
                        expandedFiles.remove(file.id)
                    } else {
                        expandedFiles.insert(file.id)
                    }
                }
            } label: {
                HStack(spacing: 8) {
                    // Change type indicator
                    changeTypeIcon(file.changeType)

                    // File path
                    VStack(alignment: .leading, spacing: 2) {
                        Text(file.filePath.components(separatedBy: "/").last ?? file.filePath)
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .fontDesign(.monospaced)
                            .lineLimit(1)

                        if file.filePath.contains("/") {
                            Text(file.filePath.components(separatedBy: "/").dropLast().joined(separator: "/"))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }

                    Spacer()

                    // Expand indicator
                    Image(systemName: expandedFiles.contains(file.id) ? "chevron.up" : "chevron.down")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(12)
                .background(Color(.secondarySystemGroupedBackground))
            }
            .buttonStyle(.plain)

            // File content (if expanded)
            if expandedFiles.contains(file.id) {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(file.hunks) { hunk in
                        hunkView(hunk)
                    }
                }
                .background(Color(.systemBackground))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(.separator), lineWidth: 0.5)
        )
    }

    private func changeTypeIcon(_ type: FileChange.ChangeType) -> some View {
        Group {
            switch type {
            case .created, .added:
                Image(systemName: "plus.circle.fill")
                    .foregroundStyle(.green)
            case .modified:
                Image(systemName: "pencil.circle.fill")
                    .foregroundStyle(.blue)
            case .deleted:
                Image(systemName: "minus.circle.fill")
                    .foregroundStyle(.red)
            case .renamed:
                Image(systemName: "arrow.right.circle.fill")
                    .foregroundStyle(.yellow)
            }
        }
        .font(.title3)
    }

    private func hunkView(_ hunk: DiffHunk) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Hunk header
            Text("@@ -\(hunk.oldStart),\(hunk.oldCount) +\(hunk.newStart),\(hunk.newCount) @@")
                .font(.caption)
                .fontDesign(.monospaced)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(.tertiarySystemBackground))

            // Diff lines
            ScrollView(.horizontal, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(hunk.content.components(separatedBy: "\n").enumerated()), id: \.offset) { _, line in
                        diffLine(line)
                    }
                }
            }
        }
    }

    private func diffLine(_ line: String) -> some View {
        let backgroundColor: Color
        let textColor: Color

        if line.hasPrefix("+") && !line.hasPrefix("+++") {
            backgroundColor = Color.green.opacity(0.15)
            textColor = .green
        } else if line.hasPrefix("-") && !line.hasPrefix("---") {
            backgroundColor = Color.red.opacity(0.15)
            textColor = .red
        } else {
            backgroundColor = .clear
            textColor = .primary
        }

        return Text(line)
            .font(.system(size: 11, design: .monospaced))
            .foregroundStyle(textColor)
            .padding(.horizontal, 8)
            .padding(.vertical, 1)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(backgroundColor)
    }

    // MARK: - Data Loading

    private func loadDiff() async {
        isLoading = true
        error = nil

        do {
            diff = try await APIClient.shared.getGitDiff(projectId: projectId)
            // Auto-expand first file if only one file
            if let files = diff?.files, files.count == 1 {
                expandedFiles.insert(files[0].id)
            }
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }
}

#Preview {
    DiffViewer(projectId: "test-project-id")
}

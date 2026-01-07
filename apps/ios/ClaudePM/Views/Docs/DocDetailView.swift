import SwiftUI

/// Detail view for displaying markdown document content
struct DocDetailView: View {
    let project: Project
    let node: DocTreeNode

    @State private var content: String?
    @State private var isLoading = false
    @State private var error: String?

    var body: some View {
        ZStack {
            if isLoading && content == nil {
                loadingView
            } else if let error = error, content == nil {
                errorView(error)
            } else if let content = content {
                contentView(content)
            }
        }
        .navigationTitle(displayTitle)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadContent()
        }
    }

    // MARK: - Content View

    private func contentView(_ content: String) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // Document header
                VStack(alignment: .leading, spacing: 4) {
                    Text(displayTitle)
                        .font(.title)
                        .fontWeight(.bold)

                    Text(node.path)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal)
                .padding(.top)
                .padding(.bottom, 8)

                Divider()
                    .padding(.horizontal)

                // Markdown content
                SimpleMarkdownView(content: content, projectId: project.id)
                    .padding()
            }
        }
        .background(Color(.systemBackground))
    }

    // MARK: - State Views

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)
            Text("Loading document...")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private func errorView(_ error: String) -> some View {
        ContentUnavailableView {
            Label("Error", systemImage: "exclamationmark.triangle")
        } description: {
            Text(error)
        } actions: {
            Button("Try Again") {
                Task {
                    await loadContent()
                }
            }
            .buttonStyle(.borderedProminent)
        }
    }

    // MARK: - Helpers

    /// Display title without .md extension
    private var displayTitle: String {
        if node.name.hasSuffix(".md") {
            return String(node.name.dropLast(3))
        }
        return node.name
    }

    // MARK: - Data Loading

    private func loadContent() async {
        isLoading = true
        error = nil

        do {
            let response = try await APIClient.shared.getDocContent(
                projectId: project.id,
                path: node.path
            )

            await MainActor.run {
                content = response.content
                isLoading = false
            }
        } catch {
            await MainActor.run {
                self.error = error.localizedDescription
                isLoading = false
            }
        }
    }
}

#Preview {
    NavigationStack {
        DocDetailView(
            project: Project(
                id: "test",
                name: "Test Project",
                repoPath: "/path/to/project",
                ticketsPath: nil,
                handoffPath: nil,
                tmuxSession: "test",
                tmuxWindow: nil,
                createdAt: Date(),
                updatedAt: Date()
            ),
            node: DocTreeNode(
                name: "api-reference.md",
                type: .file,
                path: "api-reference.md",
                children: nil
            )
        )
    }
}

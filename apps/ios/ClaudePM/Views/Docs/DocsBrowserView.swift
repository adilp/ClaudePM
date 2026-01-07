import SwiftUI

/// Browsing view for documentation folders and files
struct DocsBrowserView: View {
    let project: Project
    let path: String?
    let title: String

    @State private var nodes: [DocTreeNode] = []
    @State private var isLoading = false
    @State private var error: String?

    var body: some View {
        ZStack {
            if isLoading && nodes.isEmpty {
                loadingView
            } else if let error = error, nodes.isEmpty {
                errorView(error)
            } else if nodes.isEmpty {
                emptyStateView
            } else {
                nodeList
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            await loadNodes()
        }
        .task {
            await loadNodes()
        }
    }

    // MARK: - Node List

    private var nodeList: some View {
        List {
            // Directories first, then files
            let sortedNodes = nodes.sorted { lhs, rhs in
                if lhs.isDirectory != rhs.isDirectory {
                    return lhs.isDirectory
                }
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }

            ForEach(sortedNodes) { node in
                if node.isDirectory {
                    NavigationLink(value: node) {
                        DirectoryRowView(node: node)
                    }
                } else if node.isMarkdown {
                    NavigationLink {
                        DocDetailView(project: project, node: node)
                    } label: {
                        FileRowView(node: node)
                    }
                } else {
                    // Non-markdown files (not navigable)
                    FileRowView(node: node)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationDestination(for: DocTreeNode.self) { node in
            DocsBrowserView(
                project: project,
                path: node.path,
                title: node.name
            )
        }
    }

    // MARK: - State Views

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)
            Text("Loading...")
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
                    await loadNodes()
                }
            }
            .buttonStyle(.borderedProminent)
        }
    }

    private var emptyStateView: some View {
        ContentUnavailableView {
            Label("No Documents", systemImage: "doc.text")
        } description: {
            Text("This folder is empty or has no documentation files.")
        }
    }

    // MARK: - Data Loading

    private func loadNodes() async {
        isLoading = true
        error = nil

        do {
            let tree = try await APIClient.shared.getDocsTree(projectId: project.id)

            // If we have a path, navigate to that subfolder
            let nodesToShow: [DocTreeNode]
            if let path = path {
                nodesToShow = findChildNodes(in: tree, at: path)
            } else {
                nodesToShow = tree
            }

            await MainActor.run {
                nodes = nodesToShow
                isLoading = false
            }
        } catch {
            await MainActor.run {
                self.error = error.localizedDescription
                isLoading = false
            }
        }
    }

    /// Recursively find child nodes at the given path
    private func findChildNodes(in tree: [DocTreeNode], at path: String) -> [DocTreeNode] {
        for node in tree {
            if node.path == path {
                return node.children ?? []
            }
            if let children = node.children {
                let result = findChildNodes(in: children, at: path)
                if !result.isEmpty {
                    return result
                }
            }
        }
        return []
    }
}

// MARK: - Row Views

/// Row view for directory nodes
struct DirectoryRowView: View {
    let node: DocTreeNode

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "folder.fill")
                .foregroundStyle(.blue)
                .font(.title3)

            Text(node.name)
                .font(.body)

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }
}

/// Row view for file nodes
struct FileRowView: View {
    let node: DocTreeNode

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: node.isMarkdown ? "doc.text.fill" : "doc.fill")
                .foregroundStyle(node.isMarkdown ? .orange : .gray)
                .font(.title3)

            VStack(alignment: .leading, spacing: 2) {
                Text(displayName)
                    .font(.body)

                if node.isMarkdown {
                    Text("Markdown")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()
        }
        .padding(.vertical, 4)
    }

    /// Display name without .md extension for markdown files
    private var displayName: String {
        if node.isMarkdown && node.name.hasSuffix(".md") {
            return String(node.name.dropLast(3))
        }
        return node.name
    }
}

#Preview {
    NavigationStack {
        DocsBrowserView(
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
            path: nil,
            title: "docs"
        )
    }
}

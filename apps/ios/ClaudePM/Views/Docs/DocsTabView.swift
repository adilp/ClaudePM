import SwiftUI

/// Root view for the Docs tab - shows project list for documentation browsing
struct DocsTabView: View {
    @State private var projects: [Project] = []
    @State private var isLoading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ZStack {
                if isLoading && projects.isEmpty {
                    loadingView
                } else if let error = error, projects.isEmpty {
                    errorView(error)
                } else if projects.isEmpty {
                    emptyStateView
                } else {
                    projectList
                }
            }
            .navigationTitle("Documentation")
            .refreshable {
                await loadProjects()
            }
        }
        .task {
            await loadProjects()
        }
    }

    // MARK: - Project List

    private var projectList: some View {
        List {
            ForEach(projects) { project in
                NavigationLink(value: project) {
                    HStack(spacing: 12) {
                        Image(systemName: "folder.fill")
                            .foregroundStyle(.blue)
                            .font(.title3)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(project.name)
                                .font(.body)
                                .fontWeight(.medium)

                            Text(project.repoPath)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }

                        Spacer()

                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationDestination(for: Project.self) { project in
            DocsBrowserView(project: project, path: nil, title: "docs")
        }
    }

    // MARK: - State Views

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)
            Text("Loading projects...")
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
                    await loadProjects()
                }
            }
            .buttonStyle(.borderedProminent)
        }
    }

    private var emptyStateView: some View {
        ContentUnavailableView {
            Label("No Projects", systemImage: "folder")
        } description: {
            Text("No projects found. Create a project from the server to browse documentation.")
        } actions: {
            Button("Refresh") {
                Task {
                    await loadProjects()
                }
            }
        }
    }

    // MARK: - Data Loading

    private func loadProjects() async {
        isLoading = true
        error = nil

        do {
            let loadedProjects = try await APIClient.shared.getProjects()
            await MainActor.run {
                projects = loadedProjects
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
    DocsTabView()
}

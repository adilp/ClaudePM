import SwiftUI

/// Sheet for staging files and committing changes
/// Touch-optimized with tap to toggle staging, styled like lazygit
/// Uses unified tree view with color-coded staging (green=staged, red/yellow=unstaged)
struct FileStagerView: View {
    let projectId: String
    let initialCommitMessage: String?
    @Environment(\.dismiss) private var dismiss

    @State private var status: GitStatus?
    @State private var branchInfo: BranchInfo?
    @State private var isLoading = false
    @State private var error: String?
    @State private var commitMessage = ""
    @State private var expandedDirs: Set<String> = []
    @State private var isCommitting = false
    @State private var isPushing = false
    @State private var showPushConfirmation = false
    @State private var lastCommitHash: String?
    @State private var toastMessage: String?

    var body: some View {
        NavigationStack {
            ZStack {
                content
                    .navigationTitle("Stage & Commit")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") {
                                dismiss()
                            }
                        }
                    }

                // Toast overlay
                if let toast = toastMessage {
                    VStack {
                        Spacer()
                        Text(toast)
                            .font(.footnote)
                            .fontWeight(.medium)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(.green, in: Capsule())
                            .padding(.bottom, 100)
                    }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .animation(.spring(), value: toastMessage)
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(.regularMaterial)
        .task {
            commitMessage = initialCommitMessage ?? ""
            await loadData()
        }
        .alert("Push to Remote?", isPresented: $showPushConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Push") {
                Task { await push() }
            }
        } message: {
            Text("Push changes to \(branchInfo?.remote ?? "origin")?")
        }
    }

    @ViewBuilder
    private var content: some View {
        if isLoading && status == nil {
            ProgressView("Loading...")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let error = error {
            ContentUnavailableView {
                Label("Error", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error)
            } actions: {
                Button("Retry") {
                    Task { await loadData() }
                }
            }
        } else {
            fileList
        }
    }

    private var fileList: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Branch info
                    if let branch = branchInfo {
                        branchHeader(branch)
                    }

                    // Unified file tree section
                    unifiedFileSection
                }
                .padding()
            }

            Divider()

            // Commit area
            commitSection
        }
    }

    private func branchHeader(_ branch: BranchInfo) -> some View {
        HStack {
            Image(systemName: "arrow.triangle.branch")
                .foregroundStyle(.secondary)
            Text(branch.name)
                .fontWeight(.medium)
                .font(.system(.caption, design: .monospaced))
            if let remote = branch.remote {
                Text("→ \(remote)")
                    .foregroundStyle(.secondary)
                    .font(.system(.caption, design: .monospaced))
            }
            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Unified File Section

    private var unifiedFileSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header with counts and actions
            HStack {
                HStack(spacing: 12) {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(.yellow)
                            .frame(width: 8, height: 8)
                        Text("Unstaged (\(unstagedCount))")
                            .font(.caption)
                            .foregroundStyle(.yellow)
                    }

                    HStack(spacing: 4) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                            .font(.caption2)
                        Text("Staged (\(stagedCount))")
                            .font(.caption)
                            .foregroundStyle(.green)
                    }
                }

                Spacer()

                HStack(spacing: 8) {
                    Button {
                        Task { await stageAll() }
                    } label: {
                        Text("+ All")
                            .font(.caption)
                    }
                    .disabled(unstagedCount == 0)

                    Button {
                        Task { await unstageAll() }
                    } label: {
                        Text("− All")
                            .font(.caption)
                    }
                    .disabled(stagedCount == 0)
                }
            }

            // Unified file tree
            if let status = status {
                let tree = buildUnifiedTree(
                    staged: status.staged,
                    unstaged: status.unstaged,
                    untracked: status.untracked
                )
                if tree.isEmpty {
                    Text("No changes")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 8)
                        .padding(.leading, 8)
                } else {
                    VStack(spacing: 0) {
                        ForEach(flattenTree(tree, depth: 0)) { item in
                            UnifiedFileRowView(
                                item: item,
                                dirStagingState: item.node.type == .directory ? getDirStagingState(item.node) : nil,
                                expandedDirs: $expandedDirs,
                                onToggleStage: { path, shouldStage in
                                    Task {
                                        if shouldStage {
                                            await stageFile(path)
                                        } else {
                                            await unstageFile(path)
                                        }
                                    }
                                },
                                onToggleExpand: toggleExpand
                            )
                        }
                    }
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
        }
    }

    // MARK: - Commit Section

    private var commitSection: some View {
        VStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Commit Message")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                TextField("Enter commit message...", text: $commitMessage, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(3...6)
                    .font(.system(.footnote, design: .monospaced))
            }

            HStack(spacing: 12) {
                Button {
                    Task { await commit() }
                } label: {
                    HStack {
                        if isCommitting {
                            ProgressView()
                                .controlSize(.small)
                        } else {
                            Image(systemName: "checkmark.circle")
                        }
                        Text("Commit")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!canCommit || isCommitting)

                if canPush {
                    Button {
                        showPushConfirmation = true
                    } label: {
                        HStack {
                            if isPushing {
                                ProgressView()
                                    .controlSize(.small)
                            } else {
                                Image(systemName: "arrow.up.circle")
                            }
                            Text("Push")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                    .disabled(isPushing)
                }
            }
        }
        .padding()
        .background(Color(.systemGroupedBackground))
    }

    private var unstagedCount: Int {
        (status?.unstaged.count ?? 0) + (status?.untracked.count ?? 0)
    }

    private var stagedCount: Int {
        status?.staged.count ?? 0
    }

    private var canCommit: Bool {
        stagedCount > 0 && !commitMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var canPush: Bool {
        lastCommitHash != nil || (branchInfo?.remote != nil && !(status?.clean ?? true))
    }

    // MARK: - Unified Tree Building

    /// Unified file node that tracks both staged and unstaged status
    struct FileTreeNode: Identifiable {
        let id = UUID()
        let name: String
        let path: String
        let type: NodeType
        let stagedStatus: String?   // Status in staging area (green)
        let unstagedStatus: String? // Status in working tree (red/yellow)
        var children: [FileTreeNode]

        enum NodeType {
            case file
            case directory
        }
    }

    struct FlatFileItem: Identifiable {
        let id = UUID()
        let node: FileTreeNode
        let depth: Int
    }

    private func buildUnifiedTree(
        staged: [StatusFile],
        unstaged: [StatusFile],
        untracked: [String]
    ) -> [FileTreeNode] {
        // Use a class-based node for building (reference semantics)
        class BuildNode {
            let name: String
            let path: String
            let type: FileTreeNode.NodeType
            var stagedStatus: String?
            var unstagedStatus: String?
            var children: [String: BuildNode] = [:]

            init(name: String, path: String, type: FileTreeNode.NodeType) {
                self.name = name
                self.path = path
                self.type = type
            }
        }

        let root = BuildNode(name: "", path: "", type: .directory)

        func addPath(_ filePath: String, status: String, isStaged: Bool) {
            let parts = filePath.split(separator: "/").map(String.init)
            var current = root
            var currentPath = ""

            for (index, part) in parts.enumerated() {
                currentPath = currentPath.isEmpty ? part : "\(currentPath)/\(part)"
                let isFile = index == parts.count - 1

                if current.children[part] == nil {
                    current.children[part] = BuildNode(
                        name: part,
                        path: currentPath,
                        type: isFile ? .file : .directory
                    )
                }

                let node = current.children[part]!

                // Set status for files
                if isFile {
                    if isStaged {
                        node.stagedStatus = status
                    } else {
                        node.unstagedStatus = status
                    }
                }

                current = node
            }
        }

        // Add staged files
        for file in staged {
            addPath(file.path, status: file.status, isStaged: true)
        }
        // Add unstaged files
        for file in unstaged {
            addPath(file.path, status: file.status, isStaged: false)
        }
        // Add untracked files
        for path in untracked {
            addPath(path, status: "untracked", isStaged: false)
        }

        // Convert BuildNode tree to FileTreeNode array
        func convert(_ node: BuildNode) -> [FileTreeNode] {
            let sortedChildren = node.children.values.sorted { a, b in
                if a.type != b.type {
                    return a.type == .directory
                }
                return a.name < b.name
            }

            return sortedChildren.map { child in
                FileTreeNode(
                    name: child.name,
                    path: child.path,
                    type: child.type,
                    stagedStatus: child.stagedStatus,
                    unstagedStatus: child.unstagedStatus,
                    children: convert(child)
                )
            }
        }

        // Collapse empty intermediate directories
        func collapseEmptyDirs(_ nodes: [FileTreeNode]) -> [FileTreeNode] {
            return nodes.map { node in
                guard node.type == .directory else {
                    return node
                }

                var children = collapseEmptyDirs(node.children)
                var currentName = node.name
                var currentPath = node.path

                while children.count == 1 && children[0].type == .directory {
                    let onlyChild = children[0]
                    currentName = "\(currentName)/\(onlyChild.name)"
                    currentPath = onlyChild.path
                    children = onlyChild.children
                }

                return FileTreeNode(
                    name: currentName,
                    path: currentPath,
                    type: node.type,
                    stagedStatus: node.stagedStatus,
                    unstagedStatus: node.unstagedStatus,
                    children: children
                )
            }
        }

        return collapseEmptyDirs(convert(root))
    }

    private func flattenTree(_ nodes: [FileTreeNode], depth: Int) -> [FlatFileItem] {
        var result: [FlatFileItem] = []
        for node in nodes {
            result.append(FlatFileItem(node: node, depth: depth))
            if node.type == .directory && expandedDirs.contains(node.path) {
                result.append(contentsOf: flattenTree(node.children, depth: depth + 1))
            }
        }
        return result
    }

    private func toggleExpand(_ path: String) {
        if expandedDirs.contains(path) {
            expandedDirs.remove(path)
        } else {
            expandedDirs.insert(path)
        }
    }

    /// Collect all directory paths from tree (for auto-expanding)
    private func getAllDirPaths(from nodes: [FileTreeNode]) -> [String] {
        var paths: [String] = []
        for node in nodes {
            if node.type == .directory {
                paths.append(node.path)
                paths.append(contentsOf: getAllDirPaths(from: node.children))
            }
        }
        return paths
    }

    /// Get directory staging state: all staged, mixed, or none staged
    enum DirStagingState {
        case all    // All files staged (green)
        case mixed  // Some staged, some not (yellow)
        case none   // No files staged (grey)
    }

    private func getDirStagingState(_ node: FileTreeNode) -> DirStagingState {
        if node.type == .file {
            if node.stagedStatus != nil && node.unstagedStatus == nil {
                return .all
            }
            return .none
        }

        let childStates = node.children.map { getDirStagingState($0) }
        let hasAll = childStates.contains(.all)
        let hasNone = childStates.contains(.none)
        let hasMixed = childStates.contains(.mixed)

        if hasMixed || (hasAll && hasNone) {
            return .mixed
        }
        if hasAll && !hasNone {
            return .all
        }
        return .none
    }

    // MARK: - API Methods

    private func loadData() async {
        isLoading = true
        error = nil

        do {
            async let statusTask = APIClient.shared.getGitStatus(projectId: projectId)
            async let branchTask = APIClient.shared.getBranchInfo(projectId: projectId)

            status = try await statusTask
            branchInfo = try await branchTask

            // Auto-expand ALL directories
            if let status = status {
                let tree = buildUnifiedTree(
                    staged: status.staged,
                    unstaged: status.unstaged,
                    untracked: status.untracked
                )
                expandedDirs = Set(getAllDirPaths(from: tree))
            }
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Optimistic Update Helpers

    /// Optimistically stage files - update UI immediately, then sync with server
    private func stageFile(_ path: String) async {
        // Optimistic update: immediately move file to staged
        if var currentStatus = status {
            // Find file in unstaged
            if let index = currentStatus.unstaged.firstIndex(where: { $0.path == path }) {
                let file = currentStatus.unstaged.remove(at: index)
                currentStatus.staged.append(file)
                status = currentStatus
            }
            // Or find in untracked
            else if let index = currentStatus.untracked.firstIndex(of: path) {
                currentStatus.untracked.remove(at: index)
                currentStatus.staged.append(StatusFile(path: path, status: "added"))
                status = currentStatus
            }
        }

        // Call API in background
        do {
            try await APIClient.shared.stageFiles(projectId: projectId, files: [path])
            // Optionally sync with server (can skip for faster UX)
            await loadData()
        } catch {
            showToast("Failed to stage file")
            await loadData() // Revert on error
        }
    }

    /// Optimistically unstage files - update UI immediately, then sync with server
    private func unstageFile(_ path: String) async {
        // Optimistic update: immediately move file to unstaged
        if var currentStatus = status {
            if let index = currentStatus.staged.firstIndex(where: { $0.path == path }) {
                let file = currentStatus.staged.remove(at: index)
                currentStatus.unstaged.append(file)
                status = currentStatus
            }
        }

        // Call API in background
        do {
            try await APIClient.shared.unstageFiles(projectId: projectId, files: [path])
            await loadData()
        } catch {
            showToast("Failed to unstage file")
            await loadData() // Revert on error
        }
    }

    /// Optimistically stage all files
    private func stageAll() async {
        // Optimistic update: move all to staged
        if var currentStatus = status {
            // Move unstaged to staged
            currentStatus.staged.append(contentsOf: currentStatus.unstaged)
            // Move untracked to staged as "added"
            currentStatus.staged.append(contentsOf: currentStatus.untracked.map {
                StatusFile(path: $0, status: "added")
            })
            currentStatus.unstaged = []
            currentStatus.untracked = []
            status = currentStatus
        }

        do {
            try await APIClient.shared.stageAllFiles(projectId: projectId)
            await loadData()
        } catch {
            showToast("Failed to stage all files")
            await loadData()
        }
    }

    /// Optimistically unstage all files
    private func unstageAll() async {
        // Optimistic update: move all staged to unstaged
        if var currentStatus = status {
            currentStatus.unstaged.append(contentsOf: currentStatus.staged)
            currentStatus.staged = []
            status = currentStatus
        }

        do {
            try await APIClient.shared.unstageAllFiles(projectId: projectId)
            await loadData()
        } catch {
            showToast("Failed to unstage all files")
            await loadData()
        }
    }

    private func commit() async {
        isCommitting = true

        do {
            let result = try await APIClient.shared.commitChanges(
                projectId: projectId,
                message: commitMessage.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            lastCommitHash = result.hash
            commitMessage = ""
            showToast("Committed: \(result.hash)")
            await loadData()
        } catch let apiError as APIError {
            showToast(apiError.errorDescription ?? "Commit failed")
        } catch {
            showToast("Commit failed")
        }

        isCommitting = false
    }

    private func push() async {
        isPushing = true

        do {
            let needsUpstream = branchInfo?.remote == nil
            let result = try await APIClient.shared.pushChanges(
                projectId: projectId,
                setUpstream: needsUpstream
            )
            lastCommitHash = nil
            showToast("Pushed to \(result.branch)")
            await loadData()
        } catch let apiError as APIError {
            showToast(apiError.errorDescription ?? "Push failed")
        } catch {
            showToast("Push failed")
        }

        isPushing = false
    }

    private func showToast(_ message: String) {
        withAnimation {
            toastMessage = message
        }

        Task {
            try? await Task.sleep(for: .seconds(3))
            withAnimation {
                toastMessage = nil
            }
        }
    }
}

// MARK: - Unified File Row View

struct UnifiedFileRowView: View {
    let item: FileStagerView.FlatFileItem
    let dirStagingState: FileStagerView.DirStagingState?
    @Binding var expandedDirs: Set<String>
    let onToggleStage: (String, Bool) -> Void  // (path, shouldStage)
    let onToggleExpand: (String) -> Void

    private var isExpanded: Bool {
        expandedDirs.contains(item.node.path)
    }

    // Determine if file is staged (no unstaged changes, has staged changes)
    private var isStaged: Bool {
        item.node.unstagedStatus == nil && item.node.stagedStatus != nil
    }

    // Display status - prefer unstaged (shows what needs staging)
    private var displayStatus: String? {
        item.node.unstagedStatus ?? item.node.stagedStatus
    }

    // Get name color based on type and staging state
    private var nameColor: Color {
        if item.node.type == .file {
            return isStaged ? .green : .primary
        }
        // Directory colors based on children staging state
        guard let state = dirStagingState else {
            return .primary
        }
        switch state {
        case .all: return .green
        case .mixed: return .yellow
        case .none: return .gray
        }
    }

    var body: some View {
        Button {
            if item.node.type == .directory {
                onToggleExpand(item.node.path)
            }
        } label: {
            HStack(spacing: 8) {
                // Indent based on depth
                if item.depth > 0 {
                    Spacer()
                        .frame(width: CGFloat(item.depth) * 16)
                }

                // Chevron for directories
                if item.node.type == .directory {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .frame(width: 12)
                } else {
                    Spacer()
                        .frame(width: 16)
                }

                // Folder/file icon
                if item.node.type == .directory {
                    Image(systemName: "folder.fill")
                        .foregroundStyle(.yellow)
                        .font(.caption)
                } else {
                    Image(systemName: "doc")
                        .foregroundStyle(.secondary)
                        .font(.caption)
                }

                // Status badge (colored based on staged/unstaged)
                if let status = displayStatus {
                    Text(statusText(status))
                        .font(.system(.caption, design: .monospaced))
                        .fontWeight(.bold)
                        .foregroundStyle(statusColor(status, isStaged: isStaged))
                        .frame(width: 20, alignment: .leading)
                }

                // File/directory name - colored based on staging state
                Text(item.node.name)
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(nameColor)
                    .lineLimit(1)
                    .truncationMode(.middle)

                Spacer()

                // Stage/unstage button
                Button {
                    if item.node.type == .directory {
                        // Stage/unstage all files in directory
                        let allPaths = getAllFilePaths(from: item.node)
                        let shouldStage = hasUnstagedFiles(in: item.node)
                        for path in allPaths {
                            onToggleStage(path, shouldStage)
                        }
                    } else {
                        // If has unstaged changes, stage them; otherwise unstage
                        let shouldStage = item.node.unstagedStatus != nil
                        onToggleStage(item.node.path, shouldStage)
                    }
                } label: {
                    // Show + if has unstaged changes, - if only staged
                    if item.node.unstagedStatus != nil || (item.node.type == .directory && hasUnstagedFiles(in: item.node)) {
                        Image(systemName: "plus.circle.fill")
                            .foregroundStyle(.green)
                    } else {
                        Image(systemName: "minus.circle.fill")
                            .foregroundStyle(.red)
                    }
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func statusText(_ status: String) -> String {
        switch status.lowercased() {
        case "modified", "m": return "M"
        case "added", "a": return "A"
        case "deleted", "d": return "D"
        case "renamed", "r": return "R"
        case "untracked", "?": return "??"
        default: return String(status.prefix(1)).uppercased()
        }
    }

    private func statusColor(_ status: String, isStaged: Bool) -> Color {
        // Staged files are always green
        if isStaged {
            return .green
        }

        // Unstaged files use standard colors
        switch status.lowercased() {
        case "modified", "m": return .yellow
        case "added", "a": return .green
        case "deleted", "d": return .red
        case "renamed", "r": return .purple
        case "untracked", "?": return .red
        default: return .gray
        }
    }

    private func getAllFilePaths(from node: FileStagerView.FileTreeNode) -> [String] {
        if node.type == .file {
            return [node.path]
        }
        return node.children.flatMap { getAllFilePaths(from: $0) }
    }

    private func hasUnstagedFiles(in node: FileStagerView.FileTreeNode) -> Bool {
        if node.type == .file {
            return node.unstagedStatus != nil
        }
        return node.children.contains { hasUnstagedFiles(in: $0) }
    }
}

#Preview {
    FileStagerView(projectId: "test-project", initialCommitMessage: "feat: add new feature")
}

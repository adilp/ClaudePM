import Foundation

/// Represents a node in the documentation tree (file or directory)
struct DocTreeNode: Identifiable, Codable, Hashable {
    let name: String
    let type: NodeType
    let path: String
    var children: [DocTreeNode]?

    /// Computed ID based on path for uniqueness
    var id: String { path }

    /// Type of node in the documentation tree
    enum NodeType: String, Codable {
        case file
        case directory
    }

    /// Whether this node is a directory
    var isDirectory: Bool {
        type == .directory
    }

    /// Whether this node is a markdown file
    var isMarkdown: Bool {
        type == .file && name.hasSuffix(".md")
    }

    // Hashable conformance
    static func == (lhs: DocTreeNode, rhs: DocTreeNode) -> Bool {
        lhs.path == rhs.path
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(path)
    }
}

/// Response wrapper for documentation tree
struct DocTreeResponse: Codable {
    let tree: [DocTreeNode]
}

/// Response wrapper for document content
struct DocContentResponse: Codable {
    let path: String
    let content: String
    let name: String
}

import SwiftUI

/// Sheet for creating a new adhoc ticket
struct CreateAdhocTicketSheet: View {
    let projectName: String
    let onCreate: (String, String, Bool) async throws -> Ticket

    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var slug = ""
    @State private var content = """
## Description

<your idea here>

## Notes

"""
    @State private var isExplore = false
    @State private var isCreating = false
    @State private var hasEditedSlug = false
    @State private var error: String?

    // Validation
    private var isTitleValid: Bool {
        title.trimmingCharacters(in: .whitespaces).count >= 3
    }

    private var isSlugValid: Bool {
        let trimmed = slug.trimmingCharacters(in: .whitespaces)
        // Must match server regex: ^[a-z0-9]+(?:-[a-z0-9]+)*$
        // This means: alphanumeric, with hyphens only between alphanumeric segments
        let regex = try? NSRegularExpression(pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$")
        let range = NSRange(trimmed.startIndex..., in: trimmed)
        return trimmed.count >= 3 && trimmed.count <= 50 && regex?.firstMatch(in: trimmed, range: range) != nil
    }

    private var canCreate: Bool {
        isTitleValid && isSlugValid && !isCreating
    }

    var body: some View {
        NavigationStack {
            Form {
                // Project info
                Section {
                    HStack {
                        Image(systemName: "folder.fill")
                            .foregroundStyle(.secondary)
                        Text(projectName)
                            .foregroundStyle(.secondary)
                    }
                } header: {
                    Text("Project")
                }

                // Title
                Section {
                    TextField("e.g., Add user authentication", text: $title)
                        .textInputAutocapitalization(.sentences)
                        .onChange(of: title) { _, newValue in
                            if !hasEditedSlug {
                                slug = generateSlug(from: newValue)
                            }
                        }

                    if !title.isEmpty && !isTitleValid {
                        Text("Title must be at least 3 characters")
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                } header: {
                    Text("Title")
                } footer: {
                    Text("A short description of what needs to be done")
                }

                // Slug
                Section {
                    TextField("e.g., add-user-auth", text: $slug)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onChange(of: slug) { oldValue, newValue in
                            // Only mark as edited if user manually changed it
                            // (not if it was auto-generated from title)
                            let expectedSlug = generateSlug(from: title)
                            if newValue != expectedSlug {
                                hasEditedSlug = true
                            }
                        }

                    if !slug.isEmpty && !isSlugValid {
                        Text("Must be 3-50 lowercase letters, numbers, and hyphens")
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                } header: {
                    Text("Slug")
                } footer: {
                    Text("URL-friendly identifier (auto-generated from title)")
                }

                // Content
                Section {
                    TextEditor(text: $content)
                        .font(.system(.body, design: .monospaced))
                        .frame(minHeight: 150)
                } header: {
                    Text("Content (Optional)")
                } footer: {
                    Text("Markdown description of the task. You can add more details later.")
                }

                // Explore mode
                Section {
                    Toggle(isOn: $isExplore) {
                        HStack {
                            Image(systemName: "magnifyingglass")
                                .foregroundStyle(.indigo)
                            Text("Explore Mode")
                        }
                    }
                } footer: {
                    Text("Enable for research-only tasks that don't require code changes")
                }

                // Error display
                if let error = error {
                    Section {
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.orange)
                            Text(error)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("New Ticket")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .disabled(isCreating)
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task {
                            await createTicket()
                        }
                    } label: {
                        if isCreating {
                            ProgressView()
                        } else {
                            Text("Create")
                        }
                    }
                    .disabled(!canCreate)
                }
            }
            .interactiveDismissDisabled(isCreating)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Helpers

    private func generateSlug(from text: String) -> String {
        var result = text
            .lowercased()
            .trimmingCharacters(in: .whitespaces)
            // Replace spaces and underscores with hyphens
            .replacingOccurrences(of: " ", with: "-")
            .replacingOccurrences(of: "_", with: "-")
            // Remove any character that isn't alphanumeric or hyphen
            .replacingOccurrences(of: "[^a-z0-9-]", with: "", options: .regularExpression)
            // Collapse multiple hyphens into one
            .replacingOccurrences(of: "-+", with: "-", options: .regularExpression)
            // Remove leading/trailing hyphens
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))

        // Ensure we don't have hyphens at start or end after all transformations
        while result.hasPrefix("-") {
            result.removeFirst()
        }
        while result.hasSuffix("-") {
            result.removeLast()
        }

        return result
    }

    @MainActor
    private func createTicket() async {
        isCreating = true
        error = nil

        let trimmedTitle = title.trimmingCharacters(in: .whitespaces)
        let trimmedSlug = slug.trimmingCharacters(in: .whitespaces)
        let trimmedContent = content.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            print("DEBUG: Creating ticket with title: \(trimmedTitle), slug: \(trimmedSlug)")
            let ticket = try await onCreate(trimmedTitle, trimmedSlug, isExplore)
            print("DEBUG: Ticket created successfully: \(ticket.id)")

            // Build full content with title header (matching server template format)
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            let dateString = formatter.string(from: Date())

            let fullContent = """
# \(trimmedTitle)

\(trimmedContent)

- Created: \(dateString)
"""

            // Save content to the ticket
            do {
                try await APIClient.shared.updateTicketContent(ticketId: ticket.id, content: fullContent)
                print("DEBUG: Content saved successfully")
            } catch {
                print("Warning: Failed to save ticket content: \(error)")
            }

            print("DEBUG: Dismissing sheet")
            isCreating = false
            dismiss()
            print("DEBUG: Dismiss called")
        } catch let apiError as APIError {
            print("DEBUG: API error: \(apiError)")
            switch apiError {
            case .serverError(409):
                error = "A ticket with this slug already exists. Please choose a different slug."
            case .serverError(let code):
                error = "Server error (\(code)). Please check slug format and try again."
            case .unauthorized:
                error = "Authentication failed. Please check your API key in settings."
            default:
                error = apiError.localizedDescription
            }
            isCreating = false
        } catch {
            print("DEBUG: Other error: \(error)")
            self.error = error.localizedDescription
            isCreating = false
        }
    }
}

#Preview {
    CreateAdhocTicketSheet(
        projectName: "Claude Session Manager",
        onCreate: { _, _, _ in
            throw APIError.serverError(500)
        }
    )
}

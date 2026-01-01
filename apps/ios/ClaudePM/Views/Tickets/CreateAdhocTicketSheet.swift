import SwiftUI

/// Sheet for creating a new adhoc ticket
struct CreateAdhocTicketSheet: View {
    let projectName: String
    let onCreate: (String, String, Bool) async -> Ticket?

    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var slug = ""
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
        let regex = try? NSRegularExpression(pattern: "^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$")
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
                        .onChange(of: slug) { _, _ in
                            hasEditedSlug = true
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
        text
            .lowercased()
            .trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: " ", with: "-")
            .replacingOccurrences(of: "[^a-z0-9-]", with: "", options: .regularExpression)
            .replacingOccurrences(of: "-+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }

    private func createTicket() async {
        isCreating = true
        error = nil

        let trimmedTitle = title.trimmingCharacters(in: .whitespaces)
        let trimmedSlug = slug.trimmingCharacters(in: .whitespaces)

        if let ticket = await onCreate(trimmedTitle, trimmedSlug, isExplore) {
            await MainActor.run {
                dismiss()
            }
        } else {
            await MainActor.run {
                error = "Failed to create ticket. The slug may already exist."
                isCreating = false
            }
        }
    }
}

#Preview {
    CreateAdhocTicketSheet(
        projectName: "Claude Session Manager",
        onCreate: { _, _, _ in nil }
    )
}

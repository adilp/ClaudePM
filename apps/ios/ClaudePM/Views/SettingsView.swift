import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    var viewModel: ConnectionViewModel

    @AppStorage("backendURL") private var backendURL = ""
    @State private var apiKey = ""
    @State private var showingAPIKey = false
    @State private var isSaving = false
    @State private var saveError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Backend URL", text: $backendURL)
                        .textContentType(.URL)
                        .keyboardType(.URL)
                        .autocapitalization(.none)
                        .autocorrectionDisabled()
                } header: {
                    Text("Server")
                } footer: {
                    Text("Example: http://192.168.1.100:4847")
                }

                Section {
                    HStack {
                        if showingAPIKey {
                            TextField("API Key", text: $apiKey)
                                .autocapitalization(.none)
                                .autocorrectionDisabled()
                        } else {
                            SecureField("API Key", text: $apiKey)
                        }

                        Button {
                            showingAPIKey.toggle()
                        } label: {
                            Image(systemName: showingAPIKey ? "eye.slash" : "eye")
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                    }
                } header: {
                    Text("Authentication")
                } footer: {
                    Text("API key is stored securely in Keychain")
                }

                if let error = saveError {
                    Section {
                        Text(error)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button {
                        saveSettings()
                    } label: {
                        HStack {
                            Spacer()
                            if isSaving {
                                ProgressView()
                                    .padding(.trailing, 4)
                            }
                            Text("Save & Connect")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .disabled(isSaving || backendURL.isEmpty)
                }

                Section {
                    Button(role: .destructive) {
                        clearSettings()
                    } label: {
                        Text("Clear Settings")
                            .frame(maxWidth: .infinity)
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
            .onAppear {
                loadAPIKey()
            }
        }
    }

    private func loadAPIKey() {
        apiKey = KeychainHelper.getAPIKey() ?? ""
    }

    private func saveSettings() {
        isSaving = true
        saveError = nil

        // Validate URL format
        guard URL(string: backendURL) != nil else {
            saveError = "Invalid URL format"
            isSaving = false
            return
        }

        // Save API key to Keychain
        if !apiKey.isEmpty {
            if !KeychainHelper.save(apiKey: apiKey) {
                saveError = "Failed to save API key"
                isSaving = false
                return
            }
        } else {
            KeychainHelper.delete()
        }

        // Reset and reconnect
        viewModel.resetConnection()

        Task {
            await viewModel.checkConnection()
            await MainActor.run {
                isSaving = false
                if viewModel.connectionStatus.isConnected {
                    dismiss()
                } else if case .error(let message) = viewModel.connectionStatus {
                    saveError = message
                }
            }
        }
    }

    private func clearSettings() {
        backendURL = ""
        apiKey = ""
        KeychainHelper.delete()
        viewModel.resetConnection()
    }
}

#Preview {
    SettingsView(viewModel: ConnectionViewModel())
}

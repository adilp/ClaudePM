import SwiftUI

struct ContentView: View {
    @State private var viewModel = ConnectionViewModel()
    @State private var showingSettings = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                // Connection Status Card
                connectionStatusCard

                // Session Count Display - always show when connected
                sessionCountCard

                Spacer()

                // Connect/Refresh Button
                actionButton
            }
            .padding()
            .navigationTitle("Claude PM")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gear")
                    }
                }
            }
            .sheet(isPresented: $showingSettings) {
                SettingsView(viewModel: viewModel)
            }
            .task {
                await viewModel.checkConnection()
            }
            .onAppear {
                viewModel.startAutoRefresh()
            }
            .onDisappear {
                viewModel.stopAutoRefresh()
            }
        }
    }

    // MARK: - Subviews

    private var connectionStatusCard: some View {
        VStack(spacing: 12) {
            HStack {
                Circle()
                    .fill(viewModel.connectionStatus.color)
                    .frame(width: 12, height: 12)

                Text(viewModel.connectionStatus.displayText)
                    .font(.headline)
            }

            if case .error(let message) = viewModel.connectionStatus {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private var sessionCountCard: some View {
        VStack(spacing: 8) {
            switch viewModel.connectionStatus {
            case .connected:
                Text("\(viewModel.activeSessionCount)")
                    .font(.system(size: 48, weight: .bold, design: .rounded))
                    .foregroundStyle(.primary)

                Text("active session\(viewModel.activeSessionCount == 1 ? "" : "s")")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                if viewModel.sessionCount > viewModel.activeSessionCount {
                    Text("\(viewModel.sessionCount) total")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
            case .connecting:
                ProgressView()
                    .padding(.bottom, 4)
                Text("Loading sessions...")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            case .disconnected, .error(_):
                Image(systemName: "server.rack")
                    .font(.system(size: 32))
                    .foregroundStyle(.secondary)
                Text("Not connected")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(minHeight: 100)
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var actionButton: some View {
        Button {
            Task {
                await viewModel.checkConnection()
            }
        } label: {
            HStack {
                if case .connecting = viewModel.connectionStatus {
                    ProgressView()
                        .tint(.white)
                        .padding(.trailing, 4)
                }
                Text(buttonTitle)
            }
            .frame(maxWidth: .infinity)
            .padding()
            .background(Color.accentColor)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .disabled(viewModel.connectionStatus == .connecting)
    }

    private var buttonTitle: String {
        switch viewModel.connectionStatus {
        case .connecting:
            return "Connecting..."
        case .connected:
            return "Refresh"
        default:
            return "Connect"
        }
    }
}

#Preview {
    ContentView()
}

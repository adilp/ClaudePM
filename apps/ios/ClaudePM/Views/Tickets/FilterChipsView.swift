import SwiftUI

/// Horizontal scrolling filter chips for filtering tickets by prefix
struct FilterChipsView: View {
    let prefixes: [String]
    @Binding var selectedPrefixes: [String]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // "All" chip
                FilterChip(
                    title: "All",
                    isSelected: isAllSelected,
                    onTap: selectAll
                )

                // Prefix chips
                ForEach(prefixes, id: \.self) { prefix in
                    FilterChip(
                        title: prefix,
                        isSelected: selectedPrefixes.contains(prefix),
                        onTap: { togglePrefix(prefix) }
                    )
                }
            }
            .padding(.horizontal)
        }
    }

    // MARK: - Helpers

    private var isAllSelected: Bool {
        selectedPrefixes.isEmpty
    }

    private func selectAll() {
        selectedPrefixes = []
    }

    private func togglePrefix(_ prefix: String) {
        if selectedPrefixes.contains(prefix) {
            selectedPrefixes.removeAll { $0 == prefix }
        } else {
            selectedPrefixes.append(prefix)
        }
    }
}

/// A single filter chip button
struct FilterChip: View {
    let title: String
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            Text(title)
                .font(.subheadline)
                .fontWeight(.medium)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(isSelected ? Color.accentColor : Color(.secondarySystemGroupedBackground))
                .foregroundStyle(isSelected ? .white : .primary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    VStack(spacing: 20) {
        FilterChipsView(
            prefixes: ["CSM-", "NAT-", "DWP-"],
            selectedPrefixes: .constant([])
        )

        FilterChipsView(
            prefixes: ["CSM-", "NAT-", "DWP-"],
            selectedPrefixes: .constant(["CSM-", "NAT-"])
        )
    }
    .padding(.vertical)
    .background(Color(.systemGroupedBackground))
}

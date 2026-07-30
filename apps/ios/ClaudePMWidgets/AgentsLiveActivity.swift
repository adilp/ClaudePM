import ActivityKit
import SwiftUI
import WidgetKit

// MARK: - Colours (variant C palette, matching the app + prototype)

extension Color {
    /// Status colour for a raw workmux status string.
    /// working=green #30D158 · waiting=orange #FF9F0A · done=blue #0A84FF · other=gray.
    static func agentStatus(_ raw: String) -> Color {
        switch AgentActivityStatus(raw) {
        case .working: return Color(red: 0.188, green: 0.820, blue: 0.345)
        case .waiting: return Color(red: 1.000, green: 0.624, blue: 0.039)
        case .done:    return Color(red: 0.039, green: 0.518, blue: 1.000)
        case .other:   return Color(red: 0.557, green: 0.557, blue: 0.576)
        }
    }
}

// MARK: - Shared building blocks

/// "N active · X waiting · Y done" headline.
private struct HeadlineView: View {
    let state: AgentActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 6) {
            Text("\(state.active) active")
                .font(.headline)
                .foregroundStyle(.primary)
            Text("· \(state.waiting) waiting · \(state.done) done")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
        }
    }
}

/// One agent row: status dot · task title · worktree · live elapsed.
private struct AgentRow: View {
    let row: AgentActivityAttributes.ContentState.Row

    var body: some View {
        HStack(spacing: 9) {
            Circle()
                .fill(Color.agentStatus(row.status))
                .frame(width: 8, height: 8)
            Text(row.title)
                .font(.subheadline)
                .fontWeight(.medium)
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: 6)
            Text(row.worktree)
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .lineLimit(1)
            Text(row.since, style: .relative)
                .font(.caption2)
                .monospacedDigit()
                .foregroundStyle(Color.agentStatus(row.status))
                .frame(minWidth: 40, alignment: .trailing)
        }
    }
}

/// "+ N done" overflow footer.
private struct DoneFooter: View {
    let count: Int
    var body: some View {
        Text("+ \(count) done")
            .font(.caption2)
            .foregroundStyle(.tertiary)
            .frame(maxWidth: .infinity, alignment: .center)
    }
}

/// The shared headline + rows + footer used by both the lock screen and the
/// expanded Dynamic Island.
private struct AgentListView: View {
    let state: AgentActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HeadlineView(state: state)
            ForEach(state.rows) { AgentRow(row: $0) }
            if state.doneOverflow > 0 {
                DoneFooter(count: state.doneOverflow)
            }
        }
    }
}

/// A small "● N" pill for the compact / minimal island presentations.
private struct CountPill: View {
    let count: Int
    let status: String
    var body: some View {
        HStack(spacing: 3) {
            Circle()
                .fill(Color.agentStatus(status))
                .frame(width: 7, height: 7)
            Text("\(count)")
                .font(.caption2)
                .fontWeight(.semibold)
                .monospacedDigit()
        }
    }
}

// MARK: - Live Activity

struct AgentsLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AgentActivityAttributes.self) { context in
            // Lock screen / banner presentation.
            AgentListView(state: context.state)
                .padding(14)
                .activityBackgroundTint(Color.black.opacity(0.45))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded (long-press) — the same hybrid list.
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 4) {
                        Image(systemName: "square.stack.3d.up.fill")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text("\(context.state.active) active")
                            .font(.caption)
                            .fontWeight(.semibold)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.state.waiting > 0 {
                        CountPill(count: context.state.waiting, status: "waiting")
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(context.state.rows) { AgentRow(row: $0) }
                        if context.state.doneOverflow > 0 {
                            DoneFooter(count: context.state.doneOverflow)
                        }
                    }
                }
            } compactLeading: {
                CountPill(count: context.state.waiting, status: "waiting")
            } compactTrailing: {
                Text("\(context.state.active)/\(context.state.total)")
                    .font(.caption2)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            } minimal: {
                CountPill(count: context.state.waiting, status: "waiting")
            }
            .keylineTint(Color.agentStatus("waiting"))
        }
    }
}

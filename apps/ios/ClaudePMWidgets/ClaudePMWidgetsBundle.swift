import SwiftUI
import WidgetKit

/// Entry point for the widget extension. For now it hosts only the agent-fleet
/// Live Activity (issue #9); a Home Screen widget is a separate future concern.
@main
struct ClaudePMWidgetsBundle: WidgetBundle {
    var body: some Widget {
        AgentsLiveActivity()
    }
}

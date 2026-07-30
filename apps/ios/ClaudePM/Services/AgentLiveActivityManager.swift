import ActivityKit
import Foundation

/// Owns the lock-screen / Dynamic Island Live Activity for the workmux agent
/// fleet (issue #9, variant C).
///
/// It keeps its own mirror of the live agent list — seeded by `agent:snapshot`
/// and mutated by `agent:update` / `agent:removed` — because the Live Activity
/// must keep updating regardless of which tab is on screen. `WebSocketClient`
/// forwards every agent event here (in addition to the `AgentsView` callbacks),
/// and this manager is an app-lifetime singleton, so it survives tab switches.
///
/// Lifecycle: starts an activity when the fleet is non-empty, updates it on
/// every change, and ends it when the fleet empties. It also captures the
/// activity's APNs **push token** and registers it with the server so a later
/// ticket (#10) can push content updates while the app is backgrounded.
@MainActor
final class AgentLiveActivityManager {
    static let shared = AgentLiveActivityManager()

    /// How many agent rows the lock screen / expanded island shows (variant C).
    private let maxRows = 3

    /// Current known agents (the source of truth for the activity content).
    private var agents: [Agent] = []

    /// The running activity, if any.
    private var currentActivity: Activity<AgentActivityAttributes>?

    /// Streams the activity's push token to the server; cancelled when the
    /// activity ends.
    private var pushTokenTask: Task<Void, Never>?

    /// Streams the app-lifetime **push-to-start** token to the server so it can
    /// START the activity remotely after expiry (issue #13). Lives for the app's
    /// lifetime, independent of any single activity.
    private var pushToStartTask: Task<Void, Never>?

    /// Watches for activities the *system* starts (e.g. a server push-to-start
    /// while the app was backgrounded) so we adopt them instead of ignoring them.
    private var activityUpdatesTask: Task<Void, Never>?

    /// Tracks the current activity's end so we drop the stale reference.
    private var stateTask: Task<Void, Never>?

    /// Guards `bootstrap()` against starting its observers more than once.
    private var didBootstrap = false

    private init() {}

    // MARK: - Bootstrap (called once at app launch)

    /// Start the app-lifetime observers: the push-to-start token stream and the
    /// system activity-start stream. Idempotent — safe to call on every launch /
    /// foreground. Distinct from the per-activity push-token stream, which is
    /// wired up per activity in `observePushToken`.
    func bootstrap() {
        guard !didBootstrap else { return }
        didBootstrap = true

        // Adopt any activity already running from a previous app session so we
        // don't start a duplicate and so its update token gets (re)registered.
        adoptExistingActivityIfNeeded()

        observePushToStartToken()
        observeActivityStarts()
    }

    /// Register the push-to-start token (iOS 17.2+) with the server whenever it
    /// appears or rotates. Below 17.2 push-to-start is unavailable; the in-app
    /// start path (#9) still works, we just can't revive remotely.
    private func observePushToStartToken() {
        guard #available(iOS 17.2, *) else {
            print("[LiveActivity] push-to-start needs iOS 17.2+; skipping")
            return
        }
        pushToStartTask?.cancel()
        pushToStartTask = Task {
            for await tokenData in Activity<AgentActivityAttributes>.pushToStartTokenUpdates {
                let hex = tokenData.map { String(format: "%02x", $0) }.joined()
                print("[LiveActivity] push-to-start token: \(hex)")
                do {
                    try await APIClient.shared.registerLiveActivityStartToken(hex)
                    print("[LiveActivity] Registered push-to-start token with backend")
                } catch {
                    print("[LiveActivity] push-to-start token registration failed: \(error.localizedDescription)")
                }
            }
        }
    }

    /// Watch for activities the system starts on our behalf — chiefly a server
    /// push-to-start that materialised while the app was backgrounded. Adopting
    /// one lets us register its per-activity update token and keep it in sync,
    /// and collapses any accidental duplicate down to a single activity.
    private func observeActivityStarts() {
        activityUpdatesTask?.cancel()
        activityUpdatesTask = Task {
            for await activity in Activity<AgentActivityAttributes>.activityUpdates {
                adopt(activity)
            }
        }
    }

    // MARK: - Feed (called from WebSocketClient, always on the main actor)

    /// Replace the whole fleet (from `agent:snapshot`).
    func applySnapshot(_ incoming: [Agent]) {
        agents = incoming
        reconcile()
    }

    /// Insert or update a single agent (from `agent:update`).
    func upsert(_ agent: Agent) {
        if let idx = agents.firstIndex(where: { $0.id == agent.id }) {
            agents[idx] = agent
        } else {
            agents.append(agent)
        }
        reconcile()
    }

    /// Remove a single agent (from `agent:removed`).
    func remove(id: String) {
        agents.removeAll { $0.id == id }
        reconcile()
    }

    // MARK: - Reconciliation

    /// Bring the Live Activity in line with the current agent list.
    private func reconcile() {
        adoptExistingActivityIfNeeded()

        // No agents → tear the activity down.
        guard !agents.isEmpty else {
            if let activity = currentActivity { end(activity) }
            return
        }

        let state = makeContentState()
        if let activity = currentActivity {
            let content = ActivityContent(state: state, staleDate: nil)
            Task { await activity.update(content) }
        } else {
            start(with: state)
        }
    }

    /// If we don't hold a reference but the system already has one running
    /// (e.g. the app was relaunched), adopt it rather than starting a duplicate.
    private func adoptExistingActivityIfNeeded() {
        guard currentActivity == nil,
              let existing = Activity<AgentActivityAttributes>.activities.first else { return }
        adopt(existing)
    }

    /// Take ownership of an activity — the one we just requested, one already
    /// running at launch, or one the *system* started for us via a server
    /// push-to-start (issue #13). Idempotent for the activity we already hold; if
    /// a *different* one appears (a duplicate from a start race) we keep the new
    /// one and end the old so the lock screen never stacks two.
    private func adopt(_ activity: Activity<AgentActivityAttributes>) {
        if let current = currentActivity {
            if current.id == activity.id { return } // already ours
            let stale = current
            Task { await stale.end(nil, dismissalPolicy: .immediate) }
            print("[LiveActivity] Replaced duplicate activity \(stale.id) with \(activity.id)")
        }
        currentActivity = activity
        observePushToken(for: activity)
        observeState(for: activity)
    }

    /// Drop our reference when the system ends an activity (expiry, user dismiss)
    /// so `reconcile` starts a fresh one next time the fleet warrants it.
    private func observeState(for activity: Activity<AgentActivityAttributes>) {
        stateTask?.cancel()
        stateTask = Task {
            for await state in activity.activityStateUpdates {
                if state == .ended || state == .dismissed {
                    if currentActivity?.id == activity.id {
                        pushTokenTask?.cancel(); pushTokenTask = nil
                        currentActivity = nil
                    }
                    print("[LiveActivity] Activity \(activity.id) ended (\(state))")
                    return
                }
            }
        }
    }

    /// Request a new activity. `Activity.request` is synchronous and returns the
    /// activity immediately, so there's no await gap in which a second event
    /// could start a duplicate.
    private func start(with state: AgentActivityAttributes.ContentState) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            print("[LiveActivity] Activities not enabled; skipping start")
            return
        }
        do {
            let activity = try Activity.request(
                attributes: AgentActivityAttributes(),
                content: ActivityContent(state: state, staleDate: nil),
                pushType: .token
            )
            adopt(activity)
            print("[LiveActivity] Started activity \(activity.id)")
        } catch {
            print("[LiveActivity] Failed to start: \(error.localizedDescription)")
        }
    }

    private func end(_ activity: Activity<AgentActivityAttributes>) {
        pushTokenTask?.cancel()
        pushTokenTask = nil
        stateTask?.cancel()
        stateTask = nil
        currentActivity = nil
        Task { await activity.end(nil, dismissalPolicy: .immediate) }
        print("[LiveActivity] Ended activity \(activity.id)")
    }

    /// Watch the activity's push token and register each new value with the
    /// server. The token can rotate over the activity's life, hence the stream.
    private func observePushToken(for activity: Activity<AgentActivityAttributes>) {
        pushTokenTask?.cancel()
        pushTokenTask = Task {
            for await tokenData in activity.pushTokenUpdates {
                let hex = tokenData.map { String(format: "%02x", $0) }.joined()
                print("[LiveActivity] Push token: \(hex)")
                do {
                    try await APIClient.shared.registerLiveActivityToken(hex)
                    print("[LiveActivity] Registered push token with backend")
                } catch {
                    // Most likely the backend URL isn't configured yet; the
                    // token stream re-emits on the next launch/rotation.
                    print("[LiveActivity] Token registration failed: \(error.localizedDescription)")
                }
            }
        }
    }

    // MARK: - Content

    /// Build the variant-C content state from the current agent list.
    private func makeContentState() -> AgentActivityAttributes.ContentState {
        let working = agents.filter { AgentActivityStatus($0.status) == .working }.count
        let waiting = agents.filter { AgentActivityStatus($0.status) == .waiting }.count
        let done    = agents.filter { AgentActivityStatus($0.status) == .done }.count

        let sorted = agents.sorted { lhs, rhs in
            let lp = AgentActivityStatus(lhs.status).sortPriority
            let rp = AgentActivityStatus(rhs.status).sortPriority
            if lp != rp { return lp < rp }
            return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
        }

        let rows = sorted.prefix(maxRows).map { agent in
            AgentActivityAttributes.ContentState.Row(
                id: agent.id,
                status: agent.status,
                title: agent.title,
                worktree: agent.worktree,
                since: statusSince(agent)
            )
        }

        // Footer counts only the `done` agents that AREN'T already shown as rows.
        let doneShown = rows.filter { AgentActivityStatus($0.status) == .done }.count
        let doneOverflow = max(0, done - doneShown)

        return AgentActivityAttributes.ContentState(
            working: working,
            waiting: waiting,
            done: done,
            total: agents.count,
            rows: Array(rows),
            doneOverflow: doneOverflow
        )
    }

    /// Best-effort "status changed at" timestamp, guarding the model's documented
    /// `0 == unknown` sentinel so elapsed time never renders as "55 years".
    private func statusSince(_ agent: Agent) -> Date {
        let ts = agent.statusTs > 0
            ? agent.statusTs
            : (agent.updatedTs > 0 ? agent.updatedTs : Date().timeIntervalSince1970)
        return Date(timeIntervalSince1970: ts)
    }
}

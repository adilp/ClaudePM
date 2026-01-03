import Foundation
import SwiftUI

/// View model for the Ticket Board View
@Observable
class TicketBoardViewModel {
    // MARK: - Published State

    /// All tickets fetched from the API
    private(set) var tickets: [Ticket] = []

    /// Available projects
    private(set) var projects: [Project] = []

    /// Currently selected project ID
    var selectedProjectId: String? {
        didSet {
            if oldValue != selectedProjectId {
                // Clear filters when project changes
                selectedPrefixes = []
                Task { await loadTickets() }
            }
        }
    }

    /// Available prefixes for filtering
    private(set) var prefixes: [String] = []

    /// Currently selected prefixes for filtering
    var selectedPrefixes: [String] = []

    /// Loading state
    private(set) var isLoading = false

    /// Error message if any
    private(set) var error: String?

    /// Loading state for ticket actions
    private(set) var isUpdating = false

    /// Loading state for ticket creation
    private(set) var isCreating = false

    /// Last created ticket (for navigation)
    private(set) var lastCreatedTicket: Ticket?

    /// Running sessions indexed by ticket ID
    private(set) var sessionsByTicketId: [String: Session] = [:]

    // MARK: - Computed Properties

    /// Get running session for a ticket (if any)
    func runningSession(for ticketId: String) -> Session? {
        sessionsByTicketId[ticketId]
    }

    /// Tickets filtered by selected prefixes
    var filteredTickets: [Ticket] {
        guard !selectedPrefixes.isEmpty else {
            return tickets
        }
        return tickets.filter { ticket in
            selectedPrefixes.contains(ticket.prefix)
        }
    }

    /// Get tickets for a specific status column
    func tickets(for status: TicketStatus) -> [Ticket] {
        filteredTickets.filter { $0.state == status }
    }

    /// Check if all prefixes are selected (or none, which means "All")
    var isAllSelected: Bool {
        selectedPrefixes.isEmpty
    }

    // MARK: - Actions

    /// Load projects from API
    @MainActor
    func loadProjects() async {
        isLoading = true
        error = nil

        do {
            projects = try await APIClient.shared.getProjects()
            // Select first project by default if none selected
            if selectedProjectId == nil, let firstProject = projects.first {
                selectedProjectId = firstProject.id
            }
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    /// Load tickets from API
    @MainActor
    func loadTickets() async {
        guard let projectId = selectedProjectId else {
            tickets = []
            prefixes = []
            sessionsByTicketId = [:]
            return
        }

        isLoading = true
        error = nil

        do {
            // Load tickets, prefixes, and sessions in parallel
            async let ticketsTask = APIClient.shared.getTickets(projectId: projectId)
            async let prefixesTask = APIClient.shared.getTicketPrefixes(projectId: projectId)
            async let sessionsTask = APIClient.shared.getSessions()

            let (ticketResponse, loadedPrefixes, allSessions) = try await (ticketsTask, prefixesTask, sessionsTask)
            tickets = ticketResponse.data
            prefixes = loadedPrefixes

            // Build lookup of running sessions by ticket ID
            sessionsByTicketId = [:]
            for session in allSessions where session.status == .running {
                if let ticketId = session.ticketId {
                    sessionsByTicketId[ticketId] = session
                }
            }
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    /// Move a ticket to a new status
    @MainActor
    func moveTicket(_ ticketId: String, to newStatus: TicketStatus) async {
        isUpdating = true

        do {
            let updatedTicket = try await APIClient.shared.updateTicketState(ticketId: ticketId, newState: newStatus)

            // Update the ticket in our local array
            if let index = tickets.firstIndex(where: { $0.id == ticketId }) {
                tickets[index] = updatedTicket
            }
        } catch {
            self.error = error.localizedDescription
        }

        isUpdating = false
    }

    /// Start a ticket session
    @MainActor
    func startTicket(_ ticketId: String) async -> StartTicketResponse? {
        isUpdating = true
        error = nil

        do {
            let response = try await APIClient.shared.startTicket(ticketId: ticketId)

            // Update the ticket in our local array
            if let index = tickets.firstIndex(where: { $0.id == ticketId }) {
                tickets[index] = response.ticket
            }

            isUpdating = false
            return response
        } catch {
            self.error = error.localizedDescription
            isUpdating = false
            return nil
        }
    }

    /// Approve a ticket (transitions from review to done)
    /// - Parameter ticketId: The ticket ID to approve
    /// - Returns: The transition result, or nil if failed
    @MainActor
    func approveTicket(_ ticketId: String) async -> TransitionResult? {
        isUpdating = true
        error = nil

        do {
            let result = try await APIClient.shared.approveTicket(ticketId: ticketId)

            // Update the ticket in our local array
            if let index = tickets.firstIndex(where: { $0.id == ticketId }) {
                // Create updated ticket with new state
                let oldTicket = tickets[index]
                let updatedTicket = Ticket(
                    id: oldTicket.id,
                    externalId: oldTicket.externalId,
                    title: oldTicket.title,
                    state: result.toState,
                    filePath: oldTicket.filePath,
                    prefix: oldTicket.prefix,
                    isAdhoc: oldTicket.isAdhoc,
                    isExplore: oldTicket.isExplore,
                    startedAt: oldTicket.startedAt,
                    completedAt: Date(),
                    createdAt: oldTicket.createdAt,
                    updatedAt: Date()
                )
                tickets[index] = updatedTicket
            }

            isUpdating = false
            return result
        } catch {
            self.error = error.localizedDescription
            isUpdating = false
            return nil
        }
    }

    /// Reject a ticket (transitions from review back to in_progress)
    /// - Parameters:
    ///   - ticketId: The ticket ID to reject
    ///   - feedback: Feedback explaining why the ticket is being rejected
    /// - Returns: The transition result, or nil if failed
    @MainActor
    func rejectTicket(_ ticketId: String, feedback: String) async -> TransitionResult? {
        isUpdating = true
        error = nil

        do {
            let result = try await APIClient.shared.rejectTicket(ticketId: ticketId, feedback: feedback)

            // Update the ticket in our local array
            if let index = tickets.firstIndex(where: { $0.id == ticketId }) {
                // Create updated ticket with new state
                let oldTicket = tickets[index]
                let updatedTicket = Ticket(
                    id: oldTicket.id,
                    externalId: oldTicket.externalId,
                    title: oldTicket.title,
                    state: result.toState,
                    filePath: oldTicket.filePath,
                    prefix: oldTicket.prefix,
                    isAdhoc: oldTicket.isAdhoc,
                    isExplore: oldTicket.isExplore,
                    startedAt: oldTicket.startedAt,
                    completedAt: nil,
                    createdAt: oldTicket.createdAt,
                    updatedAt: Date()
                )
                tickets[index] = updatedTicket
            }

            isUpdating = false
            return result
        } catch {
            self.error = error.localizedDescription
            isUpdating = false
            return nil
        }
    }

    /// Create an adhoc ticket
    /// - Parameters:
    ///   - title: Ticket title
    ///   - slug: Ticket slug (lowercase alphanumeric + hyphens)
    ///   - isExplore: Whether this is an explore/research-only ticket
    /// - Returns: The created ticket
    /// - Throws: APIError if creation fails
    @MainActor
    func createAdhocTicket(title: String, slug: String, isExplore: Bool) async throws -> Ticket {
        guard let projectId = selectedProjectId else {
            throw APIError.invalidURL // No project selected
        }

        isCreating = true
        error = nil

        do {
            let ticket = try await APIClient.shared.createAdhocTicket(
                projectId: projectId,
                title: title,
                slug: slug,
                isExplore: isExplore
            )

            // Add to local tickets array
            tickets.insert(ticket, at: 0)

            // Update prefixes if needed
            if !prefixes.contains(ticket.prefix) {
                prefixes.append(ticket.prefix)
            }

            lastCreatedTicket = ticket
            isCreating = false
            return ticket
        } catch {
            self.error = error.localizedDescription
            isCreating = false
            throw error
        }
    }

    /// Toggle a prefix filter
    func togglePrefix(_ prefix: String) {
        if selectedPrefixes.contains(prefix) {
            selectedPrefixes.removeAll { $0 == prefix }
        } else {
            selectedPrefixes.append(prefix)
        }
    }

    /// Select all (clear filters)
    func selectAll() {
        selectedPrefixes = []
    }
}

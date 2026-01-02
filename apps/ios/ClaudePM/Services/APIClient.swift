import Foundation

/// Errors that can occur during API operations
enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized
    case serverError(Int)
    case networkError(Error)
    case decodingError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid server URL"
        case .invalidResponse:
            return "Invalid response from server"
        case .unauthorized:
            return "Invalid API key"
        case .serverError(let code):
            return "Server error: \(code)"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .decodingError(let error):
            return "Data error: \(error.localizedDescription)"
        }
    }
}

/// API client for communicating with the Claude PM backend
actor APIClient {
    static let shared = APIClient()

    private var session: URLSession

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 10
        config.timeoutIntervalForResource = 30
        self.session = URLSession(configuration: config)
    }

    /// Get the base URL from UserDefaults
    private var baseURL: URL? {
        guard let urlString = UserDefaults.standard.string(forKey: "backendURL"),
              let url = URL(string: urlString) else {
            return nil
        }
        return url
    }

    /// Check if the backend is reachable
    /// - Returns: HealthResponse if successful
    func checkHealth() async throws -> HealthResponse {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/health")
        let (data, response) = try await performRequest(url: url, requiresAuth: false)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            return try decoder.decode(HealthResponse.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Fetch all sessions from the backend
    /// - Returns: Array of Session objects
    func getSessions() async throws -> [Session] {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/sessions")
        let (data, response) = try await performRequest(url: url, requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode([Session].self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Discover manually created panes in tmux sessions
    /// - Returns: DiscoverSessionsResponse with discovered and existing panes
    func discoverSessions() async throws -> DiscoverSessionsResponse {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/sessions/discover")
        let (data, response) = try await performRequest(url: url, method: "POST", requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            return try decoder.decode(DiscoverSessionsResponse.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Rename a session
    /// - Parameters:
    ///   - sessionId: The session ID to rename
    ///   - name: The new name for the session
    func renameSession(sessionId: String, name: String) async throws {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/sessions/\(sessionId)/rename")
        let body = try JSONEncoder().encode(["name": name])
        let (_, response) = try await performRequest(url: url, method: "PATCH", body: body, requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }
    }

    // MARK: - Ticket Methods

    /// Fetch all projects from the backend
    /// - Returns: Array of Project objects
    func getProjects() async throws -> [Project] {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/projects")
        let (data, response) = try await performRequest(url: url, method: "GET", requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            decoder.dateDecodingStrategy = .iso8601
            let response = try decoder.decode(ProjectListResponse.self, from: data)
            return response.data
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Fetch tickets for a project
    /// - Parameters:
    ///   - projectId: The project ID to fetch tickets for
    ///   - prefixes: Optional array of prefixes to filter by (e.g., ["CSM-", "NAT-"])
    /// - Returns: TicketListResponse with tickets and pagination
    func getTickets(projectId: String, prefixes: [String]? = nil) async throws -> TicketListResponse {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        var urlComponents = URLComponents(url: baseURL.appendingPathComponent("api/projects/\(projectId)/tickets"), resolvingAgainstBaseURL: false)!
        var queryItems: [URLQueryItem] = [
            URLQueryItem(name: "limit", value: "100") // API max is 100
        ]

        if let prefixes = prefixes, !prefixes.isEmpty {
            for prefix in prefixes {
                queryItems.append(URLQueryItem(name: "prefixes", value: prefix))
            }
        }

        urlComponents.queryItems = queryItems

        guard let url = urlComponents.url else {
            throw APIError.invalidURL
        }

        print("DEBUG: Fetching tickets from URL: \(url)")
        let (data, response) = try await performRequest(url: url, method: "GET", requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        print("DEBUG: Tickets response status: \(httpResponse.statusCode)")

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 else {
            if let jsonString = String(data: data, encoding: .utf8) {
                print("DEBUG: Error response body: \(jsonString)")
            }
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            decoder.dateDecodingStrategy = .iso8601
            let result = try decoder.decode(TicketListResponse.self, from: data)
            print("DEBUG: Successfully decoded \(result.data.count) tickets")
            return result
        } catch {
            print("DEBUG: Ticket decoding error: \(error)")
            if let jsonString = String(data: data, encoding: .utf8) {
                print("DEBUG: Raw JSON (first 500 chars): \(String(jsonString.prefix(500)))")
            }
            throw APIError.decodingError(error)
        }
    }

    /// Fetch unique ticket prefixes for a project (for filtering)
    /// - Parameter projectId: The project ID
    /// - Returns: Array of prefix strings
    func getTicketPrefixes(projectId: String) async throws -> [String] {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/projects/\(projectId)/tickets/prefixes")
        print("DEBUG: Fetching prefixes from URL: \(url)")
        let (data, response) = try await performRequest(url: url, method: "GET", requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        print("DEBUG: Prefixes response status: \(httpResponse.statusCode)")

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 else {
            if let jsonString = String(data: data, encoding: .utf8) {
                print("DEBUG: Prefixes error response: \(jsonString)")
            }
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            let prefixResponse = try decoder.decode(PrefixesResponse.self, from: data)
            print("DEBUG: Successfully decoded \(prefixResponse.data.count) prefixes")
            return prefixResponse.data
        } catch {
            print("DEBUG: Prefixes decoding error: \(error)")
            throw APIError.decodingError(error)
        }
    }

    /// Create an adhoc ticket for a project
    /// - Parameters:
    ///   - projectId: The project ID
    ///   - title: Ticket title (3-100 chars)
    ///   - slug: Ticket slug (3-50 chars, lowercase alphanumeric + hyphens)
    ///   - isExplore: Whether this is an explore/research-only ticket
    /// - Returns: The created Ticket
    func createAdhocTicket(projectId: String, title: String, slug: String, isExplore: Bool = false) async throws -> Ticket {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/projects/\(projectId)/adhoc-tickets")

        struct CreateAdhocTicketBody: Encodable {
            let title: String
            let slug: String
            let isExplore: Bool
        }

        let body = CreateAdhocTicketBody(title: title, slug: slug, isExplore: isExplore)
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let jsonData = try encoder.encode(body)

        let (data, response) = try await performRequest(url: url, method: "POST", body: jsonData, requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        if httpResponse.statusCode == 409 {
            throw APIError.serverError(409) // Slug already exists
        }

        guard httpResponse.statusCode == 201 else {
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode(Ticket.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Get detailed ticket information including content
    /// - Parameter ticketId: The ticket ID
    /// - Returns: TicketDetail with full content
    func getTicketDetail(ticketId: String) async throws -> TicketDetail {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/tickets/\(ticketId)")
        let (data, response) = try await performRequest(url: url, method: "GET", requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        if httpResponse.statusCode == 404 {
            throw APIError.serverError(404)
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode(TicketDetail.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Update ticket state (move between columns)
    /// - Parameters:
    ///   - ticketId: The ticket ID
    ///   - newState: The new state to transition to
    /// - Returns: Updated Ticket
    func updateTicketState(ticketId: String, newState: TicketStatus) async throws -> Ticket {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/tickets/\(ticketId)")

        let body: [String: String] = ["state": newState.rawValue]
        let jsonData = try JSONEncoder().encode(body)

        let (data, response) = try await performRequest(url: url, method: "PATCH", body: jsonData, requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode(Ticket.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Start a session for a ticket
    /// - Parameter ticketId: The ticket ID to start
    /// - Returns: StartTicketResponse with updated ticket and session info
    func startTicket(ticketId: String) async throws -> StartTicketResponse {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/tickets/\(ticketId)/start")
        let (data, response) = try await performRequest(url: url, method: "POST", requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        if httpResponse.statusCode == 409 {
            throw APIError.serverError(409) // Ticket already has a running session
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode(StartTicketResponse.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Approve a ticket (transitions from review to done)
    /// - Parameter ticketId: The ticket ID to approve
    /// - Returns: The transition result
    func approveTicket(ticketId: String) async throws -> TransitionResult {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/tickets/\(ticketId)/approve")
        let (data, response) = try await performRequest(url: url, method: "POST", requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            return try decoder.decode(TransitionResult.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Reject a ticket (transitions from review back to in_progress with feedback)
    /// - Parameters:
    ///   - ticketId: The ticket ID to reject
    ///   - feedback: Feedback explaining why the ticket is being rejected
    /// - Returns: The transition result
    func rejectTicket(ticketId: String, feedback: String) async throws -> TransitionResult {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/tickets/\(ticketId)/reject")

        struct RejectBody: Encodable {
            let feedback: String
        }

        let body = RejectBody(feedback: feedback)
        let jsonData = try JSONEncoder().encode(body)

        let (data, response) = try await performRequest(url: url, method: "POST", body: jsonData, requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            return try decoder.decode(TransitionResult.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    // MARK: - Session Methods

    /// Create an adhoc session for a project
    /// - Parameter projectId: The project ID to create a session for
    /// - Returns: The created Session
    func createSession(projectId: String) async throws -> Session {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/projects/\(projectId)/sessions")
        let (data, response) = try await performRequest(url: url, method: "POST", requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 || httpResponse.statusCode == 201 else {
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode(Session.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Stop a running session
    /// - Parameter sessionId: The session ID to stop
    func stopSession(sessionId: String) async throws {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/sessions/\(sessionId)/stop")
        let (_, response) = try await performRequest(url: url, method: "POST", requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        if httpResponse.statusCode == 404 {
            throw APIError.serverError(404)
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }
    }

    // MARK: - AI Analysis Methods

    /// Get sessions for a ticket by fetching all project sessions and filtering
    /// - Parameters:
    ///   - projectId: The project ID
    ///   - ticketId: The ticket ID to filter by
    /// - Returns: Array of sessions for the ticket, sorted by createdAt descending
    func getSessionsForTicket(projectId: String, ticketId: String) async throws -> [Session] {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        var urlComponents = URLComponents(url: baseURL.appendingPathComponent("api/sessions"), resolvingAgainstBaseURL: false)!
        urlComponents.queryItems = [URLQueryItem(name: "project_id", value: projectId)]

        guard let url = urlComponents.url else {
            throw APIError.invalidURL
        }

        let (data, response) = try await performRequest(url: url, method: "GET", requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            decoder.dateDecodingStrategy = .iso8601
            let allSessions = try decoder.decode([Session].self, from: data)
            // Filter sessions for this ticket and sort by createdAt descending
            return allSessions
                .filter { $0.ticketId == ticketId }
                .sorted { $0.createdAt > $1.createdAt }
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Get AI-generated summary for a session
    /// - Parameters:
    ///   - sessionId: The session ID
    ///   - regenerate: Force regeneration of summary
    /// - Returns: SessionSummary with AI analysis
    func getSessionSummary(sessionId: String, regenerate: Bool = false) async throws -> SessionSummary {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        var urlComponents = URLComponents(url: baseURL.appendingPathComponent("api/sessions/\(sessionId)/summary"), resolvingAgainstBaseURL: false)!
        if regenerate {
            urlComponents.queryItems = [URLQueryItem(name: "regenerate", value: "true")]
        }

        guard let url = urlComponents.url else {
            throw APIError.invalidURL
        }

        let (data, response) = try await performRequest(url: url, method: "GET", requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        if httpResponse.statusCode == 404 {
            throw APIError.serverError(404)
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            // Note: SessionSummary uses explicit CodingKeys for snake_case top-level fields
            // but nested objects (actions, files_changed) use camelCase, so we DON'T use
            // .convertFromSnakeCase here
            let decoder = JSONDecoder()
            return try decoder.decode(SessionSummary.self, from: data)
        } catch let decodingError as DecodingError {
            // Print detailed decoding error for debugging
            print("SessionSummary decoding error:")
            switch decodingError {
            case .keyNotFound(let key, let context):
                print("  Key '\(key.stringValue)' not found: \(context.debugDescription)")
                print("  Coding path: \(context.codingPath.map { $0.stringValue })")
            case .typeMismatch(let type, let context):
                print("  Type mismatch for \(type): \(context.debugDescription)")
                print("  Coding path: \(context.codingPath.map { $0.stringValue })")
            case .valueNotFound(let type, let context):
                print("  Value not found for \(type): \(context.debugDescription)")
                print("  Coding path: \(context.codingPath.map { $0.stringValue })")
            case .dataCorrupted(let context):
                print("  Data corrupted: \(context.debugDescription)")
                print("  Coding path: \(context.codingPath.map { $0.stringValue })")
            @unknown default:
                print("  Unknown error: \(decodingError)")
            }
            // Also print raw JSON for debugging
            if let jsonString = String(data: data, encoding: .utf8) {
                print("  Raw JSON (first 500 chars): \(String(jsonString.prefix(500)))")
            }
            throw APIError.decodingError(decodingError)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Get AI-generated review report for a session
    /// - Parameters:
    ///   - sessionId: The session ID
    ///   - regenerate: Force regeneration of report
    /// - Returns: ReviewReport with completion analysis
    func getSessionReviewReport(sessionId: String, regenerate: Bool = false) async throws -> ReviewReport {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        var urlComponents = URLComponents(url: baseURL.appendingPathComponent("api/sessions/\(sessionId)/review-report"), resolvingAgainstBaseURL: false)!
        if regenerate {
            urlComponents.queryItems = [URLQueryItem(name: "regenerate", value: "true")]
        }

        guard let url = urlComponents.url else {
            throw APIError.invalidURL
        }

        let (data, response) = try await performRequest(url: url, method: "GET", requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        if httpResponse.statusCode == 404 {
            throw APIError.serverError(404)
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode(ReviewReport.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Get review history for a ticket
    /// - Parameter ticketId: The ticket ID
    /// - Returns: Array of review result entries
    func getReviewHistory(ticketId: String) async throws -> [ReviewResultEntry] {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/tickets/\(ticketId)/review-history")
        let (data, response) = try await performRequest(url: url, method: "GET", requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        if httpResponse.statusCode == 404 {
            throw APIError.serverError(404)
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            decoder.dateDecodingStrategy = .iso8601
            let result = try decoder.decode(ReviewHistoryResponse.self, from: data)
            return result.results
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Get git diff for a project
    /// - Parameters:
    ///   - projectId: The project ID
    ///   - baseBranch: Optional base branch for comparison
    /// - Returns: GitDiffResult with file changes
    func getGitDiff(projectId: String, baseBranch: String? = nil) async throws -> GitDiffResult {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        var urlComponents = URLComponents(url: baseURL.appendingPathComponent("api/projects/\(projectId)/git/diff"), resolvingAgainstBaseURL: false)!
        if let baseBranch = baseBranch {
            urlComponents.queryItems = [URLQueryItem(name: "base_branch", value: baseBranch)]
        }

        guard let url = urlComponents.url else {
            throw APIError.invalidURL
        }

        let (data, response) = try await performRequest(url: url, method: "GET", requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        if httpResponse.statusCode == 404 {
            throw APIError.serverError(404)
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            return try decoder.decode(GitDiffResult.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    // MARK: - Git Staging Methods

    /// Get git status for a project (staged, unstaged, untracked files)
    /// - Parameter projectId: The project ID
    /// - Returns: GitStatus with file lists
    func getGitStatus(projectId: String) async throws -> GitStatus {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/projects/\(projectId)/git/status")
        let (data, response) = try await performRequest(url: url, method: "GET", requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            return try decoder.decode(GitStatus.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Get branch info for a project
    /// - Parameter projectId: The project ID
    /// - Returns: BranchInfo with name, remote, and recent commits
    func getBranchInfo(projectId: String) async throws -> BranchInfo {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/projects/\(projectId)/git/branch")
        let (data, response) = try await performRequest(url: url, method: "GET", requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode(BranchInfo.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Stage specific files
    /// - Parameters:
    ///   - projectId: The project ID
    ///   - files: Array of file paths to stage
    func stageFiles(projectId: String, files: [String]) async throws {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/projects/\(projectId)/git/stage")
        let body = try JSONEncoder().encode(["files": files])
        let (_, response) = try await performRequest(url: url, method: "POST", body: body, requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }
    }

    /// Unstage specific files
    /// - Parameters:
    ///   - projectId: The project ID
    ///   - files: Array of file paths to unstage
    func unstageFiles(projectId: String, files: [String]) async throws {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/projects/\(projectId)/git/unstage")
        let body = try JSONEncoder().encode(["files": files])
        let (_, response) = try await performRequest(url: url, method: "POST", body: body, requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }
    }

    /// Stage all files
    /// - Parameter projectId: The project ID
    func stageAllFiles(projectId: String) async throws {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/projects/\(projectId)/git/stage-all")
        let (_, response) = try await performRequest(url: url, method: "POST", requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }
    }

    /// Unstage all files
    /// - Parameter projectId: The project ID
    func unstageAllFiles(projectId: String) async throws {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/projects/\(projectId)/git/unstage-all")
        let (_, response) = try await performRequest(url: url, method: "POST", requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }
    }

    /// Commit staged changes
    /// - Parameters:
    ///   - projectId: The project ID
    ///   - message: Commit message
    /// - Returns: CommitResult with hash and message
    func commitChanges(projectId: String, message: String) async throws -> CommitResult {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/projects/\(projectId)/git/commit")
        let body = try JSONEncoder().encode(["message": message])
        let (data, response) = try await performRequest(url: url, method: "POST", body: body, requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            return try decoder.decode(CommitResult.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    /// Push to remote
    /// - Parameters:
    ///   - projectId: The project ID
    ///   - setUpstream: Whether to set upstream tracking
    /// - Returns: PushResult with branch name
    func pushChanges(projectId: String, setUpstream: Bool = false) async throws -> PushResult {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/projects/\(projectId)/git/push")
        let body = try JSONEncoder().encode(["set_upstream": setUpstream])
        let (data, response) = try await performRequest(url: url, method: "POST", body: body, requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }

        do {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            return try decoder.decode(PushResult.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    // MARK: - Terminal Control Methods

    /// Send a scroll command to the session's terminal (tmux copy-mode)
    /// - Parameters:
    ///   - sessionId: The session ID
    ///   - action: Scroll action: "up", "down", "enter", or "exit"
    func sendScrollCommand(sessionId: String, action: String) async throws {
        guard let baseURL = baseURL else {
            throw APIError.invalidURL
        }

        let url = baseURL.appendingPathComponent("api/sessions/\(sessionId)/scroll")

        let body: [String: String] = ["action": action]
        let jsonData = try JSONEncoder().encode(body)

        let (_, response) = try await performRequest(url: url, method: "POST", body: jsonData, requiresAuth: true)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if httpResponse.statusCode == 401 {
            throw APIError.unauthorized
        }

        if httpResponse.statusCode == 404 {
            throw APIError.serverError(404)
        }

        guard httpResponse.statusCode == 200 else {
            throw APIError.serverError(httpResponse.statusCode)
        }
    }

    // MARK: - Private Helpers

    /// Perform a network request with optional method and body
    private func performRequest(url: URL, method: String = "GET", body: Data? = nil, requiresAuth: Bool) async throws -> (Data, URLResponse) {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.addValue("application/json", forHTTPHeaderField: "Accept")

        if body != nil {
            request.addValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = body
        }

        if requiresAuth, let apiKey = KeychainHelper.getAPIKey() {
            request.addValue(apiKey, forHTTPHeaderField: "X-API-Key")
        }

        do {
            return try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }
    }

    /// Perform a network request (legacy, calls the new version)
    private func performRequest(url: URL, requiresAuth: Bool) async throws -> (Data, URLResponse) {
        return try await performRequest(url: url, method: "GET", body: nil, requiresAuth: requiresAuth)
    }

    /// Update the base URL (used when settings change)
    func updateConfiguration() {
        // Configuration is read fresh each time from UserDefaults
        // This method exists for future extensibility
    }
}

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

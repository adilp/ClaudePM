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

    /// Perform a network request
    private func performRequest(url: URL, requiresAuth: Bool) async throws -> (Data, URLResponse) {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.addValue("application/json", forHTTPHeaderField: "Accept")

        if requiresAuth, let apiKey = KeychainHelper.getAPIKey() {
            request.addValue(apiKey, forHTTPHeaderField: "X-API-Key")
        }

        do {
            return try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }
    }

    /// Update the base URL (used when settings change)
    func updateConfiguration() {
        // Configuration is read fresh each time from UserDefaults
        // This method exists for future extensibility
    }
}

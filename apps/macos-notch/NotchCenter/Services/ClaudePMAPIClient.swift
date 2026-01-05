import Foundation

/// Simple REST client for fetching Claude PM session details
actor ClaudePMAPIClient {
    static let shared = ClaudePMAPIClient()

    private init() {}

    /// Session response model (minimal, just what we need)
    struct SessionResponse: Decodable {
        let id: String
        let ticket: TicketInfo?

        struct TicketInfo: Decodable {
            let id: String
            let externalId: String?
            let title: String
        }
    }

    /// Fetch session details to get ticket title
    /// - Parameters:
    ///   - sessionId: The session ID to fetch
    ///   - baseURL: The server base URL (e.g., "http://localhost:4847")
    /// - Returns: The session response with ticket info, or nil if not found
    func fetchSession(sessionId: String, baseURL: String) async -> SessionResponse? {
        guard let url = URL(string: "\(baseURL)/api/sessions/\(sessionId)") else {
            print("[ClaudePMAPI] Invalid URL for session \(sessionId)")
            return nil
        }

        do {
            let (data, response) = try await URLSession.shared.data(from: url)

            guard let httpResponse = response as? HTTPURLResponse else {
                print("[ClaudePMAPI] Invalid response type")
                return nil
            }

            guard httpResponse.statusCode == 200 else {
                print("[ClaudePMAPI] Session fetch failed with status \(httpResponse.statusCode)")
                return nil
            }

            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            decoder.dateDecodingStrategy = .iso8601

            let session = try decoder.decode(SessionResponse.self, from: data)
            return session
        } catch {
            print("[ClaudePMAPI] Failed to fetch session: \(error.localizedDescription)")
            return nil
        }
    }

    /// Get ticket title for a session
    /// - Parameters:
    ///   - sessionId: The session ID
    ///   - baseURL: The server base URL
    /// - Returns: Ticket title if available, nil otherwise
    func getTicketTitle(sessionId: String, baseURL: String) async -> String? {
        guard let session = await fetchSession(sessionId: sessionId, baseURL: baseURL) else {
            return nil
        }
        return session.ticket?.title
    }
}

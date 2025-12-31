import XCTest
@testable import ClaudePM

final class ClaudePMTests: XCTestCase {

    override func setUpWithError() throws {
    }

    override func tearDownWithError() throws {
    }

    // MARK: - Session Model Tests

    func testSessionDecoding() throws {
        let json = """
        {
            "id": "test-123",
            "project_id": "project-456",
            "ticket_id": null,
            "type": "adhoc",
            "status": "running",
            "context_percent": 25,
            "pane_id": "%1",
            "started_at": "2024-01-01T00:00:00Z",
            "ended_at": null,
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T01:00:00Z",
            "project": {
                "id": "project-456",
                "name": "Test Project"
            },
            "ticket": null
        }
        """

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601

        let data = json.data(using: .utf8)!
        let session = try decoder.decode(Session.self, from: data)

        XCTAssertEqual(session.id, "test-123")
        XCTAssertEqual(session.projectId, "project-456")
        XCTAssertEqual(session.status, .running)
        XCTAssertEqual(session.type, .adhoc)
        XCTAssertEqual(session.contextPercent, 25)
        XCTAssertEqual(session.project.name, "Test Project")
        XCTAssertNil(session.ticket)
    }

    func testSessionWithTicketDecoding() throws {
        let json = """
        {
            "id": "test-123",
            "project_id": "project-456",
            "ticket_id": "ticket-789",
            "type": "ticket",
            "status": "completed",
            "context_percent": 50,
            "pane_id": "%2",
            "started_at": "2024-01-01T00:00:00Z",
            "ended_at": "2024-01-01T02:00:00Z",
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T02:00:00Z",
            "project": {
                "id": "project-456",
                "name": "Test Project"
            },
            "ticket": {
                "id": "ticket-789",
                "external_id": "JIRA-123",
                "title": "Fix bug"
            }
        }
        """

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601

        let data = json.data(using: .utf8)!
        let session = try decoder.decode(Session.self, from: data)

        XCTAssertEqual(session.status, .completed)
        XCTAssertEqual(session.type, .ticket)
        XCTAssertNotNil(session.ticket)
        XCTAssertEqual(session.ticket?.title, "Fix bug")
        XCTAssertEqual(session.ticket?.externalId, "JIRA-123")
    }

    func testSessionStatusDisplayName() {
        XCTAssertEqual(SessionStatus.running.displayName, "Running")
        XCTAssertEqual(SessionStatus.paused.displayName, "Paused")
        XCTAssertEqual(SessionStatus.completed.displayName, "Completed")
        XCTAssertEqual(SessionStatus.error.displayName, "Error")
    }

    func testSessionStatusIsActive() {
        XCTAssertTrue(SessionStatus.running.isActive)
        XCTAssertFalse(SessionStatus.paused.isActive)
        XCTAssertFalse(SessionStatus.completed.isActive)
        XCTAssertFalse(SessionStatus.error.isActive)
    }

    // MARK: - HealthResponse Tests

    func testHealthResponseDecoding() throws {
        let json = """
        {
            "status": "ok",
            "timestamp": "2024-01-01T00:00:00Z",
            "version": "1.0.0"
        }
        """

        let data = json.data(using: .utf8)!
        let response = try JSONDecoder().decode(HealthResponse.self, from: data)

        XCTAssertEqual(response.status, "ok")
        XCTAssertEqual(response.version, "1.0.0")
    }

    // MARK: - ConnectionStatus Tests

    func testConnectionStatusDisplayText() {
        XCTAssertEqual(ConnectionStatus.disconnected.displayText, "Disconnected")
        XCTAssertEqual(ConnectionStatus.connecting.displayText, "Connecting...")
        XCTAssertEqual(ConnectionStatus.connected.displayText, "Connected")
        XCTAssertEqual(ConnectionStatus.error("Test error").displayText, "Error: Test error")
    }

    func testConnectionStatusIsConnected() {
        XCTAssertFalse(ConnectionStatus.disconnected.isConnected)
        XCTAssertFalse(ConnectionStatus.connecting.isConnected)
        XCTAssertTrue(ConnectionStatus.connected.isConnected)
        XCTAssertFalse(ConnectionStatus.error("Test").isConnected)
    }

    // MARK: - Keychain Tests

    func testKeychainSaveAndRetrieve() {
        let testKey = "test-api-key-\(UUID().uuidString)"

        // Save
        let saveResult = KeychainHelper.save(apiKey: testKey)
        XCTAssertTrue(saveResult)

        // Retrieve
        let retrievedKey = KeychainHelper.getAPIKey()
        XCTAssertEqual(retrievedKey, testKey)

        // Clean up
        KeychainHelper.delete()
        XCTAssertNil(KeychainHelper.getAPIKey())
    }

    func testKeychainDelete() {
        KeychainHelper.save(apiKey: "temp-key")
        XCTAssertTrue(KeychainHelper.hasAPIKey)

        KeychainHelper.delete()
        XCTAssertFalse(KeychainHelper.hasAPIKey)
    }
}

/**
 * WebSocket Server Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import {
  WebSocketManager,
  wsManager,
} from '../../src/websocket/server.js';
import {
  clientMessageSchema,
  subscribeMessageSchema,
  unsubscribeMessageSchema,
  inputMessageSchema,
  pingMessageSchema,
  type ServerMessage,
  type ErrorMessage,
  type PongMessage,
  type SubscribedMessage,
  type UnsubscribedMessage,
  WS_ERROR_CODES,
  DEFAULT_WS_CONFIG,
} from '../../src/websocket/types.js';

// ============================================================================
// Mock Session Supervisor
// ============================================================================

vi.mock('../../src/services/session-supervisor.js', () => {
  const EventEmitter = require('events');

  class MockSessionSupervisor extends EventEmitter {
    private sessions = new Map<string, { id: string; outputBuffer: string[] }>();

    getActiveSession(sessionId: string) {
      return this.sessions.get(sessionId);
    }

    getSessionOutput(sessionId: string, _lines: number): string[] {
      const session = this.sessions.get(sessionId);
      return session?.outputBuffer ?? [];
    }

    async sendInput(sessionId: string, _input: string): Promise<void> {
      if (!this.sessions.has(sessionId)) {
        const { SessionNotFoundError } = await import('../../src/services/session-supervisor-types.js');
        throw new SessionNotFoundError(sessionId);
      }
    }

    // Test helpers
    addMockSession(sessionId: string, outputBuffer: string[] = []): void {
      this.sessions.set(sessionId, { id: sessionId, outputBuffer });
    }

    removeMockSession(sessionId: string): void {
      this.sessions.delete(sessionId);
    }

    clearMockSessions(): void {
      this.sessions.clear();
    }
  }

  const mockSupervisor = new MockSessionSupervisor();

  return {
    sessionSupervisor: mockSupervisor,
    SessionNotFoundError: class SessionNotFoundError extends Error {
      constructor(public sessionId: string) {
        super(`Session not found: ${sessionId}`);
        this.name = 'SessionNotFoundError';
      }
    },
    SessionInputError: class SessionInputError extends Error {
      constructor(public sessionId: string, message: string) {
        super(`Failed to send input to session ${sessionId}: ${message}`);
        this.name = 'SessionInputError';
      }
    },
  };
});

// Get the mocked supervisor for test helpers
const getMockSupervisor = async () => {
  const { sessionSupervisor } = await import('../../src/services/session-supervisor.js');
  return sessionSupervisor as unknown as {
    addMockSession: (sessionId: string, outputBuffer?: string[]) => void;
    removeMockSession: (sessionId: string) => void;
    clearMockSessions: () => void;
    emit: (event: string, data: unknown) => void;
    on: (event: string, handler: (data: unknown) => void) => void;
    removeListener: (event: string, handler: (data: unknown) => void) => void;
  };
};

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a test HTTP server and WebSocket manager
 */
async function createTestServer(): Promise<{
  httpServer: HttpServer;
  wsManager: WebSocketManager;
  address: string;
}> {
  const httpServer = createServer();
  const wsManager = new WebSocketManager({
    pingInterval: 100000, // Long interval for tests
    connectionTimeout: 100000,
  });

  wsManager.attach(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });

  const addr = httpServer.address() as AddressInfo;
  const address = `ws://127.0.0.1:${addr.port}`;

  return { httpServer, wsManager, address };
}

/**
 * Create a WebSocket client and wait for connection
 */
async function createClient(address: string): Promise<WebSocket> {
  const ws = new WebSocket(address);

  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', (err) => reject(err));
  });

  return ws;
}

/**
 * Send a message and wait for response
 */
async function sendAndReceive<T extends ServerMessage>(
  ws: WebSocket,
  message: unknown,
  timeout = 1000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout waiting for response'));
    }, timeout);

    ws.once('message', (data: Buffer) => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(data.toString()) as T;
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    });

    ws.send(JSON.stringify(message));
  });
}

/**
 * Wait for a specific message type
 */
async function waitForMessage<T extends ServerMessage>(
  ws: WebSocket,
  type: string,
  timeout = 1000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for message type: ${type}`));
    }, timeout);

    const handler = (data: Buffer) => {
      try {
        const parsed = JSON.parse(data.toString()) as ServerMessage;
        if (parsed.type === type) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(parsed as T);
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.on('message', handler);
  });
}

// ============================================================================
// Message Schema Tests
// ============================================================================

describe('Message Schemas', () => {
  describe('subscribeMessageSchema', () => {
    it('should validate correct subscribe message', () => {
      const message = {
        type: 'session:subscribe',
        payload: { sessionId: '550e8400-e29b-41d4-a716-446655440000' },
      };

      const result = subscribeMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const message = {
        type: 'session:subscribe',
        payload: { sessionId: 'not-a-uuid' },
      };

      const result = subscribeMessageSchema.safeParse(message);
      expect(result.success).toBe(false);
    });

    it('should reject missing sessionId', () => {
      const message = {
        type: 'session:subscribe',
        payload: {},
      };

      const result = subscribeMessageSchema.safeParse(message);
      expect(result.success).toBe(false);
    });
  });

  describe('unsubscribeMessageSchema', () => {
    it('should validate correct unsubscribe message', () => {
      const message = {
        type: 'session:unsubscribe',
        payload: { sessionId: '550e8400-e29b-41d4-a716-446655440000' },
      };

      const result = unsubscribeMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });
  });

  describe('inputMessageSchema', () => {
    it('should validate correct input message', () => {
      const message = {
        type: 'session:input',
        payload: {
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          text: 'Hello, Claude!',
        },
      };

      const result = inputMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it('should reject text exceeding max length', () => {
      const message = {
        type: 'session:input',
        payload: {
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          text: 'x'.repeat(10001),
        },
      };

      const result = inputMessageSchema.safeParse(message);
      expect(result.success).toBe(false);
    });
  });

  describe('pingMessageSchema', () => {
    it('should validate ping message', () => {
      const message = { type: 'ping' };

      const result = pingMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it('should validate ping message with empty payload', () => {
      const message = { type: 'ping', payload: {} };

      const result = pingMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });
  });

  describe('clientMessageSchema', () => {
    it('should validate all message types', () => {
      const messages = [
        { type: 'session:subscribe', payload: { sessionId: '550e8400-e29b-41d4-a716-446655440000' } },
        { type: 'session:unsubscribe', payload: { sessionId: '550e8400-e29b-41d4-a716-446655440000' } },
        { type: 'session:input', payload: { sessionId: '550e8400-e29b-41d4-a716-446655440000', text: 'test' } },
        { type: 'ping' },
      ];

      for (const message of messages) {
        const result = clientMessageSchema.safeParse(message);
        expect(result.success).toBe(true);
      }
    });

    it('should reject unknown message type', () => {
      const message = { type: 'unknown:type', payload: {} };

      const result = clientMessageSchema.safeParse(message);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// WebSocketManager Unit Tests
// ============================================================================

describe('WebSocketManager', () => {
  let httpServer: HttpServer;
  let manager: WebSocketManager;
  let address: string;
  let mockSupervisor: Awaited<ReturnType<typeof getMockSupervisor>>;

  beforeEach(async () => {
    mockSupervisor = await getMockSupervisor();
    mockSupervisor.clearMockSessions();

    const setup = await createTestServer();
    httpServer = setup.httpServer;
    manager = setup.wsManager;
    address = setup.address;
  });

  afterEach(async () => {
    manager.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  describe('Connection Management', () => {
    it('should accept WebSocket connections', async () => {
      const ws = await createClient(address);
      expect(ws.readyState).toBe(WebSocket.OPEN);
      expect(manager.getConnectionCount()).toBe(1);
      ws.close();
    });

    it('should handle multiple concurrent connections', async () => {
      const clients = await Promise.all([
        createClient(address),
        createClient(address),
        createClient(address),
      ]);

      expect(manager.getConnectionCount()).toBe(3);

      for (const ws of clients) {
        ws.close();
      }
    });

    it('should clean up on disconnect', async () => {
      const ws = await createClient(address);
      expect(manager.getConnectionCount()).toBe(1);

      ws.close();

      // Wait for disconnect to be processed
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(manager.getConnectionCount()).toBe(0);
    });
  });

  describe('Ping/Pong', () => {
    it('should respond to ping with pong', async () => {
      const ws = await createClient(address);

      const response = await sendAndReceive<PongMessage>(ws, { type: 'ping' });

      expect(response.type).toBe('pong');
      expect(response.payload.timestamp).toBeDefined();
      expect(new Date(response.payload.timestamp).getTime()).toBeGreaterThan(0);

      ws.close();
    });
  });

  describe('Session Subscription', () => {
    const testSessionId = '550e8400-e29b-41d4-a716-446655440000';

    it('should allow subscribing to existing session', async () => {
      mockSupervisor.addMockSession(testSessionId, ['line1', 'line2']);

      const ws = await createClient(address);

      const response = await sendAndReceive<SubscribedMessage>(ws, {
        type: 'session:subscribe',
        payload: { sessionId: testSessionId },
      });

      expect(response.type).toBe('subscribed');
      expect(response.payload.sessionId).toBe(testSessionId);
      expect(response.payload.bufferLines).toEqual(['line1', 'line2']);
      expect(manager.getSessionSubscriberCount(testSessionId)).toBe(1);

      ws.close();
    });

    it('should return error for non-existent session', async () => {
      const ws = await createClient(address);

      const response = await sendAndReceive<ErrorMessage>(ws, {
        type: 'session:subscribe',
        payload: { sessionId: testSessionId },
      });

      expect(response.type).toBe('error');
      expect(response.payload.code).toBe(WS_ERROR_CODES.SESSION_NOT_FOUND);

      ws.close();
    });

    it('should allow unsubscribing from session', async () => {
      mockSupervisor.addMockSession(testSessionId);

      const ws = await createClient(address);

      // Subscribe first
      await sendAndReceive<SubscribedMessage>(ws, {
        type: 'session:subscribe',
        payload: { sessionId: testSessionId },
      });

      expect(manager.getSessionSubscriberCount(testSessionId)).toBe(1);

      // Then unsubscribe
      const response = await sendAndReceive<UnsubscribedMessage>(ws, {
        type: 'session:unsubscribe',
        payload: { sessionId: testSessionId },
      });

      expect(response.type).toBe('unsubscribed');
      expect(response.payload.sessionId).toBe(testSessionId);
      expect(manager.getSessionSubscriberCount(testSessionId)).toBe(0);

      ws.close();
    });

    it('should track multiple subscribers per session', async () => {
      mockSupervisor.addMockSession(testSessionId);

      const clients = await Promise.all([
        createClient(address),
        createClient(address),
      ]);

      // Subscribe both clients
      await Promise.all(
        clients.map((ws) =>
          sendAndReceive<SubscribedMessage>(ws, {
            type: 'session:subscribe',
            payload: { sessionId: testSessionId },
          })
        )
      );

      expect(manager.getSessionSubscriberCount(testSessionId)).toBe(2);

      // Close first client
      clients[0].close();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(manager.getSessionSubscriberCount(testSessionId)).toBe(1);

      // Close second client
      clients[1].close();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(manager.getSessionSubscriberCount(testSessionId)).toBe(0);
    });
  });

  describe('Session Input', () => {
    const testSessionId = '550e8400-e29b-41d4-a716-446655440000';

    it('should require subscription before sending input', async () => {
      mockSupervisor.addMockSession(testSessionId);

      const ws = await createClient(address);

      const response = await sendAndReceive<ErrorMessage>(ws, {
        type: 'session:input',
        payload: { sessionId: testSessionId, text: 'hello' },
      });

      expect(response.type).toBe('error');
      expect(response.payload.code).toBe(WS_ERROR_CODES.NOT_SUBSCRIBED);

      ws.close();
    });

    it('should allow input after subscription', async () => {
      mockSupervisor.addMockSession(testSessionId);

      const ws = await createClient(address);

      // Subscribe first
      await sendAndReceive<SubscribedMessage>(ws, {
        type: 'session:subscribe',
        payload: { sessionId: testSessionId },
      });

      // Send input - no response expected on success
      ws.send(
        JSON.stringify({
          type: 'session:input',
          payload: { sessionId: testSessionId, text: 'hello' },
        })
      );

      // Wait a bit for processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // No error should have been received
      ws.close();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON', async () => {
      const ws = await createClient(address);

      const responsePromise = new Promise<ErrorMessage>((resolve) => {
        ws.on('message', (data: Buffer) => {
          resolve(JSON.parse(data.toString()) as ErrorMessage);
        });
      });

      ws.send('not json');

      const response = await responsePromise;
      expect(response.type).toBe('error');
      expect(response.payload.code).toBe(WS_ERROR_CODES.PARSE_ERROR);

      ws.close();
    });

    it('should handle invalid message format', async () => {
      const ws = await createClient(address);

      const response = await sendAndReceive<ErrorMessage>(ws, {
        type: 'session:subscribe',
        payload: { sessionId: 'not-a-uuid' },
      });

      expect(response.type).toBe('error');
      expect(response.payload.code).toBe(WS_ERROR_CODES.INVALID_MESSAGE);

      ws.close();
    });

    it('should handle unknown message type', async () => {
      const ws = await createClient(address);

      const response = await sendAndReceive<ErrorMessage>(ws, {
        type: 'unknown:type',
        payload: {},
      });

      expect(response.type).toBe('error');
      expect(response.payload.code).toBe(WS_ERROR_CODES.INVALID_MESSAGE);

      ws.close();
    });
  });

  describe('Broadcast Methods', () => {
    it('should broadcast to all connections', async () => {
      const clients = await Promise.all([
        createClient(address),
        createClient(address),
      ]);

      const messagePromises = clients.map(
        (ws) =>
          new Promise<ServerMessage>((resolve) => {
            ws.on('message', (data: Buffer) => {
              resolve(JSON.parse(data.toString()) as ServerMessage);
            });
          })
      );

      manager.sendNotification('123', 'Test', 'Test notification');

      const responses = await Promise.all(messagePromises);

      for (const response of responses) {
        expect(response.type).toBe('notification');
        if (response.type === 'notification') {
          expect(response.payload.id).toBe('123');
          expect(response.payload.title).toBe('Test');
          expect(response.payload.body).toBe('Test notification');
        }
      }

      for (const ws of clients) {
        ws.close();
      }
    });

    it('should send ticket state changes', async () => {
      const ws = await createClient(address);

      const messagePromise = new Promise<ServerMessage>((resolve) => {
        ws.on('message', (data: Buffer) => {
          resolve(JSON.parse(data.toString()) as ServerMessage);
        });
      });

      manager.sendTicketStateChange('ticket-123', 'todo', 'in_progress');

      const response = await messagePromise;
      expect(response.type).toBe('ticket:state');
      if (response.type === 'ticket:state') {
        expect(response.payload.ticketId).toBe('ticket-123');
        expect(response.payload.previousState).toBe('todo');
        expect(response.payload.newState).toBe('in_progress');
      }

      ws.close();
    });
  });
});

// ============================================================================
// Configuration Tests
// ============================================================================

describe('WebSocket Configuration', () => {
  it('should use default configuration', () => {
    expect(DEFAULT_WS_CONFIG.pingInterval).toBe(30_000);
    expect(DEFAULT_WS_CONFIG.connectionTimeout).toBe(60_000);
    expect(DEFAULT_WS_CONFIG.maxMessageSize).toBe(65_536);
    expect(DEFAULT_WS_CONFIG.rateLimitMaxMessages).toBe(100);
    expect(DEFAULT_WS_CONFIG.rateLimitWindow).toBe(10_000);
    expect(DEFAULT_WS_CONFIG.outputBufferLines).toBe(100);
  });

  it('should allow custom configuration', () => {
    const manager = new WebSocketManager({
      pingInterval: 5000,
      rateLimitMaxMessages: 50,
    });

    // Manager is created successfully with custom config
    expect(manager).toBeInstanceOf(WebSocketManager);
  });
});

// ============================================================================
// Singleton Tests
// ============================================================================

describe('wsManager Singleton', () => {
  it('should export a singleton instance', () => {
    expect(wsManager).toBeInstanceOf(WebSocketManager);
  });

  it('should be the same instance across imports', async () => {
    const { wsManager: wsManager2 } = await import('../../src/websocket/server.js');
    expect(wsManager).toBe(wsManager2);
  });
});

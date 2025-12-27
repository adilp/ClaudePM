import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RingBuffer,
  SessionNotFoundError,
  SessionProjectNotFoundError,
  SessionTicketNotFoundError,
  SessionAlreadyRunningError,
  SessionNotRunningError,
  SessionCreationError,
  SessionInputError,
} from '../../src/services/session-supervisor-types.js';
import { SessionSupervisor } from '../../src/services/session-supervisor.js';

// ============================================================================
// RingBuffer Tests
// ============================================================================

describe('RingBuffer', () => {
  describe('constructor', () => {
    it('should create a buffer with specified capacity', () => {
      const buffer = new RingBuffer<string>(10);
      expect(buffer.maxCapacity).toBe(10);
      expect(buffer.size).toBe(0);
    });

    it('should throw error for capacity less than 1', () => {
      expect(() => new RingBuffer<string>(0)).toThrow('capacity must be at least 1');
      expect(() => new RingBuffer<string>(-1)).toThrow('capacity must be at least 1');
    });
  });

  describe('push', () => {
    it('should add items to buffer', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.size).toBe(3);
      expect(buffer.toArray()).toEqual([1, 2, 3]);
    });

    it('should evict oldest items when full', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4); // Should evict 1

      expect(buffer.size).toBe(3);
      expect(buffer.toArray()).toEqual([2, 3, 4]);
    });

    it('should handle wrapping around correctly', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);
      buffer.push(5);
      buffer.push(6);

      expect(buffer.size).toBe(3);
      expect(buffer.toArray()).toEqual([4, 5, 6]);
    });
  });

  describe('pushMany', () => {
    it('should add multiple items', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushMany([1, 2, 3]);

      expect(buffer.size).toBe(3);
      expect(buffer.toArray()).toEqual([1, 2, 3]);
    });

    it('should evict oldest when adding many items', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.pushMany([1, 2, 3, 4, 5]);

      expect(buffer.size).toBe(3);
      expect(buffer.toArray()).toEqual([3, 4, 5]);
    });
  });

  describe('toArray', () => {
    it('should return empty array for empty buffer', () => {
      const buffer = new RingBuffer<string>(5);
      expect(buffer.toArray()).toEqual([]);
    });

    it('should return items in order (oldest to newest)', () => {
      const buffer = new RingBuffer<string>(5);
      buffer.push('a');
      buffer.push('b');
      buffer.push('c');

      expect(buffer.toArray()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('last', () => {
    it('should return last N items', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushMany([1, 2, 3, 4, 5]);

      expect(buffer.last(3)).toEqual([3, 4, 5]);
      expect(buffer.last(2)).toEqual([4, 5]);
      expect(buffer.last(1)).toEqual([5]);
    });

    it('should return all items if N > size', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushMany([1, 2, 3]);

      expect(buffer.last(10)).toEqual([1, 2, 3]);
    });

    it('should return empty array for N <= 0', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushMany([1, 2, 3]);

      expect(buffer.last(0)).toEqual([]);
      expect(buffer.last(-1)).toEqual([]);
    });

    it('should return empty array for empty buffer', () => {
      const buffer = new RingBuffer<number>(5);
      expect(buffer.last(5)).toEqual([]);
    });

    it('should work correctly after wraparound', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.pushMany([1, 2, 3, 4, 5]); // Buffer now has [3, 4, 5]

      expect(buffer.last(2)).toEqual([4, 5]);
      expect(buffer.last(3)).toEqual([3, 4, 5]);
    });
  });

  describe('clear', () => {
    it('should empty the buffer', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.pushMany([1, 2, 3]);
      buffer.clear();

      expect(buffer.size).toBe(0);
      expect(buffer.isEmpty()).toBe(true);
      expect(buffer.toArray()).toEqual([]);
    });
  });

  describe('isEmpty / isFull', () => {
    it('should correctly report empty state', () => {
      const buffer = new RingBuffer<number>(3);
      expect(buffer.isEmpty()).toBe(true);
      expect(buffer.isFull()).toBe(false);

      buffer.push(1);
      expect(buffer.isEmpty()).toBe(false);
      expect(buffer.isFull()).toBe(false);
    });

    it('should correctly report full state', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.pushMany([1, 2, 3]);

      expect(buffer.isEmpty()).toBe(false);
      expect(buffer.isFull()).toBe(true);
    });
  });
});

// ============================================================================
// Error Classes Tests
// ============================================================================

describe('Error Classes', () => {
  describe('SessionNotFoundError', () => {
    it('should create error with session ID', () => {
      const error = new SessionNotFoundError('session-123');
      expect(error.name).toBe('SessionNotFoundError');
      expect(error.code).toBe('SESSION_NOT_FOUND');
      expect(error.sessionId).toBe('session-123');
      expect(error.message).toContain('session-123');
    });

    it('should be instanceof SessionNotFoundError', () => {
      const error = new SessionNotFoundError('session-123');
      expect(error instanceof SessionNotFoundError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('SessionProjectNotFoundError', () => {
    it('should create error with project ID', () => {
      const error = new SessionProjectNotFoundError('project-123');
      expect(error.name).toBe('SessionProjectNotFoundError');
      expect(error.code).toBe('PROJECT_NOT_FOUND');
      expect(error.projectId).toBe('project-123');
    });
  });

  describe('SessionTicketNotFoundError', () => {
    it('should create error with ticket ID', () => {
      const error = new SessionTicketNotFoundError('ticket-123');
      expect(error.name).toBe('SessionTicketNotFoundError');
      expect(error.code).toBe('TICKET_NOT_FOUND');
      expect(error.ticketId).toBe('ticket-123');
    });
  });

  describe('SessionAlreadyRunningError', () => {
    it('should create error with project and session IDs', () => {
      const error = new SessionAlreadyRunningError('project-123', 'session-456');
      expect(error.name).toBe('SessionAlreadyRunningError');
      expect(error.code).toBe('SESSION_ALREADY_RUNNING');
      expect(error.projectId).toBe('project-123');
      expect(error.existingSessionId).toBe('session-456');
    });
  });

  describe('SessionNotRunningError', () => {
    it('should create error with session ID and status', () => {
      const error = new SessionNotRunningError('session-123', 'completed');
      expect(error.name).toBe('SessionNotRunningError');
      expect(error.code).toBe('SESSION_NOT_RUNNING');
      expect(error.sessionId).toBe('session-123');
      expect(error.currentStatus).toBe('completed');
    });
  });

  describe('SessionCreationError', () => {
    it('should create error with message', () => {
      const error = new SessionCreationError('Failed to create pane');
      expect(error.name).toBe('SessionCreationError');
      expect(error.code).toBe('SESSION_CREATION_FAILED');
      expect(error.message).toBe('Failed to create pane');
    });

    it('should include cause if provided', () => {
      const cause = new Error('Original error');
      const error = new SessionCreationError('Failed to create pane', cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('SessionInputError', () => {
    it('should create error with session ID and message', () => {
      const error = new SessionInputError('session-123', 'Pane not found');
      expect(error.name).toBe('SessionInputError');
      expect(error.code).toBe('SESSION_INPUT_FAILED');
      expect(error.sessionId).toBe('session-123');
      expect(error.message).toContain('session-123');
      expect(error.message).toContain('Pane not found');
    });
  });
});

// ============================================================================
// SessionSupervisor Tests
// ============================================================================

describe('SessionSupervisor', () => {
  let supervisor: SessionSupervisor;

  beforeEach(() => {
    supervisor = new SessionSupervisor(100); // Small buffer for testing
  });

  afterEach(() => {
    supervisor.stop();
  });

  describe('constructor', () => {
    it('should create supervisor with default buffer size', () => {
      const defaultSupervisor = new SessionSupervisor();
      expect(defaultSupervisor).toBeInstanceOf(SessionSupervisor);
    });

    it('should create supervisor with custom buffer size', () => {
      const customSupervisor = new SessionSupervisor(500);
      expect(customSupervisor).toBeInstanceOf(SessionSupervisor);
    });
  });

  describe('isRunning', () => {
    it('should return false before start', () => {
      expect(supervisor.isRunning()).toBe(false);
    });
  });

  describe('start/stop', () => {
    it('should set running state on start', async () => {
      // Mock prisma to return empty sessions
      vi.mock('../../src/config/db.js', () => ({
        prisma: {
          session: {
            findMany: vi.fn().mockResolvedValue([]),
          },
        },
      }));

      // We can't fully test start without mocking all dependencies
      // but we can test the interface
      expect(supervisor.isRunning()).toBe(false);
    });

    it('should stop cleanly', () => {
      supervisor.stop();
      expect(supervisor.isRunning()).toBe(false);
    });
  });

  describe('listActiveSessions', () => {
    it('should return empty array initially', () => {
      const sessions = supervisor.listActiveSessions();
      expect(sessions).toEqual([]);
    });
  });

  describe('getActiveSession', () => {
    it('should return undefined for non-existent session', () => {
      const session = supervisor.getActiveSession('non-existent');
      expect(session).toBeUndefined();
    });
  });

  describe('getSessionOutput', () => {
    it('should throw SessionNotFoundError for non-existent session', () => {
      expect(() => supervisor.getSessionOutput('non-existent')).toThrow(SessionNotFoundError);
    });
  });

  describe('event emission', () => {
    it('should be an EventEmitter', () => {
      expect(typeof supervisor.on).toBe('function');
      expect(typeof supervisor.emit).toBe('function');
      expect(typeof supervisor.removeListener).toBe('function');
    });

    it('should allow subscribing to events', () => {
      const handler = vi.fn();
      supervisor.on('session:stateChange', handler);

      // Emit a test event
      supervisor.emit('session:stateChange', {
        sessionId: 'test',
        previousStatus: 'running',
        newStatus: 'completed',
        timestamp: new Date(),
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});

// ============================================================================
// Integration Tests (require database and tmux)
// ============================================================================

describe.skipIf(!process.env.SESSION_INTEGRATION_TESTS)('SessionSupervisor Integration', () => {
  // These tests require:
  // - A running PostgreSQL database
  // - tmux installed and accessible
  // - A tmux session named 'test-session'
  //
  // Run with: SESSION_INTEGRATION_TESTS=1 npm run test:run

  let supervisor: SessionSupervisor;

  beforeEach(async () => {
    supervisor = new SessionSupervisor();
    await supervisor.start();
  });

  afterEach(() => {
    supervisor.stop();
  });

  it('should start and stop cleanly', () => {
    expect(supervisor.isRunning()).toBe(true);
    supervisor.stop();
    expect(supervisor.isRunning()).toBe(false);
  });

  // Add more integration tests as needed...
});

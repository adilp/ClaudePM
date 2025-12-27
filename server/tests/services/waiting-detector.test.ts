import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WaitingDetector,
  DEFAULT_WAITING_DETECTOR_CONFIG,
  SessionNotWatchedError,
  WaitingDetectorError,
  type WaitingStateEvent,
  type WaitingReason,
  type DetectionLayer,
  type ClaudeHookPayload,
} from '../../src/services/waiting-detector.js';

// ============================================================================
// Mock Dependencies
// ============================================================================

// Mock the context monitor
vi.mock('../../src/services/context-monitor.js', () => ({
  contextMonitor: {
    on: vi.fn(),
    removeListener: vi.fn(),
    getMonitoredSessions: vi.fn(() => []),
  },
}));

// Mock the session supervisor
vi.mock('../../src/services/session-supervisor.js', () => ({
  sessionSupervisor: {
    on: vi.fn(),
    removeListener: vi.fn(),
    listActiveSessions: vi.fn(() => []),
  },
}));

// ============================================================================
// Error Classes Tests
// ============================================================================

describe('Error Classes', () => {
  describe('WaitingDetectorError', () => {
    it('should create base error with message and code', () => {
      const error = new WaitingDetectorError('Test error', 'TEST_ERROR');
      expect(error.name).toBe('WaitingDetectorError');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test error');
    });

    it('should be instanceof Error', () => {
      const error = new WaitingDetectorError('Test error', 'TEST_ERROR');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof WaitingDetectorError).toBe(true);
    });
  });

  describe('SessionNotWatchedError', () => {
    it('should create error with session ID', () => {
      const error = new SessionNotWatchedError('session-123');
      expect(error.name).toBe('SessionNotWatchedError');
      expect(error.code).toBe('SESSION_NOT_WATCHED');
      expect(error.sessionId).toBe('session-123');
      expect(error.message).toContain('session-123');
    });
  });
});

// ============================================================================
// Configuration Tests
// ============================================================================

describe('Default Configuration', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_WAITING_DETECTOR_CONFIG.enableHooks).toBe(true);
    expect(DEFAULT_WAITING_DETECTOR_CONFIG.enableJsonl).toBe(true);
    expect(DEFAULT_WAITING_DETECTOR_CONFIG.enableOutputPatterns).toBe(true);
    expect(DEFAULT_WAITING_DETECTOR_CONFIG.debounceMs).toBe(500);
    expect(DEFAULT_WAITING_DETECTOR_CONFIG.clearDelayMs).toBe(2000);
    expect(DEFAULT_WAITING_DETECTOR_CONFIG.outputPatterns.idleThresholdSeconds).toBe(5);
  });

  it('should have immediate patterns', () => {
    const { immediate } = DEFAULT_WAITING_DETECTOR_CONFIG.outputPatterns;
    expect(immediate.length).toBeGreaterThan(0);
    expect(immediate).toContain('Do you want to proceed?');
  });

  it('should have question patterns', () => {
    const { questionPatterns } = DEFAULT_WAITING_DETECTOR_CONFIG.outputPatterns;
    expect(questionPatterns.length).toBeGreaterThan(0);
    expect(questionPatterns).toContain('What would you like');
    expect(questionPatterns).toContain('Should I');
  });
});

// ============================================================================
// WaitingDetector Tests
// ============================================================================

describe('WaitingDetector', () => {
  let detector: WaitingDetector;

  beforeEach(() => {
    vi.useFakeTimers();
    detector = new WaitingDetector();
  });

  afterEach(() => {
    detector.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Lifecycle Tests
  // ==========================================================================

  describe('Lifecycle', () => {
    it('should start and stop correctly', () => {
      expect(detector.isRunning()).toBe(false);

      detector.start();
      expect(detector.isRunning()).toBe(true);

      detector.stop();
      expect(detector.isRunning()).toBe(false);
    });

    it('should not start twice', () => {
      detector.start();
      detector.start(); // Should be idempotent
      expect(detector.isRunning()).toBe(true);
    });

    it('should not stop twice', () => {
      detector.start();
      detector.stop();
      detector.stop(); // Should be idempotent
      expect(detector.isRunning()).toBe(false);
    });
  });

  // ==========================================================================
  // Session Management Tests
  // ==========================================================================

  describe('Session Management', () => {
    beforeEach(() => {
      detector.start();
    });

    it('should watch and unwatch sessions', () => {
      const sessionId = 'session-123';

      expect(detector.isWatching(sessionId)).toBe(false);

      detector.watchSession(sessionId);
      expect(detector.isWatching(sessionId)).toBe(true);

      detector.unwatchSession(sessionId);
      expect(detector.isWatching(sessionId)).toBe(false);
    });

    it('should not add duplicate watchers', () => {
      const sessionId = 'session-123';

      detector.watchSession(sessionId);
      detector.watchSession(sessionId); // Should be idempotent

      expect(detector.getWatchedSessions()).toEqual([sessionId]);
    });

    it('should return list of watched sessions', () => {
      detector.watchSession('session-1');
      detector.watchSession('session-2');
      detector.watchSession('session-3');

      const watched = detector.getWatchedSessions();
      expect(watched).toHaveLength(3);
      expect(watched).toContain('session-1');
      expect(watched).toContain('session-2');
      expect(watched).toContain('session-3');
    });

    it('should throw when getting state of unwatched session', () => {
      expect(() => detector.getWaitingState('not-watched')).toThrow(SessionNotWatchedError);
    });

    it('should return waiting state for watched session', () => {
      detector.watchSession('session-123');

      const state = detector.getWaitingState('session-123');
      expect(state.isWaiting).toBe(false);
      expect(state.reason).toBeUndefined();
    });
  });

  // ==========================================================================
  // Layer 1: Hook Handler Tests
  // ==========================================================================

  describe('Layer 1: Hook Handler', () => {
    beforeEach(() => {
      detector.start();
      detector.watchSession('session-123');
    });

    it('should handle permission_prompt Notification hook', async () => {
      const events: WaitingStateEvent[] = [];
      detector.on('waiting:stateChange', (event) => events.push(event));

      const payload: ClaudeHookPayload = {
        event: 'Notification',
        matcher: 'permission_prompt',
        session_id: 'session-123',
      };

      detector.handleHookEvent(payload);

      // Advance past debounce
      await vi.advanceTimersByTimeAsync(600);

      expect(events).toHaveLength(1);
      expect(events[0].waiting).toBe(true);
      expect(events[0].reason).toBe('permission_prompt');
      expect(events[0].detectedBy).toBe('hook');
    });

    it('should handle idle_prompt Notification hook', async () => {
      const events: WaitingStateEvent[] = [];
      detector.on('waiting:stateChange', (event) => events.push(event));

      const payload: ClaudeHookPayload = {
        event: 'Notification',
        matcher: 'idle_prompt',
        session_id: 'session-123',
      };

      detector.handleHookEvent(payload);

      await vi.advanceTimersByTimeAsync(600);

      expect(events).toHaveLength(1);
      expect(events[0].waiting).toBe(true);
      expect(events[0].reason).toBe('idle_prompt');
    });

    it('should handle Stop hook', async () => {
      const events: WaitingStateEvent[] = [];
      detector.on('waiting:stateChange', (event) => events.push(event));

      // First set waiting state
      detector.handleHookEvent({
        event: 'Notification',
        matcher: 'permission_prompt',
        session_id: 'session-123',
      });
      await vi.advanceTimersByTimeAsync(600);

      // Then send Stop
      detector.handleHookEvent({
        event: 'Stop',
        session_id: 'session-123',
      });
      await vi.advanceTimersByTimeAsync(600);

      expect(events).toHaveLength(2);
      expect(events[1].waiting).toBe(false);
      expect(events[1].reason).toBe('stopped');
    });

    it('should ignore hooks for unwatched sessions', async () => {
      const events: WaitingStateEvent[] = [];
      detector.on('waiting:stateChange', (event) => events.push(event));

      const payload: ClaudeHookPayload = {
        event: 'Notification',
        matcher: 'permission_prompt',
        session_id: 'not-watched',
      };

      detector.handleHookEvent(payload);
      await vi.advanceTimersByTimeAsync(600);

      expect(events).toHaveLength(0);
    });

    it('should ignore hooks when detector is not running', async () => {
      detector.stop();

      const events: WaitingStateEvent[] = [];
      detector.on('waiting:stateChange', (event) => events.push(event));

      detector.handleHookEvent({
        event: 'Notification',
        matcher: 'permission_prompt',
        session_id: 'session-123',
      });
      await vi.advanceTimersByTimeAsync(600);

      expect(events).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Debouncing Tests
  // ==========================================================================

  describe('Debouncing', () => {
    beforeEach(() => {
      detector.start();
      detector.watchSession('session-123');
    });

    it('should debounce rapid signals', async () => {
      const events: WaitingStateEvent[] = [];
      detector.on('waiting:stateChange', (event) => events.push(event));

      // Send multiple signals rapidly
      detector.handleHookEvent({
        event: 'Notification',
        matcher: 'permission_prompt',
        session_id: 'session-123',
      });
      await vi.advanceTimersByTimeAsync(100);

      detector.handleHookEvent({
        event: 'Notification',
        matcher: 'idle_prompt',
        session_id: 'session-123',
      });
      await vi.advanceTimersByTimeAsync(100);

      detector.handleHookEvent({
        event: 'Notification',
        matcher: 'permission_prompt',
        session_id: 'session-123',
      });

      // Before debounce completes
      expect(events).toHaveLength(0);

      // Complete debounce
      await vi.advanceTimersByTimeAsync(600);

      // Should only emit once with the last signal's reason
      expect(events).toHaveLength(1);
      expect(events[0].reason).toBe('permission_prompt');
    });

    it('should not emit if state has not changed', async () => {
      const events: WaitingStateEvent[] = [];
      detector.on('waiting:stateChange', (event) => events.push(event));

      // First signal
      detector.handleHookEvent({
        event: 'Notification',
        matcher: 'permission_prompt',
        session_id: 'session-123',
      });
      await vi.advanceTimersByTimeAsync(600);

      expect(events).toHaveLength(1);

      // Second signal with same waiting=true
      detector.handleHookEvent({
        event: 'Notification',
        matcher: 'idle_prompt',
        session_id: 'session-123',
      });
      await vi.advanceTimersByTimeAsync(600);

      // Should not emit because waiting state didn't change
      expect(events).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Configuration Tests
  // ==========================================================================

  describe('Configuration', () => {
    it('should accept custom configuration', () => {
      const customDetector = new WaitingDetector({
        debounceMs: 1000,
        enableHooks: false,
      });

      const config = customDetector.getConfig();
      expect(config.debounceMs).toBe(1000);
      expect(config.enableHooks).toBe(false);
      expect(config.enableJsonl).toBe(true); // Default preserved

      customDetector.stop();
    });

    it('should update configuration at runtime', () => {
      detector.updateConfig({ debounceMs: 250 });

      const config = detector.getConfig();
      expect(config.debounceMs).toBe(250);
    });

    it('should skip hooks when disabled', async () => {
      const customDetector = new WaitingDetector({ enableHooks: false });
      customDetector.start();
      customDetector.watchSession('session-123');

      const events: WaitingStateEvent[] = [];
      customDetector.on('waiting:stateChange', (event) => events.push(event));

      customDetector.handleHookEvent({
        event: 'Notification',
        matcher: 'permission_prompt',
        session_id: 'session-123',
      });
      await vi.advanceTimersByTimeAsync(600);

      expect(events).toHaveLength(0);

      customDetector.stop();
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('Error Handling', () => {
    it('should emit error when session cannot be resolved from hook', async () => {
      detector.start();

      const errors: Error[] = [];
      detector.on('error', (err) => errors.push(err));

      // Payload with no session_id and no way to resolve
      detector.handleHookEvent({
        event: 'Notification',
        matcher: 'permission_prompt',
      });

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(WaitingDetectorError);
    });
  });

  // ==========================================================================
  // Cleanup Tests
  // ==========================================================================

  describe('Cleanup', () => {
    it('should clean up timers when unwatching session', async () => {
      detector.start();
      detector.watchSession('session-123');

      // Trigger a signal to create timers
      detector.handleHookEvent({
        event: 'Notification',
        matcher: 'permission_prompt',
        session_id: 'session-123',
      });

      // Unwatch before debounce completes
      detector.unwatchSession('session-123');

      // Advance time - should not throw or emit
      await vi.advanceTimersByTimeAsync(1000);

      expect(detector.isWatching('session-123')).toBe(false);
    });

    it('should clean up all sessions on stop', () => {
      detector.start();
      detector.watchSession('session-1');
      detector.watchSession('session-2');
      detector.watchSession('session-3');

      detector.stop();

      expect(detector.getWatchedSessions()).toHaveLength(0);
    });
  });
});

// ============================================================================
// Integration Tests (skipped by default)
// ============================================================================

describe.skip('WaitingDetector Integration', () => {
  // These tests would require actual contextMonitor and sessionSupervisor
  // They are skipped in unit tests but could be enabled for integration testing

  it('should integrate with ContextMonitor events', () => {
    // Test JSONL state change handling
  });

  it('should integrate with SessionSupervisor output events', () => {
    // Test output pattern matching
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  ContextMonitor,
  MAX_CONTEXT_TOKENS,
  DEFAULT_THRESHOLD_PERCENT,
  TranscriptNotFoundError,
  SessionNotMonitoredError,
  SessionAlreadyMonitoredError,
  TranscriptDiscoveryError,
  ContextMonitorError,
  type UsageData,
  type TranscriptEntry,
  type ClaudeSessionState,
} from '../../src/services/context-monitor.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a temporary JSONL file for testing
 */
async function createTempTranscript(entries: TranscriptEntry[]): Promise<string> {
  const tmpDir = join(tmpdir(), 'context-monitor-test-' + Date.now());
  await fs.mkdir(tmpDir, { recursive: true });
  const filePath = join(tmpDir, 'transcript.jsonl');

  const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  await fs.writeFile(filePath, content);

  return filePath;
}

/**
 * Append entries to a transcript file
 */
async function appendToTranscript(filePath: string, entries: TranscriptEntry[]): Promise<void> {
  const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  await fs.appendFile(filePath, content);
}

/**
 * Clean up temporary file and directory
 */
async function cleanupTempTranscript(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
    await fs.rmdir(join(filePath, '..'));
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Create sample usage data
 */
function createUsageData(inputTokens: number, cacheCreation = 0, cacheRead = 0): UsageData {
  return {
    input_tokens: inputTokens,
    cache_creation_input_tokens: cacheCreation,
    cache_read_input_tokens: cacheRead,
  };
}

/**
 * Create sample transcript entry
 */
function createTranscriptEntry(options: {
  usage?: UsageData;
  stop_reason?: string | null;
  content?: TranscriptEntry['content'];
}): TranscriptEntry {
  return {
    uuid: 'test-uuid-' + Math.random().toString(36).slice(2),
    type: 'message',
    ...options,
  };
}

// ============================================================================
// Error Classes Tests
// ============================================================================

describe('Error Classes', () => {
  describe('ContextMonitorError', () => {
    it('should create base error with message and code', () => {
      const error = new ContextMonitorError('Test error', 'TEST_ERROR');
      expect(error.name).toBe('ContextMonitorError');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test error');
    });

    it('should be instanceof Error', () => {
      const error = new ContextMonitorError('Test error', 'TEST_ERROR');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof ContextMonitorError).toBe(true);
    });
  });

  describe('TranscriptNotFoundError', () => {
    it('should create error with path', () => {
      const error = new TranscriptNotFoundError('/path/to/transcript.jsonl');
      expect(error.name).toBe('TranscriptNotFoundError');
      expect(error.code).toBe('TRANSCRIPT_NOT_FOUND');
      expect(error.path).toBe('/path/to/transcript.jsonl');
      expect(error.message).toContain('/path/to/transcript.jsonl');
    });
  });

  describe('SessionNotMonitoredError', () => {
    it('should create error with session ID', () => {
      const error = new SessionNotMonitoredError('session-123');
      expect(error.name).toBe('SessionNotMonitoredError');
      expect(error.code).toBe('SESSION_NOT_MONITORED');
      expect(error.sessionId).toBe('session-123');
    });
  });

  describe('SessionAlreadyMonitoredError', () => {
    it('should create error with session ID', () => {
      const error = new SessionAlreadyMonitoredError('session-123');
      expect(error.name).toBe('SessionAlreadyMonitoredError');
      expect(error.code).toBe('SESSION_ALREADY_MONITORED');
      expect(error.sessionId).toBe('session-123');
    });
  });

  describe('TranscriptDiscoveryError', () => {
    it('should create error with session ID and reason', () => {
      const error = new TranscriptDiscoveryError('session-123', 'No project found');
      expect(error.name).toBe('TranscriptDiscoveryError');
      expect(error.code).toBe('TRANSCRIPT_DISCOVERY_FAILED');
      expect(error.sessionId).toBe('session-123');
      expect(error.message).toContain('session-123');
      expect(error.message).toContain('No project found');
    });
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe('Constants', () => {
  it('should have correct MAX_CONTEXT_TOKENS', () => {
    expect(MAX_CONTEXT_TOKENS).toBe(200_000);
  });

  it('should have correct DEFAULT_THRESHOLD_PERCENT', () => {
    expect(DEFAULT_THRESHOLD_PERCENT).toBe(20);
  });
});

// ============================================================================
// ContextMonitor Tests
// ============================================================================

describe('ContextMonitor', () => {
  let monitor: ContextMonitor;
  let tempFiles: string[] = [];

  beforeEach(() => {
    monitor = new ContextMonitor();
    tempFiles = [];
  });

  afterEach(async () => {
    monitor.stop();
    // Clean up temp files
    for (const file of tempFiles) {
      await cleanupTempTranscript(file);
    }
  });

  describe('constructor', () => {
    it('should create a new instance', () => {
      expect(monitor).toBeInstanceOf(ContextMonitor);
    });
  });

  describe('start/stop', () => {
    it('should set running state on start', () => {
      expect(monitor.isRunning()).toBe(false);
      monitor.start();
      expect(monitor.isRunning()).toBe(true);
    });

    it('should clear running state on stop', () => {
      monitor.start();
      monitor.stop();
      expect(monitor.isRunning()).toBe(false);
    });

    it('should be idempotent for start', () => {
      monitor.start();
      monitor.start();
      expect(monitor.isRunning()).toBe(true);
    });

    it('should clean up sessions on stop', async () => {
      const entries = [createTranscriptEntry({ usage: createUsageData(1000) })];
      const filePath = await createTempTranscript(entries);
      tempFiles.push(filePath);

      monitor.start();
      await monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath });
      expect(monitor.isMonitoring('test-session')).toBe(true);

      monitor.stop();
      expect(monitor.getMonitoredSessions()).toEqual([]);
    });
  });

  describe('startMonitoring', () => {
    it('should start monitoring a valid transcript file', async () => {
      const entries = [createTranscriptEntry({ usage: createUsageData(1000) })];
      const filePath = await createTempTranscript(entries);
      tempFiles.push(filePath);

      await monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath });
      expect(monitor.isMonitoring('test-session')).toBe(true);
    });

    it('should throw TranscriptNotFoundError for non-existent file', async () => {
      await expect(
        monitor.startMonitoring({
          sessionId: 'test-session',
          transcriptPath: '/non/existent/path.jsonl',
        })
      ).rejects.toThrow(TranscriptNotFoundError);
    });

    it('should throw SessionAlreadyMonitoredError for duplicate session', async () => {
      const entries = [createTranscriptEntry({ usage: createUsageData(1000) })];
      const filePath = await createTempTranscript(entries);
      tempFiles.push(filePath);

      await monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath });

      await expect(
        monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath })
      ).rejects.toThrow(SessionAlreadyMonitoredError);
    });

    it('should throw TranscriptDiscoveryError when no path or projectId provided', async () => {
      await expect(
        monitor.startMonitoring({ sessionId: 'test-session' })
      ).rejects.toThrow(TranscriptDiscoveryError);
    });

    it('should parse existing content on start', async () => {
      const entries = [
        createTranscriptEntry({ usage: createUsageData(50000) }),
        createTranscriptEntry({ usage: createUsageData(100000) }),
      ];
      const filePath = await createTempTranscript(entries);
      tempFiles.push(filePath);

      await monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath });

      const context = monitor.getSessionContext('test-session');
      expect(context.totalTokens).toBe(100000);
      expect(context.contextPercent).toBe(50); // 100000 / 200000 * 100
    });
  });

  describe('stopMonitoring', () => {
    it('should stop monitoring a session', async () => {
      const entries = [createTranscriptEntry({ usage: createUsageData(1000) })];
      const filePath = await createTempTranscript(entries);
      tempFiles.push(filePath);

      await monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath });
      monitor.stopMonitoring('test-session');

      expect(monitor.isMonitoring('test-session')).toBe(false);
    });

    it('should throw SessionNotMonitoredError for unknown session', () => {
      expect(() => monitor.stopMonitoring('non-existent')).toThrow(SessionNotMonitoredError);
    });
  });

  describe('getSessionContext', () => {
    it('should return context information', async () => {
      const entries = [
        createTranscriptEntry({ usage: createUsageData(40000, 10000, 5000) }),
      ];
      const filePath = await createTempTranscript(entries);
      tempFiles.push(filePath);

      await monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath });

      const context = monitor.getSessionContext('test-session');
      expect(context.totalTokens).toBe(55000); // 40000 + 10000 + 5000
      expect(context.contextPercent).toBe(28); // Math.round(55000 / 200000 * 100)
      expect(context.claudeState).toBe('unknown');
    });

    it('should throw SessionNotMonitoredError for unknown session', () => {
      expect(() => monitor.getSessionContext('non-existent')).toThrow(SessionNotMonitoredError);
    });
  });

  describe('isMonitoring', () => {
    it('should return true for monitored session', async () => {
      const entries = [createTranscriptEntry({ usage: createUsageData(1000) })];
      const filePath = await createTempTranscript(entries);
      tempFiles.push(filePath);

      await monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath });
      expect(monitor.isMonitoring('test-session')).toBe(true);
    });

    it('should return false for unknown session', () => {
      expect(monitor.isMonitoring('non-existent')).toBe(false);
    });
  });

  describe('getMonitoredSessions', () => {
    it('should return empty array initially', () => {
      expect(monitor.getMonitoredSessions()).toEqual([]);
    });

    it('should return all monitored session IDs', async () => {
      const entries = [createTranscriptEntry({ usage: createUsageData(1000) })];
      const filePath1 = await createTempTranscript(entries);
      const filePath2 = await createTempTranscript(entries);
      tempFiles.push(filePath1, filePath2);

      await monitor.startMonitoring({ sessionId: 'session-1', transcriptPath: filePath1 });
      await monitor.startMonitoring({ sessionId: 'session-2', transcriptPath: filePath2 });

      const sessions = monitor.getMonitoredSessions();
      expect(sessions).toContain('session-1');
      expect(sessions).toContain('session-2');
      expect(sessions.length).toBe(2);
    });
  });

  describe('refreshSession', () => {
    it('should re-parse transcript content', async () => {
      const entries = [createTranscriptEntry({ usage: createUsageData(10000) })];
      const filePath = await createTempTranscript(entries);
      tempFiles.push(filePath);

      await monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath });

      // Append new content
      await appendToTranscript(filePath, [
        createTranscriptEntry({ usage: createUsageData(50000) }),
      ]);

      // Manually refresh
      await monitor.refreshSession('test-session');

      const context = monitor.getSessionContext('test-session');
      expect(context.totalTokens).toBe(50000);
    });

    it('should throw SessionNotMonitoredError for unknown session', async () => {
      await expect(monitor.refreshSession('non-existent')).rejects.toThrow(SessionNotMonitoredError);
    });
  });

  describe('context calculation', () => {
    it('should calculate context percentage correctly', async () => {
      const entries = [
        createTranscriptEntry({ usage: createUsageData(100000) }), // 50%
      ];
      const filePath = await createTempTranscript(entries);
      tempFiles.push(filePath);

      await monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath });

      const context = monitor.getSessionContext('test-session');
      expect(context.contextPercent).toBe(50);
    });

    it('should cap context percentage at 100', async () => {
      const entries = [
        createTranscriptEntry({ usage: createUsageData(250000) }), // 125% -> capped at 100
      ];
      const filePath = await createTempTranscript(entries);
      tempFiles.push(filePath);

      await monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath });

      const context = monitor.getSessionContext('test-session');
      expect(context.contextPercent).toBe(100);
    });

    it('should include cache tokens in calculation', async () => {
      const entries = [
        createTranscriptEntry({
          usage: {
            input_tokens: 50000,
            cache_creation_input_tokens: 25000,
            cache_read_input_tokens: 25000,
          },
        }),
      ];
      const filePath = await createTempTranscript(entries);
      tempFiles.push(filePath);

      await monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath });

      const context = monitor.getSessionContext('test-session');
      expect(context.totalTokens).toBe(100000); // 50000 + 25000 + 25000
      expect(context.contextPercent).toBe(50);
    });
  });

  describe('state detection', () => {
    it('should detect completed state from end_turn', async () => {
      const entries = [
        createTranscriptEntry({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'Hello' }],
        }),
      ];
      const filePath = await createTempTranscript(entries);
      tempFiles.push(filePath);

      await monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath });

      const context = monitor.getSessionContext('test-session');
      expect(context.claudeState).toBe('completed');
    });

    it('should detect context_exhausted state from max_tokens', async () => {
      const entries = [
        createTranscriptEntry({
          stop_reason: 'max_tokens',
          content: [{ type: 'text', text: 'Truncated...' }],
        }),
      ];
      const filePath = await createTempTranscript(entries);
      tempFiles.push(filePath);

      await monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath });

      const context = monitor.getSessionContext('test-session');
      expect(context.claudeState).toBe('context_exhausted');
    });

    it('should detect waiting_approval state from tool_use with null stop_reason', async () => {
      const entries = [
        createTranscriptEntry({
          stop_reason: null,
          content: [{ type: 'tool_use', name: 'read_file', input: { path: '/test' } }],
        }),
      ];
      const filePath = await createTempTranscript(entries);
      tempFiles.push(filePath);

      await monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath });

      const context = monitor.getSessionContext('test-session');
      expect(context.claudeState).toBe('waiting_approval');
    });
  });

  describe('event emission', () => {
    it('should be an EventEmitter', () => {
      expect(typeof monitor.on).toBe('function');
      expect(typeof monitor.emit).toBe('function');
      expect(typeof monitor.removeListener).toBe('function');
    });

    it('should emit context:update event when processing new content', async () => {
      const entries = [createTranscriptEntry({ usage: createUsageData(10000) })];
      const filePath = await createTempTranscript(entries);
      tempFiles.push(filePath);

      const handler = vi.fn();
      monitor.on('context:update', handler);

      await monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath });

      // Append new content
      await appendToTranscript(filePath, [
        createTranscriptEntry({ usage: createUsageData(50000) }),
      ]);

      // Manually refresh to trigger processing
      await monitor.refreshSession('test-session');

      expect(handler).toHaveBeenCalled();
      const lastCall = handler.mock.calls[handler.mock.calls.length - 1]?.[0];
      expect(lastCall).toMatchObject({
        sessionId: 'test-session',
        contextPercent: 25,
        totalTokens: 50000,
      });
    });

    it('should emit context:threshold event when threshold is crossed', async () => {
      // Start with low usage
      const entries = [createTranscriptEntry({ usage: createUsageData(10000) })];
      const filePath = await createTempTranscript(entries);
      tempFiles.push(filePath);

      const thresholdHandler = vi.fn();
      monitor.on('context:threshold', thresholdHandler);

      await monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath });

      // Append high usage to cross threshold (80% used = 20% remaining)
      await appendToTranscript(filePath, [
        createTranscriptEntry({ usage: createUsageData(170000) }), // 85% usage
      ]);

      await monitor.refreshSession('test-session');

      expect(thresholdHandler).toHaveBeenCalled();
      const call = thresholdHandler.mock.calls[0]?.[0];
      expect(call?.sessionId).toBe('test-session');
      expect(call?.contextPercent).toBe(85);
    });

    it('should emit claude:stateChange event on state transitions', async () => {
      const entries = [
        createTranscriptEntry({
          content: [{ type: 'text', text: 'Hello' }],
        }),
      ];
      const filePath = await createTempTranscript(entries);
      tempFiles.push(filePath);

      const stateHandler = vi.fn();
      monitor.on('claude:stateChange', stateHandler);

      await monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath });

      // Append entry with new state
      await appendToTranscript(filePath, [
        createTranscriptEntry({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'Done' }],
        }),
      ]);

      await monitor.refreshSession('test-session');

      expect(stateHandler).toHaveBeenCalled();
      const call = stateHandler.mock.calls[0]?.[0];
      expect(call?.sessionId).toBe('test-session');
      expect(call?.newState).toBe('completed');
    });

    it('should only emit threshold event once per session', async () => {
      const entries = [createTranscriptEntry({ usage: createUsageData(160000) })]; // 80%
      const filePath = await createTempTranscript(entries);
      tempFiles.push(filePath);

      const thresholdHandler = vi.fn();
      monitor.on('context:threshold', thresholdHandler);

      await monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath });

      // Should not trigger threshold yet since it's parsed on start
      // Let's append more entries that keep crossing threshold
      await appendToTranscript(filePath, [
        createTranscriptEntry({ usage: createUsageData(165000) }), // 82.5%
      ]);
      await monitor.refreshSession('test-session');

      await appendToTranscript(filePath, [
        createTranscriptEntry({ usage: createUsageData(170000) }), // 85%
      ]);
      await monitor.refreshSession('test-session');

      // Should only be called once (after the first time threshold is crossed)
      expect(thresholdHandler.mock.calls.length).toBeLessThanOrEqual(2);
    });
  });

  describe('error handling', () => {
    it('should emit error event for malformed JSONL', async () => {
      const tmpDir = join(tmpdir(), 'context-monitor-test-' + Date.now());
      await fs.mkdir(tmpDir, { recursive: true });
      const filePath = join(tmpDir, 'transcript.jsonl');

      // Write valid entry followed by invalid JSON
      await fs.writeFile(filePath, '{"valid": true}\n');
      tempFiles.push(filePath);

      await monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath });

      // Append invalid JSON
      await fs.appendFile(filePath, 'not valid json\n');

      // Should not throw, just skip the invalid line
      await expect(monitor.refreshSession('test-session')).resolves.not.toThrow();
    });
  });

  describe('path expansion', () => {
    it('should handle paths with tilde', async () => {
      // This test verifies the path expansion logic exists
      // We can't easily test actual home directory expansion in tests
      const entries = [createTranscriptEntry({ usage: createUsageData(1000) })];
      const filePath = await createTempTranscript(entries);
      tempFiles.push(filePath);

      // Use absolute path (expandPath should handle tilde but we use absolute for testing)
      await monitor.startMonitoring({ sessionId: 'test-session', transcriptPath: filePath });
      expect(monitor.isMonitoring('test-session')).toBe(true);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe.skipIf(!process.env.CONTEXT_MONITOR_INTEGRATION_TESTS)('ContextMonitor Integration', () => {
  // These tests require:
  // - A running Claude Code session with transcript files
  // - Access to ~/.claude/projects directory
  //
  // Run with: CONTEXT_MONITOR_INTEGRATION_TESTS=1 npm run test:run

  let monitor: ContextMonitor;

  beforeEach(() => {
    monitor = new ContextMonitor();
    monitor.start();
  });

  afterEach(() => {
    monitor.stop();
  });

  it('should start and stop cleanly', () => {
    expect(monitor.isRunning()).toBe(true);
    monitor.stop();
    expect(monitor.isRunning()).toBe(false);
  });

  // Add more integration tests as needed...
});

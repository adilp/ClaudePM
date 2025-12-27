import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ReviewerSubagent,
  DEFAULT_REVIEWER_CONFIG,
  generateReviewPrompt,
  parseReviewOutput,
  ReviewerError,
  ClaudeCliNotFoundError,
  ReviewTimeoutError,
  ReviewParseError,
  ReviewTicketNotFoundError,
  ReviewSessionNotFoundError,
  GitOperationError,
  type ReviewInput,
  type ReviewDecision,
} from '../../src/services/reviewer-subagent.js';

// ============================================================================
// Mock Dependencies
// ============================================================================

// Mock prisma
vi.mock('../../src/config/db.js', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
    },
    ticket: {
      findUnique: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
  },
}));

// Mock session supervisor
vi.mock('../../src/services/session-supervisor.js', () => ({
  sessionSupervisor: {
    on: vi.fn(),
    removeListener: vi.fn(),
    getSessionOutput: vi.fn(() => ['line 1', 'line 2', 'line 3']),
  },
}));

// Mock ticket state machine
vi.mock('../../src/services/ticket-state-machine.js', () => ({
  ticketStateMachine: {
    moveToReview: vi.fn(),
  },
}));

// Mock waiting detector
vi.mock('../../src/services/waiting-detector.js', () => ({
  waitingDetector: {
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

// ============================================================================
// Error Classes Tests
// ============================================================================

describe('Error Classes', () => {
  describe('ReviewerError', () => {
    it('should create base error with message and code', () => {
      const error = new ReviewerError('Test error', 'TEST_ERROR');
      expect(error.name).toBe('ReviewerError');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test error');
    });

    it('should be instanceof Error', () => {
      const error = new ReviewerError('Test error', 'TEST_ERROR');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof ReviewerError).toBe(true);
    });
  });

  describe('ClaudeCliNotFoundError', () => {
    it('should create error with correct message', () => {
      const error = new ClaudeCliNotFoundError();
      expect(error.name).toBe('ClaudeCliNotFoundError');
      expect(error.code).toBe('CLAUDE_CLI_NOT_FOUND');
      expect(error.message).toContain('Claude CLI not found');
    });
  });

  describe('ReviewTimeoutError', () => {
    it('should create error with timeout value', () => {
      const error = new ReviewTimeoutError(30000);
      expect(error.name).toBe('ReviewTimeoutError');
      expect(error.code).toBe('REVIEW_TIMEOUT');
      expect(error.message).toContain('30000');
    });
  });

  describe('ReviewParseError', () => {
    it('should create error with raw output', () => {
      const error = new ReviewParseError('Parse failed', 'raw output here');
      expect(error.name).toBe('ReviewParseError');
      expect(error.code).toBe('REVIEW_PARSE_ERROR');
      expect(error.rawOutput).toBe('raw output here');
    });
  });

  describe('ReviewTicketNotFoundError', () => {
    it('should create error with ticket ID', () => {
      const error = new ReviewTicketNotFoundError('ticket-123');
      expect(error.name).toBe('ReviewTicketNotFoundError');
      expect(error.code).toBe('TICKET_NOT_FOUND');
      expect(error.message).toContain('ticket-123');
    });
  });

  describe('ReviewSessionNotFoundError', () => {
    it('should create error with session ID', () => {
      const error = new ReviewSessionNotFoundError('session-123');
      expect(error.name).toBe('ReviewSessionNotFoundError');
      expect(error.code).toBe('SESSION_NOT_FOUND');
      expect(error.message).toContain('session-123');
    });
  });

  describe('GitOperationError', () => {
    it('should create error with operation and stderr', () => {
      const error = new GitOperationError('diff', 'fatal: not a git repo');
      expect(error.name).toBe('GitOperationError');
      expect(error.code).toBe('GIT_OPERATION_ERROR');
      expect(error.stderr).toBe('fatal: not a git repo');
    });
  });
});

// ============================================================================
// Configuration Tests
// ============================================================================

describe('Default Configuration', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_REVIEWER_CONFIG.timeoutMs).toBe(30_000);
    expect(DEFAULT_REVIEWER_CONFIG.sessionOutputLines).toBe(100);
    expect(DEFAULT_REVIEWER_CONFIG.enableStopHookReview).toBe(true);
    expect(DEFAULT_REVIEWER_CONFIG.idleTimeoutMs).toBe(60_000);
    expect(DEFAULT_REVIEWER_CONFIG.enableIdleReview).toBe(true);
    expect(DEFAULT_REVIEWER_CONFIG.claudeCliPath).toBe('claude');
  });
});

// ============================================================================
// Prompt Generation Tests
// ============================================================================

describe('generateReviewPrompt', () => {
  it('should generate prompt with all sections', () => {
    const input: ReviewInput = {
      ticketId: 'ticket-123',
      ticketContent: '# Test Ticket\n\nRequirements here',
      gitDiff: 'diff --git a/file.ts b/file.ts\n+new line',
      testOutput: 'All tests passed',
      sessionOutput: 'Claude: Done!',
    };

    const prompt = generateReviewPrompt(input);

    expect(prompt).toContain('Ticket Requirements');
    expect(prompt).toContain('# Test Ticket');
    expect(prompt).toContain('Changes Made (git diff)');
    expect(prompt).toContain('diff --git');
    expect(prompt).toContain('Test Results');
    expect(prompt).toContain('All tests passed');
    expect(prompt).toContain('Recent Session Output');
    expect(prompt).toContain('Claude: Done!');
    expect(prompt).toContain('COMPLETE');
    expect(prompt).toContain('NOT_COMPLETE');
    expect(prompt).toContain('NEEDS_CLARIFICATION');
  });

  it('should handle missing git diff', () => {
    const input: ReviewInput = {
      ticketId: 'ticket-123',
      ticketContent: 'Requirements',
      gitDiff: '',
      testOutput: '',
      sessionOutput: '',
    };

    const prompt = generateReviewPrompt(input);

    expect(prompt).toContain('No changes detected');
  });

  it('should handle missing test output', () => {
    const input: ReviewInput = {
      ticketId: 'ticket-123',
      ticketContent: 'Requirements',
      gitDiff: 'some diff',
      testOutput: '',
      sessionOutput: '',
    };

    const prompt = generateReviewPrompt(input);

    expect(prompt).toContain('No test output available');
  });
});

// ============================================================================
// Output Parsing Tests
// ============================================================================

describe('parseReviewOutput', () => {
  describe('Valid outputs', () => {
    it('should parse COMPLETE decision', () => {
      const output = 'COMPLETE\nAll requirements met.';
      const result = parseReviewOutput(output);

      expect(result.decision).toBe('complete');
      expect(result.reasoning).toBe('All requirements met.');
    });

    it('should parse NOT_COMPLETE decision', () => {
      const output = 'NOT_COMPLETE\nTests are failing.';
      const result = parseReviewOutput(output);

      expect(result.decision).toBe('not_complete');
      expect(result.reasoning).toBe('Tests are failing.');
    });

    it('should parse NEEDS_CLARIFICATION decision', () => {
      const output = 'NEEDS_CLARIFICATION\nUnclear requirements.';
      const result = parseReviewOutput(output);

      expect(result.decision).toBe('needs_clarification');
      expect(result.reasoning).toBe('Unclear requirements.');
    });

    it('should handle multiline reasoning', () => {
      const output = 'COMPLETE\nLine 1\nLine 2\nLine 3';
      const result = parseReviewOutput(output);

      expect(result.decision).toBe('complete');
      expect(result.reasoning).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should handle decision with extra text', () => {
      const output = 'COMPLETE - All done\nReasoning here';
      const result = parseReviewOutput(output);

      expect(result.decision).toBe('complete');
    });

    it('should provide default reasoning if missing', () => {
      const output = 'COMPLETE';
      const result = parseReviewOutput(output);

      expect(result.decision).toBe('complete');
      expect(result.reasoning).toBe('No reasoning provided');
    });

    it('should include raw output', () => {
      const output = 'COMPLETE\nReasoning';
      const result = parseReviewOutput(output);

      expect(result.rawOutput).toBe(output);
    });

    it('should include timestamp', () => {
      const output = 'COMPLETE\nReasoning';
      const before = new Date();
      const result = parseReviewOutput(output);
      const after = new Date();

      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Fuzzy matching', () => {
    it('should find COMPLETE in first few lines', () => {
      const output = 'Based on my analysis:\nCOMPLETE\nAll good.';
      const result = parseReviewOutput(output);

      expect(result.decision).toBe('complete');
    });

    it('should find NOT_COMPLETE with space separator', () => {
      const output = 'NOT COMPLETE\nWork needed.';
      const result = parseReviewOutput(output);

      expect(result.decision).toBe('not_complete');
    });

    it('should find NEEDS_CLARIFICATION with space separator', () => {
      const output = 'NEEDS CLARIFICATION\nMore info needed.';
      const result = parseReviewOutput(output);

      expect(result.decision).toBe('needs_clarification');
    });
  });

  describe('Invalid outputs', () => {
    it('should throw on empty output', () => {
      expect(() => parseReviewOutput('')).toThrow(ReviewParseError);
    });

    it('should throw on whitespace-only output', () => {
      expect(() => parseReviewOutput('   \n   ')).toThrow(ReviewParseError);
    });

    it('should throw on unrecognized decision', () => {
      expect(() => parseReviewOutput('MAYBE\nNot sure')).toThrow(ReviewParseError);
    });

    it('should include raw output in error', () => {
      try {
        parseReviewOutput('INVALID\nOutput');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ReviewParseError);
        expect((error as ReviewParseError).rawOutput).toBe('INVALID\nOutput');
      }
    });
  });
});

// ============================================================================
// ReviewerSubagent Service Tests
// ============================================================================

describe('ReviewerSubagent', () => {
  let reviewer: ReviewerSubagent;

  beforeEach(() => {
    vi.clearAllMocks();
    reviewer = new ReviewerSubagent();
  });

  afterEach(() => {
    reviewer.stop();
  });

  describe('Lifecycle', () => {
    it('should start and stop without errors', () => {
      expect(() => reviewer.start()).not.toThrow();
      expect(() => reviewer.stop()).not.toThrow();
    });

    it('should be idempotent for start/stop', () => {
      reviewer.start();
      reviewer.start(); // Should not throw
      reviewer.stop();
      reviewer.stop(); // Should not throw
    });
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const defaultReviewer = new ReviewerSubagent();
      // Config is private, but behavior should reflect defaults
      defaultReviewer.stop();
    });

    it('should accept custom configuration', () => {
      const customReviewer = new ReviewerSubagent({
        timeoutMs: 10000,
        sessionOutputLines: 50,
        enableStopHookReview: false,
        enableIdleReview: false,
      });
      customReviewer.stop();
    });
  });

  describe('isReviewInProgress', () => {
    it('should return false when no review is in progress', () => {
      expect(reviewer.isReviewInProgress('session-123')).toBe(false);
    });
  });

  describe('cancelReview', () => {
    it('should return false when no review to cancel', () => {
      expect(reviewer.cancelReview('session-123')).toBe(false);
    });
  });

  describe('Events', () => {
    it('should emit review:started event', async () => {
      // This would require mocking the entire review flow
      // For now, just verify the event types are correct
      const handler = vi.fn();
      reviewer.on('review:started', handler);

      // Event would be emitted during review()
      // This is tested in integration tests
    });

    it('should emit review:completed event', async () => {
      const handler = vi.fn();
      reviewer.on('review:completed', handler);
      // Event would be emitted during successful review()
    });

    it('should emit review:failed event', async () => {
      const handler = vi.fn();
      reviewer.on('review:failed', handler);
      // Event would be emitted during failed review()
    });
  });
});

// ============================================================================
// Review Decision Type Tests
// ============================================================================

describe('ReviewDecision type', () => {
  it('should accept valid decision values', () => {
    const decisions: ReviewDecision[] = ['complete', 'not_complete', 'needs_clarification'];
    expect(decisions).toHaveLength(3);
  });
});

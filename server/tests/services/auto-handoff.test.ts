import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ContextThresholdEvent } from '../../src/services/context-monitor.js';

// ============================================================================
// Mock Dependencies (hoisted)
// ============================================================================

// Use vi.hoisted to create mock functions that work with hoisted vi.mock
const {
  mockContextMonitorOn,
  mockContextMonitorOff,
  mockIsMonitoring,
  mockGetSessionContext,
  mockGetActiveSession,
  mockStopSession,
  mockSendText,
  mockCreatePane,
  mockStat,
} = vi.hoisted(() => ({
  mockContextMonitorOn: vi.fn(),
  mockContextMonitorOff: vi.fn(),
  mockIsMonitoring: vi.fn(),
  mockGetSessionContext: vi.fn(),
  mockGetActiveSession: vi.fn(),
  mockStopSession: vi.fn(),
  mockSendText: vi.fn(),
  mockCreatePane: vi.fn(),
  mockStat: vi.fn(),
}));

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
    },
    session: {
      create: vi.fn(),
      update: vi.fn(),
    },
    ticket: {
      findUnique: vi.fn(),
    },
    handoffEvent: {
      create: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    HANDOFF_THRESHOLD_PERCENT: 20,
  },
}));

vi.mock('../../src/services/context-monitor.js', () => ({
  contextMonitor: {
    on: mockContextMonitorOn,
    off: mockContextMonitorOff,
    isMonitoring: mockIsMonitoring,
    getSessionContext: mockGetSessionContext,
  },
}));

vi.mock('../../src/services/session-supervisor.js', () => ({
  sessionSupervisor: {
    getActiveSession: mockGetActiveSession,
    stopSession: mockStopSession,
  },
}));

vi.mock('../../src/services/tmux.js', () => ({
  sendText: mockSendText,
  createPane: mockCreatePane,
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      stat: mockStat,
    },
  };
});

// Import after mocks are set up
import {
  AutoHandoff,
  DEFAULT_AUTO_HANDOFF_CONFIG,
  HandoffInProgressError,
  SessionNotEligibleError,
  HandoffTimeoutError,
  HandoffCancelledError,
  HandoffProjectNotFoundError,
  buildContinuationPrompt,
  type AutoHandoffConfig,
  type HandoffStartedEvent,
  type HandoffCompletedEvent,
  type HandoffFailedEvent,
  type HandoffProgressEvent,
} from '../../src/services/auto-handoff.js';
import { prisma } from '../../src/config/db.js';

// ============================================================================
// Mock Data
// ============================================================================

const mockProject = {
  id: 'project-123',
  name: 'Test Project',
  repoPath: '/path/to/repo',
  ticketsPath: 'docs/jira-tickets/',
  handoffPath: 'docs/ai-context/handoff.md',
  tmuxSession: 'test-session',
  tmuxWindow: 'main',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSession = {
  id: 'session-123',
  projectId: 'project-123',
  ticketId: 'ticket-456',
  parentId: null,
  type: 'ticket' as const,
  status: 'running' as const,
  contextPercent: 85,
  tmuxPaneId: '%5',
  startedAt: new Date(),
  endedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockNewSession = {
  ...mockSession,
  id: 'session-new-789',
  parentId: 'session-123',
};

const mockTicket = {
  id: 'ticket-456',
  projectId: 'project-123',
  externalId: 'CSM-001',
  title: 'Test Ticket',
  state: 'in_progress' as const,
  filePath: 'docs/jira-tickets/CSM-001.md',
  rejectionFeedback: null,
  startedAt: new Date(),
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockHandoffEvent = {
  id: 'handoff-123',
  fromSessionId: 'session-123',
  toSessionId: 'session-new-789',
  contextAtHandoff: 85,
  createdAt: new Date(),
};

// ============================================================================
// Error Classes Tests
// ============================================================================

describe('Error Classes', () => {
  describe('HandoffInProgressError', () => {
    it('should create error with session ID', () => {
      const error = new HandoffInProgressError('session-123');
      expect(error.name).toBe('HandoffInProgressError');
      expect(error.code).toBe('HANDOFF_IN_PROGRESS');
      expect(error.sessionId).toBe('session-123');
      expect(error.message).toContain('session-123');
    });

    it('should be instanceof Error', () => {
      const error = new HandoffInProgressError('session-123');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof HandoffInProgressError).toBe(true);
    });
  });

  describe('SessionNotEligibleError', () => {
    it('should create error with session ID and reason', () => {
      const error = new SessionNotEligibleError('session-123', 'not a ticket session');
      expect(error.name).toBe('SessionNotEligibleError');
      expect(error.code).toBe('SESSION_NOT_ELIGIBLE');
      expect(error.sessionId).toBe('session-123');
      expect(error.reason).toBe('not a ticket session');
      expect(error.message).toContain('session-123');
      expect(error.message).toContain('not a ticket session');
    });
  });

  describe('HandoffTimeoutError', () => {
    it('should create error with session ID and timeout', () => {
      const error = new HandoffTimeoutError('session-123', 60000);
      expect(error.name).toBe('HandoffTimeoutError');
      expect(error.code).toBe('HANDOFF_TIMEOUT');
      expect(error.sessionId).toBe('session-123');
      expect(error.timeoutMs).toBe(60000);
      expect(error.message).toContain('60000');
    });
  });

  describe('HandoffCancelledError', () => {
    it('should create error with session ID', () => {
      const error = new HandoffCancelledError('session-123');
      expect(error.name).toBe('HandoffCancelledError');
      expect(error.code).toBe('HANDOFF_CANCELLED');
      expect(error.sessionId).toBe('session-123');
    });
  });

  describe('HandoffProjectNotFoundError', () => {
    it('should create error with project ID', () => {
      const error = new HandoffProjectNotFoundError('project-123');
      expect(error.name).toBe('HandoffProjectNotFoundError');
      expect(error.code).toBe('PROJECT_NOT_FOUND');
      expect(error.projectId).toBe('project-123');
    });
  });
});

// ============================================================================
// Configuration Tests
// ============================================================================

describe('Default Configuration', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_AUTO_HANDOFF_CONFIG.thresholdPercent).toBe(20);
    expect(DEFAULT_AUTO_HANDOFF_CONFIG.exportCommand).toBe('/exportHandoff');
    expect(DEFAULT_AUTO_HANDOFF_CONFIG.importCommand).toBe('/importHandoff');
    expect(DEFAULT_AUTO_HANDOFF_CONFIG.timeoutMs).toBe(60_000);
    expect(DEFAULT_AUTO_HANDOFF_CONFIG.pollIntervalMs).toBe(1_000);
    expect(DEFAULT_AUTO_HANDOFF_CONFIG.exportDelayMs).toBe(2_000);
    expect(DEFAULT_AUTO_HANDOFF_CONFIG.importDelayMs).toBe(3_000);
    expect(DEFAULT_AUTO_HANDOFF_CONFIG.enabled).toBe(true);
  });
});

// ============================================================================
// Helper Functions Tests
// ============================================================================

describe('buildContinuationPrompt', () => {
  it('should build prompt for ticket session', () => {
    const prompt = buildContinuationPrompt('ticket-123', 'CSM-001');
    expect(prompt).toContain('CSM-001');
    expect(prompt).toContain('context was just restored');
  });

  it('should build generic prompt for non-ticket session', () => {
    const prompt = buildContinuationPrompt(null);
    expect(prompt).toContain('context was just restored');
    expect(prompt).toContain('Continue where you left off');
  });

  it('should handle ticket without external ID', () => {
    const prompt = buildContinuationPrompt('ticket-123');
    expect(prompt).toContain('context was just restored');
  });
});

// ============================================================================
// AutoHandoff Class Tests
// ============================================================================

describe('AutoHandoff', () => {
  let autoHandoff: AutoHandoff;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    autoHandoff = new AutoHandoff();
  });

  afterEach(() => {
    autoHandoff.stop();
    vi.useRealTimers();
  });

  // ==========================================================================
  // Lifecycle Tests
  // ==========================================================================

  describe('Lifecycle', () => {
    it('should start and stop without errors', () => {
      expect(() => autoHandoff.start()).not.toThrow();
      expect(autoHandoff.isRunning()).toBe(true);
      expect(() => autoHandoff.stop()).not.toThrow();
      expect(autoHandoff.isRunning()).toBe(false);
    });

    it('should be idempotent for start/stop', () => {
      autoHandoff.start();
      autoHandoff.start(); // Should not throw or register twice
      autoHandoff.stop();
      autoHandoff.stop(); // Should not throw
    });

    it('should subscribe to context monitor on start', () => {
      autoHandoff.start();
      expect(mockContextMonitorOn).toHaveBeenCalledWith(
        'context:threshold',
        expect.any(Function)
      );
    });

    it('should unsubscribe from context monitor on stop', () => {
      autoHandoff.start();
      autoHandoff.stop();
      expect(mockContextMonitorOff).toHaveBeenCalledWith(
        'context:threshold',
        expect.any(Function)
      );
    });
  });

  // ==========================================================================
  // Configuration Tests
  // ==========================================================================

  describe('Configuration', () => {
    it('should use custom configuration', () => {
      const customConfig: Partial<AutoHandoffConfig> = {
        exportCommand: '/custom-export',
        timeoutMs: 30_000,
      };
      const customAutoHandoff = new AutoHandoff(customConfig);

      const config = customAutoHandoff.getConfig();
      expect(config.exportCommand).toBe('/custom-export');
      expect(config.timeoutMs).toBe(30_000);
      expect(config.importCommand).toBe('/importHandoff'); // Default preserved

      customAutoHandoff.stop();
    });

    it('should update configuration', () => {
      autoHandoff.updateConfig({ enabled: false });
      expect(autoHandoff.getConfig().enabled).toBe(false);
    });
  });

  // ==========================================================================
  // Handoff Eligibility Tests
  // ==========================================================================

  describe('Handoff Eligibility', () => {
    beforeEach(() => {
      autoHandoff.start();
    });

    it('should throw SessionNotEligibleError for non-existent session', async () => {
      mockGetActiveSession.mockReturnValue(undefined);

      await expect(autoHandoff.triggerHandoff('non-existent')).rejects.toThrow(
        SessionNotEligibleError
      );
    });

    it('should throw SessionNotEligibleError for adhoc session', async () => {
      mockGetActiveSession.mockReturnValue({
        ...mockSession,
        type: 'adhoc',
      });

      await expect(autoHandoff.triggerHandoff('session-123')).rejects.toThrow(
        SessionNotEligibleError
      );
    });

    it('should throw HandoffProjectNotFoundError for missing project', async () => {
      mockGetActiveSession.mockReturnValue(mockSession);
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null);

      await expect(autoHandoff.triggerHandoff('session-123')).rejects.toThrow(
        HandoffProjectNotFoundError
      );
    });
  });

  // ==========================================================================
  // isHandoffInProgress Tests
  // ==========================================================================

  describe('isHandoffInProgress', () => {
    it('should return false when no handoff in progress', () => {
      expect(autoHandoff.isHandoffInProgress('session-123')).toBe(false);
    });
  });

  // ==========================================================================
  // getActiveHandoff Tests
  // ==========================================================================

  describe('getActiveHandoff', () => {
    it('should return undefined when no handoff in progress', () => {
      expect(autoHandoff.getActiveHandoff('session-123')).toBeUndefined();
    });
  });

  // ==========================================================================
  // cancelHandoff Tests
  // ==========================================================================

  describe('cancelHandoff', () => {
    it('should return false when no handoff to cancel', () => {
      expect(autoHandoff.cancelHandoff('session-123')).toBe(false);
    });
  });

  // ==========================================================================
  // Context Threshold Handler Tests
  // ==========================================================================

  describe('Context Threshold Handler', () => {
    it('should not trigger handoff when disabled', async () => {
      autoHandoff.updateConfig({ enabled: false });
      autoHandoff.start();

      // Get the threshold handler that was registered
      const handler = mockContextMonitorOn.mock.calls.find(
        (call) => call[0] === 'context:threshold'
      )?.[1] as (event: ContextThresholdEvent) => Promise<void>;

      const thresholdEvent: ContextThresholdEvent = {
        sessionId: 'session-123',
        contextPercent: 85,
        threshold: 20,
        timestamp: new Date(),
      };

      await handler(thresholdEvent);

      // Should not have tried to get active session
      expect(mockGetActiveSession).not.toHaveBeenCalled();
    });

    it('should emit error event on handler failure', async () => {
      autoHandoff.start();
      mockGetActiveSession.mockReturnValue(undefined); // Will cause error

      const errorHandler = vi.fn();
      autoHandoff.on('error', errorHandler);

      // Get the threshold handler
      const handler = mockContextMonitorOn.mock.calls.find(
        (call) => call[0] === 'context:threshold'
      )?.[1] as (event: ContextThresholdEvent) => Promise<void>;

      const thresholdEvent: ContextThresholdEvent = {
        sessionId: 'session-123',
        contextPercent: 85,
        threshold: 20,
        timestamp: new Date(),
      };

      await handler(thresholdEvent);

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Full Handoff Flow Tests (Integration)
  // ==========================================================================

  describe('Full Handoff Flow', () => {
    beforeEach(() => {
      vi.useRealTimers(); // Use real timers for these complex async tests
      vi.clearAllMocks();
      autoHandoff = new AutoHandoff({
        exportDelayMs: 10,
        importDelayMs: 10,
        pollIntervalMs: 10,
        timeoutMs: 1000,
      });
      autoHandoff.start();
      mockGetActiveSession.mockReturnValue({
        ...mockSession,
        paneId: '%5', // Ensure paneId is set
      });
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any);
      vi.mocked(prisma.session.create).mockResolvedValue(mockNewSession as any);
      vi.mocked(prisma.session.update).mockResolvedValue(mockNewSession as any);
      vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket as any);
      vi.mocked(prisma.handoffEvent.create).mockResolvedValue(mockHandoffEvent as any);
      vi.mocked(prisma.notification.create).mockResolvedValue({} as any);
      mockStopSession.mockResolvedValue(undefined);
      mockSendText.mockResolvedValue(undefined);
      mockCreatePane.mockResolvedValue('%10');
    });

    afterEach(() => {
      autoHandoff.stop();
      vi.useFakeTimers();
    });

    it('should complete full handoff and record HandoffEvent', async () => {
      // File exists initially, then gets modified
      mockStat.mockResolvedValueOnce({ mtimeMs: 1000 });
      mockStat.mockResolvedValue({ mtimeMs: 2000 });

      const completedHandler = vi.fn();
      autoHandoff.on('handoff:completed', completedHandler);

      await autoHandoff.triggerHandoff('session-123');

      // Verify HandoffEvent was recorded
      expect(prisma.handoffEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromSessionId: 'session-123',
            toSessionId: 'session-new-789',
          }),
        })
      );

      // Verify new session was created with parentId
      expect(prisma.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            parentId: 'session-123',
            ticketId: 'ticket-456',
          }),
        })
      );

      // Verify completed event was emitted
      expect(completedHandler).toHaveBeenCalledTimes(1);
    });

    it('should create notification on successful handoff', async () => {
      mockStat.mockResolvedValueOnce({ mtimeMs: 1000 });
      mockStat.mockResolvedValue({ mtimeMs: 2000 });

      await autoHandoff.triggerHandoff('session-123');

      expect(prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'handoff_complete',
          }),
        })
      );
    });

    it('should stop original session during handoff', async () => {
      mockStat.mockResolvedValueOnce({ mtimeMs: 1000 });
      mockStat.mockResolvedValue({ mtimeMs: 2000 });

      await autoHandoff.triggerHandoff('session-123');

      expect(mockStopSession).toHaveBeenCalledWith('session-123', false);
    });

    it('should create new tmux pane during handoff', async () => {
      mockStat.mockResolvedValueOnce({ mtimeMs: 1000 });
      mockStat.mockResolvedValue({ mtimeMs: 2000 });

      await autoHandoff.triggerHandoff('session-123');

      expect(mockCreatePane).toHaveBeenCalledWith(
        'test-session',
        expect.objectContaining({
          cwd: '/path/to/repo',
          command: 'claude',
        })
      );
    });
  });

  // ==========================================================================
  // Edge Cases Tests
  // ==========================================================================

  describe('Edge Cases', () => {
    beforeEach(() => {
      autoHandoff.start();
    });

    it('should handle session without ticket gracefully', async () => {
      const adhocSession = { ...mockSession, ticketId: null, type: 'adhoc' as const };
      mockGetActiveSession.mockReturnValue(adhocSession);

      await expect(autoHandoff.triggerHandoff('session-123')).rejects.toThrow(
        SessionNotEligibleError
      );
    });

    it('should handle file that does not exist initially', async () => {
      vi.useRealTimers();
      autoHandoff.stop();
      vi.clearAllMocks();
      autoHandoff = new AutoHandoff({
        exportDelayMs: 10,
        importDelayMs: 10,
        pollIntervalMs: 10,
        timeoutMs: 1000,
      });
      autoHandoff.start();

      mockGetActiveSession.mockReturnValue(mockSession);
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any);
      vi.mocked(prisma.session.create).mockResolvedValue(mockNewSession as any);
      vi.mocked(prisma.session.update).mockResolvedValue(mockNewSession as any);
      vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket as any);
      vi.mocked(prisma.handoffEvent.create).mockResolvedValue(mockHandoffEvent as any);
      vi.mocked(prisma.notification.create).mockResolvedValue({} as any);
      mockStopSession.mockResolvedValue(undefined);
      mockSendText.mockResolvedValue(undefined);
      mockCreatePane.mockResolvedValue('%10');

      // File doesn't exist initially, then gets created
      mockStat.mockRejectedValueOnce(new Error('ENOENT'));
      mockStat.mockResolvedValue({ mtimeMs: 2000 }); // File appears

      await autoHandoff.triggerHandoff('session-123');

      // Should complete successfully
      expect(prisma.handoffEvent.create).toHaveBeenCalled();

      autoHandoff.stop();
      vi.useFakeTimers();
    });

    it('should handle project without tmuxWindow', async () => {
      vi.useRealTimers();
      autoHandoff.stop();
      vi.clearAllMocks();
      autoHandoff = new AutoHandoff({
        exportDelayMs: 10,
        importDelayMs: 10,
        pollIntervalMs: 10,
        timeoutMs: 1000,
      });
      autoHandoff.start();

      const projectNoWindow = { ...mockProject, tmuxWindow: null };
      mockGetActiveSession.mockReturnValue(mockSession);
      vi.mocked(prisma.project.findUnique).mockResolvedValue(projectNoWindow as any);
      vi.mocked(prisma.session.create).mockResolvedValue(mockNewSession as any);
      vi.mocked(prisma.session.update).mockResolvedValue(mockNewSession as any);
      vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket as any);
      vi.mocked(prisma.handoffEvent.create).mockResolvedValue(mockHandoffEvent as any);
      vi.mocked(prisma.notification.create).mockResolvedValue({} as any);
      mockStopSession.mockResolvedValue(undefined);
      mockSendText.mockResolvedValue(undefined);
      mockCreatePane.mockResolvedValue('%10');
      mockStat.mockResolvedValueOnce({ mtimeMs: 1000 });
      mockStat.mockResolvedValue({ mtimeMs: 2000 });

      await autoHandoff.triggerHandoff('session-123');

      // Should complete successfully
      expect(prisma.handoffEvent.create).toHaveBeenCalled();

      autoHandoff.stop();
      vi.useFakeTimers();
    });
  });
});

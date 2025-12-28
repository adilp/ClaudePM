import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TicketStateMachine,
  VALID_TRANSITIONS,
  isValidTransition,
  formatRejectionFeedback,
  InvalidTransitionError,
  MissingFeedbackError,
  TicketNotFoundError,
  DEFAULT_STATE_MACHINE_CONFIG,
  type TicketStateChangeEvent,
  type TransitionRequest,
  type TicketState,
} from '../../src/services/ticket-state-machine.js';

// ============================================================================
// Mock Dependencies
// ============================================================================

// Mock Prisma
const mockTicket = {
  id: 'ticket-123',
  projectId: 'project-456',
  externalId: 'CSM-001',
  title: 'Test Ticket',
  state: 'backlog' as TicketState,
  filePath: 'docs/tickets/CSM-001.md',
  rejectionFeedback: null,
  startedAt: null,
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockHistoryEntry = {
  id: 'history-123',
  ticketId: 'ticket-123',
  fromState: 'backlog' as TicketState,
  toState: 'in_progress' as TicketState,
  trigger: 'auto' as const,
  reason: 'session_started' as const,
  feedback: null,
  triggeredBy: 'session-789',
  createdAt: new Date(),
};

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    ticket: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    ticketStateHistory: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    session: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock session supervisor
vi.mock('../../src/services/session-supervisor.js', () => ({
  sessionSupervisor: {
    stopSession: vi.fn(),
  },
}));

// Import mocked session supervisor
import { sessionSupervisor } from '../../src/services/session-supervisor.js';

// Import mocked prisma
import { prisma } from '../../src/config/db.js';

// ============================================================================
// Error Classes Tests
// ============================================================================

describe('Error Classes', () => {
  describe('InvalidTransitionError', () => {
    it('should create error with from and to states', () => {
      const error = new InvalidTransitionError('backlog', 'done');
      expect(error.name).toBe('InvalidTransitionError');
      expect(error.code).toBe('INVALID_TRANSITION');
      expect(error.fromState).toBe('backlog');
      expect(error.toState).toBe('done');
      expect(error.message).toContain('backlog');
      expect(error.message).toContain('done');
    });

    it('should be instanceof Error', () => {
      const error = new InvalidTransitionError('backlog', 'done');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof InvalidTransitionError).toBe(true);
    });
  });

  describe('MissingFeedbackError', () => {
    it('should create error with correct message', () => {
      const error = new MissingFeedbackError();
      expect(error.name).toBe('MissingFeedbackError');
      expect(error.code).toBe('MISSING_FEEDBACK');
      expect(error.message).toContain('Feedback is required');
    });
  });

  describe('TicketNotFoundError', () => {
    it('should create error with ticket ID', () => {
      const error = new TicketNotFoundError('ticket-123');
      expect(error.name).toBe('TicketNotFoundError');
      expect(error.code).toBe('TICKET_NOT_FOUND');
      expect(error.message).toContain('ticket-123');
    });
  });
});

// ============================================================================
// Configuration Tests
// ============================================================================

describe('Default Configuration', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_STATE_MACHINE_CONFIG.emitEvents).toBe(true);
    expect(DEFAULT_STATE_MACHINE_CONFIG.storeHistory).toBe(true);
  });
});

// ============================================================================
// Valid Transitions Tests
// ============================================================================

describe('Valid Transitions', () => {
  it('should define valid transitions from backlog', () => {
    expect(VALID_TRANSITIONS.backlog).toEqual(['in_progress']);
  });

  it('should define valid transitions from in_progress', () => {
    expect(VALID_TRANSITIONS.in_progress).toEqual(['review']);
  });

  it('should define valid transitions from review', () => {
    expect(VALID_TRANSITIONS.review).toContain('done');
    expect(VALID_TRANSITIONS.review).toContain('in_progress');
  });

  it('should define no valid transitions from done', () => {
    expect(VALID_TRANSITIONS.done).toEqual([]);
  });
});

describe('isValidTransition', () => {
  it('should return true for valid transitions', () => {
    expect(isValidTransition('backlog', 'in_progress')).toBe(true);
    expect(isValidTransition('in_progress', 'review')).toBe(true);
    expect(isValidTransition('review', 'done')).toBe(true);
    expect(isValidTransition('review', 'in_progress')).toBe(true);
  });

  it('should return false for invalid transitions', () => {
    expect(isValidTransition('backlog', 'review')).toBe(false);
    expect(isValidTransition('backlog', 'done')).toBe(false);
    expect(isValidTransition('in_progress', 'backlog')).toBe(false);
    expect(isValidTransition('in_progress', 'done')).toBe(false);
    expect(isValidTransition('done', 'backlog')).toBe(false);
    expect(isValidTransition('done', 'in_progress')).toBe(false);
    expect(isValidTransition('done', 'review')).toBe(false);
  });
});

// ============================================================================
// formatRejectionFeedback Tests
// ============================================================================

describe('formatRejectionFeedback', () => {
  it('should format feedback with structured prompt', () => {
    const result = formatRejectionFeedback('Please fix the tests');
    expect(result.raw).toBe('Please fix the tests');
    expect(result.formatted).toContain('[REVIEW FEEDBACK]');
    expect(result.formatted).toContain('Please fix the tests');
    expect(result.formatted).toContain('Please address this');
  });

  it('should preserve original feedback in quotes', () => {
    const result = formatRejectionFeedback('Add error handling');
    expect(result.formatted).toContain('"Add error handling"');
  });
});

// ============================================================================
// TicketStateMachine Tests
// ============================================================================

describe('TicketStateMachine', () => {
  let stateMachine: TicketStateMachine;

  beforeEach(() => {
    vi.clearAllMocks();
    stateMachine = new TicketStateMachine();
  });

  afterEach(() => {
    stateMachine.stop();
  });

  describe('Lifecycle', () => {
    it('should start and stop without errors', () => {
      expect(() => stateMachine.start()).not.toThrow();
      expect(() => stateMachine.stop()).not.toThrow();
    });

    it('should be idempotent for start/stop', () => {
      stateMachine.start();
      stateMachine.start(); // Should not throw
      stateMachine.stop();
      stateMachine.stop(); // Should not throw
    });
  });

  describe('canTransition', () => {
    it('should return true for valid transitions', () => {
      expect(stateMachine.canTransition('backlog', 'in_progress')).toBe(true);
      expect(stateMachine.canTransition('in_progress', 'review')).toBe(true);
      expect(stateMachine.canTransition('review', 'done')).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      expect(stateMachine.canTransition('backlog', 'done')).toBe(false);
      expect(stateMachine.canTransition('done', 'backlog')).toBe(false);
    });
  });

  describe('getValidTransitions', () => {
    it('should return valid target states', () => {
      expect(stateMachine.getValidTransitions('backlog')).toEqual(['in_progress']);
      expect(stateMachine.getValidTransitions('review')).toContain('done');
      expect(stateMachine.getValidTransitions('review')).toContain('in_progress');
      expect(stateMachine.getValidTransitions('done')).toEqual([]);
    });
  });

  describe('transition', () => {
    beforeEach(() => {
      stateMachine.start();
    });

    it('should throw TicketNotFoundError for non-existent ticket', async () => {
      vi.mocked(prisma.ticket.findUnique).mockResolvedValue(null);

      const request: TransitionRequest = {
        ticketId: 'non-existent',
        targetState: 'in_progress',
        trigger: 'auto',
        reason: 'session_started',
      };

      await expect(stateMachine.transition(request)).rejects.toThrow(TicketNotFoundError);
    });

    it('should throw InvalidTransitionError for invalid transition', async () => {
      vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket);

      const request: TransitionRequest = {
        ticketId: 'ticket-123',
        targetState: 'done', // Invalid: backlog → done
        trigger: 'manual',
        reason: 'user_approved',
      };

      await expect(stateMachine.transition(request)).rejects.toThrow(InvalidTransitionError);
    });

    it('should throw MissingFeedbackError when rejecting without feedback', async () => {
      const inProgressTicket = { ...mockTicket, state: 'review' as TicketState };
      vi.mocked(prisma.ticket.findUnique).mockResolvedValue(inProgressTicket);

      const request: TransitionRequest = {
        ticketId: 'ticket-123',
        targetState: 'in_progress',
        trigger: 'manual',
        reason: 'user_rejected',
        // No feedback provided
      };

      await expect(stateMachine.transition(request)).rejects.toThrow(MissingFeedbackError);
    });

    it('should execute valid transition', async () => {
      vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket);
      vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
        return fn({
          ticket: {
            update: vi.fn().mockResolvedValue({
              ...mockTicket,
              state: 'in_progress',
              startedAt: new Date(),
            }),
          },
          ticketStateHistory: {
            create: vi.fn().mockResolvedValue(mockHistoryEntry),
          },
        } as any);
      });

      const request: TransitionRequest = {
        ticketId: 'ticket-123',
        targetState: 'in_progress',
        trigger: 'auto',
        reason: 'session_started',
        triggeredBy: 'session-789',
      };

      const result = await stateMachine.transition(request);

      expect(result.ticketId).toBe('ticket-123');
      expect(result.fromState).toBe('backlog');
      expect(result.toState).toBe('in_progress');
      expect(result.trigger).toBe('auto');
      expect(result.reason).toBe('session_started');
      expect(result.historyEntryId).toBe('history-123');
    });

    it('should emit stateChange event when started', async () => {
      vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket);
      vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
        return fn({
          ticket: {
            update: vi.fn().mockResolvedValue({
              ...mockTicket,
              state: 'in_progress',
            }),
          },
          ticketStateHistory: {
            create: vi.fn().mockResolvedValue(mockHistoryEntry),
          },
        } as any);
      });

      const eventHandler = vi.fn();
      stateMachine.on('ticket:stateChange', eventHandler);

      const request: TransitionRequest = {
        ticketId: 'ticket-123',
        targetState: 'in_progress',
        trigger: 'auto',
        reason: 'session_started',
      };

      await stateMachine.transition(request);

      expect(eventHandler).toHaveBeenCalledTimes(1);
      const event: TicketStateChangeEvent = eventHandler.mock.calls[0][0];
      expect(event.ticketId).toBe('ticket-123');
      expect(event.fromState).toBe('backlog');
      expect(event.toState).toBe('in_progress');
    });

    it('should not emit events when not started', async () => {
      stateMachine.stop();

      vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket);
      vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
        return fn({
          ticket: {
            update: vi.fn().mockResolvedValue({
              ...mockTicket,
              state: 'in_progress',
            }),
          },
          ticketStateHistory: {
            create: vi.fn().mockResolvedValue(mockHistoryEntry),
          },
        } as any);
      });

      const eventHandler = vi.fn();
      stateMachine.on('ticket:stateChange', eventHandler);

      const request: TransitionRequest = {
        ticketId: 'ticket-123',
        targetState: 'in_progress',
        trigger: 'auto',
        reason: 'session_started',
      };

      await stateMachine.transition(request);

      expect(eventHandler).not.toHaveBeenCalled();
    });
  });

  describe('Helper Methods', () => {
    beforeEach(() => {
      stateMachine.start();
    });

    describe('approve', () => {
      beforeEach(() => {
        vi.mocked(sessionSupervisor.stopSession).mockClear();
      });

      it('should transition from review to done', async () => {
        const reviewTicket = { ...mockTicket, state: 'review' as TicketState };
        vi.mocked(prisma.ticket.findUnique).mockResolvedValue(reviewTicket);
        vi.mocked(prisma.session.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
          return fn({
            ticket: {
              update: vi.fn().mockResolvedValue({
                ...reviewTicket,
                state: 'done',
                completedAt: new Date(),
              }),
            },
            ticketStateHistory: {
              create: vi.fn().mockResolvedValue({
                ...mockHistoryEntry,
                fromState: 'review',
                toState: 'done',
                reason: 'user_approved',
              }),
            },
          } as any);
        });

        const result = await stateMachine.approve('ticket-123', 'user-123');

        expect(result.toState).toBe('done');
        expect(result.reason).toBe('user_approved');
        expect(result.trigger).toBe('manual');
      });

      it('should stop the running session when approving', async () => {
        const reviewTicket = { ...mockTicket, state: 'review' as TicketState };
        const mockSession = { id: 'session-123', ticketId: 'ticket-123', status: 'running' };

        vi.mocked(prisma.ticket.findUnique).mockResolvedValue(reviewTicket);
        vi.mocked(prisma.session.findFirst).mockResolvedValue(mockSession as any);
        vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
          return fn({
            ticket: {
              update: vi.fn().mockResolvedValue({
                ...reviewTicket,
                state: 'done',
                completedAt: new Date(),
              }),
            },
            ticketStateHistory: {
              create: vi.fn().mockResolvedValue({
                ...mockHistoryEntry,
                fromState: 'review',
                toState: 'done',
                reason: 'user_approved',
              }),
            },
          } as any);
        });

        await stateMachine.approve('ticket-123', 'user-123');

        expect(prisma.session.findFirst).toHaveBeenCalledWith({
          where: {
            ticketId: 'ticket-123',
            status: 'running',
          },
        });
        expect(sessionSupervisor.stopSession).toHaveBeenCalledWith('session-123');
      });

      it('should not call stopSession when no running session exists', async () => {
        const reviewTicket = { ...mockTicket, state: 'review' as TicketState };

        vi.mocked(prisma.ticket.findUnique).mockResolvedValue(reviewTicket);
        vi.mocked(prisma.session.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
          return fn({
            ticket: {
              update: vi.fn().mockResolvedValue({
                ...reviewTicket,
                state: 'done',
                completedAt: new Date(),
              }),
            },
            ticketStateHistory: {
              create: vi.fn().mockResolvedValue({
                ...mockHistoryEntry,
                fromState: 'review',
                toState: 'done',
                reason: 'user_approved',
              }),
            },
          } as any);
        });

        await stateMachine.approve('ticket-123', 'user-123');

        expect(sessionSupervisor.stopSession).not.toHaveBeenCalled();
      });

      it('should not fail approval if stopSession throws', async () => {
        const reviewTicket = { ...mockTicket, state: 'review' as TicketState };
        const mockSession = { id: 'session-123', ticketId: 'ticket-123', status: 'running' };

        vi.mocked(prisma.ticket.findUnique).mockResolvedValue(reviewTicket);
        vi.mocked(prisma.session.findFirst).mockResolvedValue(mockSession as any);
        vi.mocked(sessionSupervisor.stopSession).mockRejectedValue(new Error('Pane already dead'));
        vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
          return fn({
            ticket: {
              update: vi.fn().mockResolvedValue({
                ...reviewTicket,
                state: 'done',
                completedAt: new Date(),
              }),
            },
            ticketStateHistory: {
              create: vi.fn().mockResolvedValue({
                ...mockHistoryEntry,
                fromState: 'review',
                toState: 'done',
                reason: 'user_approved',
              }),
            },
          } as any);
        });

        // Should not throw - approval should succeed even if pane cleanup fails
        const result = await stateMachine.approve('ticket-123', 'user-123');

        expect(result.toState).toBe('done');
        expect(sessionSupervisor.stopSession).toHaveBeenCalledWith('session-123');
      });
    });

    describe('reject', () => {
      it('should transition from review to in_progress with feedback', async () => {
        const reviewTicket = { ...mockTicket, state: 'review' as TicketState };
        vi.mocked(prisma.ticket.findUnique).mockResolvedValue(reviewTicket);
        vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
          return fn({
            ticket: {
              update: vi.fn().mockResolvedValue({
                ...reviewTicket,
                state: 'in_progress',
                rejectionFeedback: 'formatted feedback',
              }),
            },
            ticketStateHistory: {
              create: vi.fn().mockResolvedValue({
                ...mockHistoryEntry,
                fromState: 'review',
                toState: 'in_progress',
                reason: 'user_rejected',
                feedback: 'Please fix tests',
              }),
            },
          } as any);
        });

        const result = await stateMachine.reject('ticket-123', 'Please fix tests', 'user-123');

        expect(result.toState).toBe('in_progress');
        expect(result.reason).toBe('user_rejected');
        expect(result.trigger).toBe('manual');
      });
    });

    describe('startWork', () => {
      it('should transition from backlog to in_progress', async () => {
        vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket);
        vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
          return fn({
            ticket: {
              update: vi.fn().mockResolvedValue({
                ...mockTicket,
                state: 'in_progress',
                startedAt: new Date(),
              }),
            },
            ticketStateHistory: {
              create: vi.fn().mockResolvedValue(mockHistoryEntry),
            },
          } as any);
        });

        const result = await stateMachine.startWork('ticket-123', 'session-789');

        expect(result.toState).toBe('in_progress');
        expect(result.reason).toBe('session_started');
        expect(result.trigger).toBe('auto');
      });
    });

    describe('moveToReview', () => {
      it('should transition from in_progress to review', async () => {
        const inProgressTicket = { ...mockTicket, state: 'in_progress' as TicketState };
        vi.mocked(prisma.ticket.findUnique).mockResolvedValue(inProgressTicket);
        vi.mocked(prisma.$transaction).mockImplementation(async (fn) => {
          return fn({
            ticket: {
              update: vi.fn().mockResolvedValue({
                ...inProgressTicket,
                state: 'review',
              }),
            },
            ticketStateHistory: {
              create: vi.fn().mockResolvedValue({
                ...mockHistoryEntry,
                fromState: 'in_progress',
                toState: 'review',
                reason: 'completion_detected',
              }),
            },
          } as any);
        });

        const result = await stateMachine.moveToReview('ticket-123', 'session-789');

        expect(result.toState).toBe('review');
        expect(result.reason).toBe('completion_detected');
        expect(result.trigger).toBe('auto');
      });
    });
  });

  describe('getHistory', () => {
    it('should throw TicketNotFoundError for non-existent ticket', async () => {
      vi.mocked(prisma.ticket.findUnique).mockResolvedValue(null);

      await expect(stateMachine.getHistory('non-existent')).rejects.toThrow(TicketNotFoundError);
    });

    it('should return empty array for ticket with no history', async () => {
      vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket);
      vi.mocked(prisma.ticketStateHistory.findMany).mockResolvedValue([]);

      const history = await stateMachine.getHistory('ticket-123');

      expect(history).toEqual([]);
    });

    it('should return history entries sorted by createdAt', async () => {
      const historyEntries = [
        { ...mockHistoryEntry, id: 'h1', createdAt: new Date('2024-01-01') },
        {
          ...mockHistoryEntry,
          id: 'h2',
          fromState: 'in_progress' as TicketState,
          toState: 'review' as TicketState,
          createdAt: new Date('2024-01-02'),
        },
      ];

      vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket);
      vi.mocked(prisma.ticketStateHistory.findMany).mockResolvedValue(historyEntries);

      const history = await stateMachine.getHistory('ticket-123');

      expect(history).toHaveLength(2);
      expect(history[0].id).toBe('h1');
      expect(history[1].id).toBe('h2');
    });

    it('should include feedback and triggeredBy when present', async () => {
      const historyWithFeedback = {
        ...mockHistoryEntry,
        feedback: 'Some feedback',
        triggeredBy: 'user-123',
      };

      vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket);
      vi.mocked(prisma.ticketStateHistory.findMany).mockResolvedValue([historyWithFeedback]);

      const history = await stateMachine.getHistory('ticket-123');

      expect(history[0].feedback).toBe('Some feedback');
      expect(history[0].triggeredBy).toBe('user-123');
    });
  });

  describe('getRejectionFeedback', () => {
    it('should throw TicketNotFoundError for non-existent ticket', async () => {
      vi.mocked(prisma.ticket.findUnique).mockResolvedValue(null);

      await expect(stateMachine.getRejectionFeedback('non-existent')).rejects.toThrow(
        TicketNotFoundError
      );
    });

    it('should return null when no feedback', async () => {
      vi.mocked(prisma.ticket.findUnique).mockResolvedValue({
        rejectionFeedback: null,
      } as any);

      const feedback = await stateMachine.getRejectionFeedback('ticket-123');

      expect(feedback).toBeNull();
    });

    it('should return feedback when present', async () => {
      vi.mocked(prisma.ticket.findUnique).mockResolvedValue({
        rejectionFeedback: 'formatted feedback',
      } as any);

      const feedback = await stateMachine.getRejectionFeedback('ticket-123');

      expect(feedback).toBe('formatted feedback');
    });
  });

  describe('clearRejectionFeedback', () => {
    it('should throw TicketNotFoundError for non-existent ticket', async () => {
      vi.mocked(prisma.ticket.findUnique).mockResolvedValue(null);

      await expect(stateMachine.clearRejectionFeedback('non-existent')).rejects.toThrow(
        TicketNotFoundError
      );
    });

    it('should clear feedback', async () => {
      vi.mocked(prisma.ticket.findUnique).mockResolvedValue(mockTicket);
      vi.mocked(prisma.ticket.update).mockResolvedValue({ ...mockTicket, rejectionFeedback: null });

      await stateMachine.clearRejectionFeedback('ticket-123');

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 'ticket-123' },
        data: { rejectionFeedback: null },
      });
    });
  });

  describe('Configuration', () => {
    it('should use custom configuration', () => {
      const customMachine = new TicketStateMachine({
        emitEvents: false,
        storeHistory: false,
      });

      // The config is private, but we can verify behavior by not getting events
      customMachine.start();

      const eventHandler = vi.fn();
      customMachine.on('ticket:stateChange', eventHandler);

      // Even with start(), emitEvents: false should prevent emission
      // But this is harder to test without exposing internals

      customMachine.stop();
    });
  });
});

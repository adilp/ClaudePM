/**
 * Ticket State Machine Service
 * Manages ticket state transitions with validation, history tracking, and events
 */

import { EventEmitter } from 'events';
import { prisma } from '../config/db.js';
import type { TicketStateHistory } from '../generated/prisma/index.js';
import {
  type TicketState,
  type TransitionTrigger,
  type TransitionReason,
  type TransitionRequest,
  type TransitionResult,
  type TicketStateChangeEvent,
  type TicketStateMachineEvents,
  type StateHistoryEntry,
  type StateMachineConfig,
  VALID_TRANSITIONS,
  isValidTransition,
  formatRejectionFeedback,
  InvalidTransitionError,
  MissingFeedbackError,
  TicketNotFoundError,
  DEFAULT_STATE_MACHINE_CONFIG,
} from './ticket-state-machine-types.js';

// ============================================================================
// Typed EventEmitter
// ============================================================================

class TypedEventEmitter extends EventEmitter {
  on<K extends keyof TicketStateMachineEvents>(
    event: K,
    listener: TicketStateMachineEvents[K]
  ): this {
    return super.on(event, listener);
  }

  off<K extends keyof TicketStateMachineEvents>(
    event: K,
    listener: TicketStateMachineEvents[K]
  ): this {
    return super.off(event, listener);
  }

  emit<K extends keyof TicketStateMachineEvents>(
    event: K,
    ...args: Parameters<TicketStateMachineEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}

// ============================================================================
// State Machine Service
// ============================================================================

export class TicketStateMachine extends TypedEventEmitter {
  private config: StateMachineConfig;
  private started = false;

  constructor(config: Partial<StateMachineConfig> = {}) {
    super();
    this.config = { ...DEFAULT_STATE_MACHINE_CONFIG, ...config };
  }

  /**
   * Start the state machine (enable event processing)
   */
  start(): void {
    if (this.started) return;
    this.started = true;
  }

  /**
   * Stop the state machine
   */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.removeAllListeners();
  }

  /**
   * Check if a transition is valid
   */
  canTransition(from: TicketState, to: TicketState): boolean {
    return isValidTransition(from, to);
  }

  /**
   * Get valid target states for a given state
   */
  getValidTransitions(from: TicketState): TicketState[] {
    return [...VALID_TRANSITIONS[from]];
  }

  /**
   * Transition a ticket to a new state
   */
  async transition(request: TransitionRequest): Promise<TransitionResult> {
    const { ticketId, targetState, trigger, reason, feedback, triggeredBy } = request;

    // Fetch current ticket
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new TicketNotFoundError(ticketId);
    }

    const fromState = ticket.state;

    // Validate transition
    if (!this.canTransition(fromState, targetState)) {
      throw new InvalidTransitionError(fromState, targetState);
    }

    // Validate feedback for rejections
    if (reason === 'user_rejected' && !feedback) {
      throw new MissingFeedbackError();
    }

    // Prepare update data
    const updateData: {
      state: TicketState;
      startedAt?: Date;
      completedAt?: Date | null;
      rejectionFeedback?: string | null;
    } = {
      state: targetState,
    };

    // Track state-specific timestamps
    if (targetState === 'in_progress' && fromState === 'backlog') {
      updateData.startedAt = new Date();
    }

    if (targetState === 'done') {
      updateData.completedAt = new Date();
    }

    // Clear completedAt if moving back from done
    if (fromState === 'done' && targetState !== 'done') {
      updateData.completedAt = null;
    }

    // Handle rejection feedback
    if (reason === 'user_rejected' && feedback) {
      const formatted = formatRejectionFeedback(feedback);
      updateData.rejectionFeedback = formatted.formatted;
    } else if (targetState === 'in_progress' && fromState === 'review') {
      // Keep existing feedback when moving from review back to in_progress
      // (it will be read by the session)
    } else {
      // Clear rejection feedback for other transitions
      updateData.rejectionFeedback = null;
    }

    // Perform transition in a transaction
    const [, historyEntry] = await prisma.$transaction(async (tx) => {
      // Update ticket
      const updated = await tx.ticket.update({
        where: { id: ticketId },
        data: updateData,
      });

      // Create history entry if enabled
      let history: TicketStateHistory | null = null;
      if (this.config.storeHistory) {
        const historyData: {
          ticketId: string;
          fromState: TicketState;
          toState: TicketState;
          trigger: TransitionTrigger;
          reason: TransitionReason;
          feedback?: string;
          triggeredBy?: string;
        } = {
          ticketId,
          fromState,
          toState: targetState,
          trigger,
          reason,
        };

        if (feedback) {
          historyData.feedback = feedback;
        }

        if (triggeredBy) {
          historyData.triggeredBy = triggeredBy;
        }

        history = await tx.ticketStateHistory.create({
          data: historyData,
        });
      }

      return [updated, history] as const;
    });

    const timestamp = new Date();
    const result: TransitionResult = {
      ticketId,
      fromState,
      toState: targetState,
      trigger,
      reason,
      timestamp,
      historyEntryId: historyEntry?.id ?? '',
    };

    // Emit event if enabled
    if (this.config.emitEvents && this.started) {
      const event: TicketStateChangeEvent = {
        ticketId,
        fromState,
        toState: targetState,
        trigger,
        reason,
        timestamp,
      };

      if (feedback) {
        event.feedback = feedback;
      }

      if (triggeredBy) {
        event.triggeredBy = triggeredBy;
      }

      this.emit('ticket:stateChange', event);
    }

    return result;
  }

  /**
   * Approve a ticket (move from review to done)
   */
  async approve(ticketId: string, approvedBy?: string): Promise<TransitionResult> {
    const request: TransitionRequest = {
      ticketId,
      targetState: 'done',
      trigger: 'manual',
      reason: 'user_approved',
    };

    if (approvedBy) {
      request.triggeredBy = approvedBy;
    }

    return this.transition(request);
  }

  /**
   * Reject a ticket (move from review back to in_progress with feedback)
   */
  async reject(
    ticketId: string,
    feedback: string,
    rejectedBy?: string
  ): Promise<TransitionResult> {
    const request: TransitionRequest = {
      ticketId,
      targetState: 'in_progress',
      trigger: 'manual',
      reason: 'user_rejected',
      feedback,
    };

    if (rejectedBy) {
      request.triggeredBy = rejectedBy;
    }

    return this.transition(request);
  }

  /**
   * Start work on a ticket (move from backlog to in_progress)
   */
  async startWork(ticketId: string, sessionId: string): Promise<TransitionResult> {
    return this.transition({
      ticketId,
      targetState: 'in_progress',
      trigger: 'auto',
      reason: 'session_started',
      triggeredBy: sessionId,
    });
  }

  /**
   * Move ticket to review (when completion is detected)
   */
  async moveToReview(ticketId: string, sessionId?: string): Promise<TransitionResult> {
    const request: TransitionRequest = {
      ticketId,
      targetState: 'review',
      trigger: 'auto',
      reason: 'completion_detected',
    };

    if (sessionId) {
      request.triggeredBy = sessionId;
    }

    return this.transition(request);
  }

  /**
   * Get state history for a ticket
   */
  async getHistory(ticketId: string): Promise<StateHistoryEntry[]> {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new TicketNotFoundError(ticketId);
    }

    const history = await prisma.ticketStateHistory.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
    });

    return history.map((entry) => {
      const result: StateHistoryEntry = {
        id: entry.id,
        ticketId: entry.ticketId,
        fromState: entry.fromState,
        toState: entry.toState,
        trigger: entry.trigger,
        reason: entry.reason,
        createdAt: entry.createdAt,
      };

      if (entry.feedback) {
        result.feedback = entry.feedback;
      }

      if (entry.triggeredBy) {
        result.triggeredBy = entry.triggeredBy;
      }

      return result;
    });
  }

  /**
   * Get the formatted rejection feedback for a ticket (if any)
   */
  async getRejectionFeedback(ticketId: string): Promise<string | null> {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { rejectionFeedback: true },
    });

    if (!ticket) {
      throw new TicketNotFoundError(ticketId);
    }

    return ticket.rejectionFeedback;
  }

  /**
   * Clear rejection feedback after it's been read
   */
  async clearRejectionFeedback(ticketId: string): Promise<void> {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new TicketNotFoundError(ticketId);
    }

    await prisma.ticket.update({
      where: { id: ticketId },
      data: { rejectionFeedback: null },
    });
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const ticketStateMachine = new TicketStateMachine();

// Re-export types and utilities
export * from './ticket-state-machine-types.js';

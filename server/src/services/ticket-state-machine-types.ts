/**
 * Ticket State Machine Types
 * Type definitions for ticket state transitions and events
 */

import type {
  TicketState,
  TransitionTrigger,
  TransitionReason,
} from '../generated/prisma/index.js';

// Re-export Prisma types for convenience
export type { TicketState, TransitionTrigger, TransitionReason };

// ============================================================================
// State Transition Types
// ============================================================================

/**
 * Valid state transitions map
 * Key: from state, Value: array of valid target states
 */
export const VALID_TRANSITIONS: Record<TicketState, TicketState[]> = {
  backlog: ['in_progress'],
  in_progress: ['review'],
  review: ['done', 'in_progress'],
  done: [],
};

/**
 * Check if a transition is valid
 */
export function isValidTransition(from: TicketState, to: TicketState): boolean {
  const validTargets = VALID_TRANSITIONS[from];
  return validTargets.includes(to);
}

// ============================================================================
// State History Types
// ============================================================================

/**
 * A single entry in the ticket's state history
 */
export interface StateHistoryEntry {
  id: string;
  ticketId: string;
  fromState: TicketState;
  toState: TicketState;
  trigger: TransitionTrigger;
  reason: TransitionReason;
  feedback?: string;       // Only present on rejections
  triggeredBy?: string;    // Session ID for auto, or user info for manual
  createdAt: Date;
}

/**
 * Input for creating a state history entry
 */
export interface CreateHistoryEntryInput {
  ticketId: string;
  fromState: TicketState;
  toState: TicketState;
  trigger: TransitionTrigger;
  reason: TransitionReason;
  feedback?: string;
  triggeredBy?: string;
}

// ============================================================================
// Transition Request Types
// ============================================================================

/**
 * Request to transition ticket state
 */
export interface TransitionRequest {
  ticketId: string;
  targetState: TicketState;
  trigger: TransitionTrigger;
  reason: TransitionReason;
  feedback?: string;       // Required for rejections
  triggeredBy?: string;    // Session ID or user identifier
}

/**
 * Result of a successful transition
 */
export interface TransitionResult {
  ticketId: string;
  fromState: TicketState;
  toState: TicketState;
  trigger: TransitionTrigger;
  reason: TransitionReason;
  timestamp: Date;
  historyEntryId: string;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Event emitted when ticket state changes
 */
export interface TicketStateChangeEvent {
  ticketId: string;
  fromState: TicketState;
  toState: TicketState;
  trigger: TransitionTrigger;
  reason: TransitionReason;
  feedback?: string;
  triggeredBy?: string;
  timestamp: Date;
}

/**
 * Events emitted by the state machine
 */
export interface TicketStateMachineEvents {
  'ticket:stateChange': (event: TicketStateChangeEvent) => void;
  error: (error: Error) => void;
}

// ============================================================================
// Rejection Flow Types
// ============================================================================

/**
 * Formatted feedback for injection into session
 */
export interface FormattedFeedback {
  raw: string;         // Original user feedback
  formatted: string;   // Structured prompt for Claude
}

/**
 * Format rejection feedback for session injection
 */
export function formatRejectionFeedback(feedback: string): FormattedFeedback {
  const formatted = `[REVIEW FEEDBACK] The reviewer rejected your work with this feedback:
"${feedback}"
Please address this and continue working on the ticket.`;

  return {
    raw: feedback,
    formatted,
  };
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base error for state machine operations
 */
export class StateMachineError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'StateMachineError';
  }
}

/**
 * Error for invalid state transitions
 */
export class InvalidTransitionError extends StateMachineError {
  constructor(
    public fromState: TicketState,
    public toState: TicketState
  ) {
    super(
      `Invalid transition: cannot move from '${fromState}' to '${toState}'`,
      'INVALID_TRANSITION'
    );
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Error when feedback is missing for rejection
 */
export class MissingFeedbackError extends StateMachineError {
  constructor() {
    super('Feedback is required when rejecting a ticket', 'MISSING_FEEDBACK');
    this.name = 'MissingFeedbackError';
  }
}

/**
 * Error when ticket is not found
 */
export class TicketNotFoundError extends StateMachineError {
  constructor(ticketId: string) {
    super(`Ticket not found: ${ticketId}`, 'TICKET_NOT_FOUND');
    this.name = 'TicketNotFoundError';
  }
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * State machine configuration
 */
export interface StateMachineConfig {
  /** Whether to emit events on state changes (default: true) */
  emitEvents: boolean;
  /** Whether to store history entries (default: true) */
  storeHistory: boolean;
}

export const DEFAULT_STATE_MACHINE_CONFIG: StateMachineConfig = {
  emitEvents: true,
  storeHistory: true,
};

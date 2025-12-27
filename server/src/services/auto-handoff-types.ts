/**
 * Auto-Handoff Types
 * Type definitions and error classes for the automatic context handoff system
 */

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for the auto-handoff service
 */
export interface AutoHandoffConfig {
  /** Context percentage remaining that triggers handoff (default: 20) */
  thresholdPercent: number;
  /** Command to run for exporting handoff (default: '/exportHandoff') */
  exportCommand: string;
  /** Command to run for importing handoff (default: '/importHandoff') */
  importCommand: string;
  /** Timeout in ms for waiting for handoff file to be written (default: 60000) */
  timeoutMs: number;
  /** Poll interval in ms for checking handoff file (default: 1000) */
  pollIntervalMs: number;
  /** Delay in ms after export before killing session (default: 2000) */
  exportDelayMs: number;
  /** Delay in ms after starting new session before importing (default: 3000) */
  importDelayMs: number;
  /** Whether auto-handoff is enabled (default: true) */
  enabled: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_AUTO_HANDOFF_CONFIG: AutoHandoffConfig = {
  thresholdPercent: 20,
  exportCommand: '/exportHandoff',
  importCommand: '/importHandoff',
  timeoutMs: 60_000,
  pollIntervalMs: 1_000,
  exportDelayMs: 2_000,
  importDelayMs: 3_000,
  enabled: true,
};

// ============================================================================
// Handoff State
// ============================================================================

/**
 * States during the handoff process
 */
export type HandoffState =
  | 'idle'
  | 'exporting'
  | 'waiting_file'
  | 'terminating'
  | 'creating_session'
  | 'importing'
  | 'complete'
  | 'failed';

/**
 * Handoff reason for tracking
 */
export type HandoffReason =
  | 'context_low'
  | 'manual';

/**
 * Tracked handoff in progress
 */
export interface ActiveHandoff {
  /** Session ID being handed off */
  fromSessionId: string;
  /** Project ID */
  projectId: string;
  /** Ticket ID (if ticket session) */
  ticketId: string | null;
  /** Path to handoff file */
  handoffPath: string;
  /** Current state */
  state: HandoffState;
  /** Reason for handoff */
  reason: HandoffReason;
  /** Context percentage at handoff trigger */
  contextAtHandoff: number;
  /** Timestamp when handoff started */
  startedAt: Date;
  /** File modification time before export (to detect write) */
  initialFileMtime: number | null;
  /** Abort controller for cancellation */
  abortController: AbortController;
}

// ============================================================================
// Events
// ============================================================================

/**
 * Event emitted when handoff process starts
 */
export interface HandoffStartedEvent {
  /** Session being handed off */
  sessionId: string;
  /** Project ID */
  projectId: string;
  /** Ticket ID (if ticket session) */
  ticketId: string | null;
  /** Reason for handoff */
  reason: HandoffReason;
  /** Context percentage at trigger */
  contextPercent: number;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Event emitted when handoff completes successfully
 */
export interface HandoffCompletedEvent {
  /** Original session ID */
  fromSessionId: string;
  /** New session ID */
  toSessionId: string;
  /** Project ID */
  projectId: string;
  /** Ticket ID (if ticket session) */
  ticketId: string | null;
  /** Context percentage at handoff */
  contextAtHandoff: number;
  /** Duration of handoff process in ms */
  durationMs: number;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Event emitted when handoff fails
 */
export interface HandoffFailedEvent {
  /** Session that was being handed off */
  sessionId: string;
  /** Project ID */
  projectId: string;
  /** Error message */
  error: string;
  /** State at which failure occurred */
  failedAtState: HandoffState;
  /** Whether session was left running (fallback) */
  sessionPreserved: boolean;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Event emitted during handoff progress
 */
export interface HandoffProgressEvent {
  /** Session being handed off */
  sessionId: string;
  /** Current state */
  state: HandoffState;
  /** Progress message */
  message: string;
  /** Timestamp */
  timestamp: Date;
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base error class for auto-handoff errors
 */
export class AutoHandoffError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'AutoHandoffError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when handoff is already in progress for a session
 */
export class HandoffInProgressError extends AutoHandoffError {
  constructor(public readonly sessionId: string) {
    super(`Handoff already in progress for session: ${sessionId}`, 'HANDOFF_IN_PROGRESS');
    this.name = 'HandoffInProgressError';
  }
}

/**
 * Error thrown when session is not eligible for handoff
 */
export class SessionNotEligibleError extends AutoHandoffError {
  constructor(
    public readonly sessionId: string,
    public readonly reason: string
  ) {
    super(`Session ${sessionId} not eligible for handoff: ${reason}`, 'SESSION_NOT_ELIGIBLE');
    this.name = 'SessionNotEligibleError';
  }
}

/**
 * Error thrown when handoff file write times out
 */
export class HandoffTimeoutError extends AutoHandoffError {
  constructor(
    public readonly sessionId: string,
    public readonly timeoutMs: number
  ) {
    super(`Handoff file not written within ${timeoutMs}ms for session: ${sessionId}`, 'HANDOFF_TIMEOUT');
    this.name = 'HandoffTimeoutError';
  }
}

/**
 * Error thrown when handoff is cancelled
 */
export class HandoffCancelledError extends AutoHandoffError {
  constructor(public readonly sessionId: string) {
    super(`Handoff cancelled for session: ${sessionId}`, 'HANDOFF_CANCELLED');
    this.name = 'HandoffCancelledError';
  }
}

/**
 * Error thrown when project is not found
 */
export class HandoffProjectNotFoundError extends AutoHandoffError {
  constructor(public readonly projectId: string) {
    super(`Project not found: ${projectId}`, 'PROJECT_NOT_FOUND');
    this.name = 'HandoffProjectNotFoundError';
  }
}

/**
 * Error thrown when handoff file cannot be found
 */
export class HandoffFileNotFoundError extends AutoHandoffError {
  constructor(public readonly path: string) {
    super(`Handoff file not found: ${path}`, 'HANDOFF_FILE_NOT_FOUND');
    this.name = 'HandoffFileNotFoundError';
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build the continuation prompt for the new session after import
 */
export function buildContinuationPrompt(ticketId: string | null, ticketExternalId?: string): string {
  if (ticketId && ticketExternalId) {
    return `Continue working on ticket ${ticketExternalId}. Your context was just restored from a handoff.`;
  }
  return 'Your context was just restored from a handoff. Continue where you left off.';
}

/**
 * Format handoff notification message
 */
export function formatHandoffNotification(
  type: 'starting' | 'complete' | 'failed',
  details: { sessionId: string; contextPercent?: number; error?: string; newSessionId?: string }
): string {
  switch (type) {
    case 'starting':
      return `Context low (${details.contextPercent}% used). Starting automatic handoff...`;
    case 'complete':
      return `Handoff complete. New session: ${details.newSessionId}`;
    case 'failed':
      return `Handoff failed: ${details.error}. Session preserved.`;
  }
}

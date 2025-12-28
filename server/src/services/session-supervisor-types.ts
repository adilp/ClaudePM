/**
 * Session Supervisor Types
 * Type definitions and error classes for the session supervisor service
 */

import type { SessionType, SessionStatus } from '../generated/prisma/index.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * In-memory representation of an active session
 */
export interface ActiveSession {
  /** Database session ID */
  id: string;
  /** Project ID */
  projectId: string;
  /** Optional ticket ID (null for ad-hoc sessions) */
  ticketId: string | null;
  /** Session type */
  type: SessionType;
  /** Current status */
  status: SessionStatus;
  /** tmux pane ID (e.g., "%5") */
  paneId: string;
  /** Process ID running in the pane */
  pid: number;
  /** Session start time */
  startedAt: Date;
  /** Output ring buffer */
  outputBuffer: RingBuffer<string>;
  /** Hash of last captured output to detect changes */
  lastOutputHash?: string;
}

/**
 * Options for starting an ad-hoc session
 */
export interface StartSessionOptions {
  /** Project ID to start session in */
  projectId: string;
  /** Optional initial prompt to send */
  initialPrompt?: string;
  /** Optional working directory override */
  cwd?: string;
}

/**
 * Options for starting a ticket session
 */
export interface StartTicketSessionOptions extends StartSessionOptions {
  /** Ticket ID to work on */
  ticketId: string;
}

/**
 * Session state change event data
 */
export interface SessionStateChangeEvent {
  /** Session ID */
  sessionId: string;
  /** Previous status */
  previousStatus: SessionStatus;
  /** New status */
  newStatus: SessionStatus;
  /** Timestamp of change */
  timestamp: Date;
  /** Optional error message if status is 'error' */
  error?: string;
}

/**
 * Session output event data
 */
export interface SessionOutputEvent {
  /** Session ID */
  sessionId: string;
  /** Output lines */
  lines: string[];
  /** Whether output includes ANSI codes */
  raw: boolean;
}

/**
 * Session process exit event data
 */
export interface SessionExitEvent {
  /** Session ID */
  sessionId: string;
  /** Exit code (null if process was killed) */
  exitCode: number | null;
  /** Whether this was a normal exit */
  normal: boolean;
  /** Timestamp of exit */
  timestamp: Date;
}

/**
 * Session information returned from API
 */
export interface SessionInfo {
  id: string;
  projectId: string;
  ticketId: string | null;
  type: SessionType;
  status: SessionStatus;
  contextPercent: number;
  paneId: string;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Recovery information for a session found in tmux
 */
export interface RecoveredSession {
  /** Database session ID */
  sessionId: string;
  /** tmux pane ID */
  paneId: string;
  /** Whether the pane is still alive */
  isAlive: boolean;
  /** Current PID in the pane */
  pid: number | null;
}

/**
 * Result of syncing sessions with tmux state
 */
export interface SyncSessionsResult {
  /** Sessions that were found to be orphaned (pane gone) and marked as completed */
  orphanedSessions: Array<{
    sessionId: string;
    paneId: string;
    paneTitle: string | null;
  }>;
  /** Sessions that are still alive */
  aliveSessions: Array<{
    sessionId: string;
    paneId: string;
    paneTitle: string | null;
  }>;
  /** Total sessions checked */
  totalChecked: number;
}

// ============================================================================
// Ring Buffer Implementation
// ============================================================================

/**
 * A circular buffer with fixed capacity that automatically evicts oldest items
 */
export class RingBuffer<T> {
  private buffer: T[];
  private head: number = 0;
  private tail: number = 0;
  private count: number = 0;

  constructor(private readonly capacity: number) {
    if (capacity < 1) {
      throw new Error('RingBuffer capacity must be at least 1');
    }
    this.buffer = new Array<T>(capacity);
  }

  /**
   * Add an item to the buffer
   * If buffer is full, oldest item is evicted
   */
  push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;

    if (this.count < this.capacity) {
      this.count++;
    } else {
      // Buffer is full, move head to evict oldest
      this.head = (this.head + 1) % this.capacity;
    }
  }

  /**
   * Add multiple items to the buffer
   */
  pushMany(items: T[]): void {
    for (const item of items) {
      this.push(item);
    }
  }

  /**
   * Get all items in the buffer in order (oldest to newest)
   */
  toArray(): T[] {
    if (this.count === 0) {
      return [];
    }

    const result: T[] = [];
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity;
      result.push(this.buffer[idx] as T);
    }
    return result;
  }

  /**
   * Get the last N items (newest)
   */
  last(n: number): T[] {
    if (n <= 0 || this.count === 0) {
      return [];
    }

    const takeCount = Math.min(n, this.count);
    const result: T[] = [];
    const startOffset = this.count - takeCount;

    for (let i = 0; i < takeCount; i++) {
      const idx = (this.head + startOffset + i) % this.capacity;
      result.push(this.buffer[idx] as T);
    }
    return result;
  }

  /**
   * Get the current number of items in the buffer
   */
  get size(): number {
    return this.count;
  }

  /**
   * Get the maximum capacity of the buffer
   */
  get maxCapacity(): number {
    return this.capacity;
  }

  /**
   * Clear all items from the buffer
   */
  clear(): void {
    this.buffer = new Array<T>(this.capacity);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }

  /**
   * Check if the buffer is empty
   */
  isEmpty(): boolean {
    return this.count === 0;
  }

  /**
   * Check if the buffer is full
   */
  isFull(): boolean {
    return this.count === this.capacity;
  }
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base error class for session supervisor errors
 */
export class SessionSupervisorError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'SessionSupervisorError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when a session is not found
 */
export class SessionNotFoundError extends SessionSupervisorError {
  constructor(public readonly sessionId: string) {
    super(`Session not found: ${sessionId}`, 'SESSION_NOT_FOUND');
    this.name = 'SessionNotFoundError';
  }
}

/**
 * Error thrown when a project is not found
 */
export class SessionProjectNotFoundError extends SessionSupervisorError {
  constructor(public readonly projectId: string) {
    super(`Project not found: ${projectId}`, 'PROJECT_NOT_FOUND');
    this.name = 'SessionProjectNotFoundError';
  }
}

/**
 * Error thrown when a ticket is not found
 */
export class SessionTicketNotFoundError extends SessionSupervisorError {
  constructor(public readonly ticketId: string) {
    super(`Ticket not found: ${ticketId}`, 'TICKET_NOT_FOUND');
    this.name = 'SessionTicketNotFoundError';
  }
}

/**
 * Error thrown when trying to start a session but one is already running
 */
export class SessionAlreadyRunningError extends SessionSupervisorError {
  constructor(
    public readonly projectId: string,
    public readonly existingSessionId: string
  ) {
    super(
      `A session is already running for project ${projectId}: ${existingSessionId}`,
      'SESSION_ALREADY_RUNNING'
    );
    this.name = 'SessionAlreadyRunningError';
  }
}

/**
 * Error thrown when trying to stop a session that isn't running
 */
export class SessionNotRunningError extends SessionSupervisorError {
  constructor(
    public readonly sessionId: string,
    public readonly currentStatus: SessionStatus
  ) {
    super(
      `Session ${sessionId} is not running (current status: ${currentStatus})`,
      'SESSION_NOT_RUNNING'
    );
    this.name = 'SessionNotRunningError';
  }
}

/**
 * Error thrown when session creation fails
 */
export class SessionCreationError extends SessionSupervisorError {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message, 'SESSION_CREATION_FAILED');
    this.name = 'SessionCreationError';
  }
}

/**
 * Error thrown when sending input to a session fails
 */
export class SessionInputError extends SessionSupervisorError {
  constructor(
    public readonly sessionId: string,
    message: string
  ) {
    super(`Failed to send input to session ${sessionId}: ${message}`, 'SESSION_INPUT_FAILED');
    this.name = 'SessionInputError';
  }
}

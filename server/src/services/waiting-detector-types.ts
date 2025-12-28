/**
 * Waiting Detector Types
 * Type definitions for multi-layer waiting state detection
 */

// ============================================================================
// Waiting Reason Types
// ============================================================================

/**
 * Why Claude is waiting for input
 */
export type WaitingReason =
  | 'permission_prompt' // Tool approval needed (Layer 1/2)
  | 'idle_prompt' // Idle timeout (Layer 1)
  | 'question' // Claude asked a question (Layer 3)
  | 'context_exhausted' // Context limit reached (Layer 2)
  | 'stopped' // Claude stopped/finished (Layer 1)
  | 'unknown'; // Generic waiting state

/**
 * Source layer that detected the waiting state
 */
export type DetectionLayer = 'hook' | 'jsonl' | 'output_pattern';

/**
 * Claude Code hook event types
 */
export type HookEventType = 'Notification' | 'Stop';

// ============================================================================
// Event Types
// ============================================================================

/**
 * Waiting state change event
 */
export interface WaitingStateEvent {
  /** Session ID */
  sessionId: string;
  /** Whether Claude is waiting for input */
  waiting: boolean;
  /** Reason for waiting state */
  reason?: WaitingReason;
  /** Which detection layer detected the state */
  detectedBy: DetectionLayer;
  /** Timestamp of state change */
  timestamp: Date;
  /** Optional context (e.g., matched pattern, tool name) */
  context?: string;
}

/**
 * Internal signal from any detection layer
 */
export interface WaitingSignal {
  /** Session ID */
  sessionId: string;
  /** Whether Claude is waiting for input */
  waiting: boolean;
  /** Reason for waiting state */
  reason: WaitingReason;
  /** Which layer produced this signal */
  layer: DetectionLayer;
  /** Timestamp of signal */
  timestamp: Date;
  /** Optional context information */
  context?: string;
}

// ============================================================================
// Hook Payload Types
// ============================================================================

/**
 * Claude Code hook payload (from HTTP endpoint)
 */
export interface ClaudeHookPayload {
  /** Hook event name from Claude Code (e.g., "Notification", "Stop") */
  hook_event_name?: string;
  /** Notification type (e.g., "permission_prompt", "idle_prompt") - for Notification events */
  notification_type?: string;
  /** Human-readable message (e.g., "Claude needs your permission to use Bash") */
  message?: string;
  /** Session ID from Claude Code */
  session_id?: string;
  /** Path to transcript JSONL file */
  transcript_path?: string;
  /** Current working directory */
  cwd?: string;
  /** Permission mode (e.g., "default", "plan", "acceptEdits", "bypassPermissions") */
  permission_mode?: string;
  /** For Stop hooks - true if Claude is continuing from a previous stop hook */
  stop_hook_active?: boolean;

  // Legacy fields for backwards compatibility
  /** @deprecated Use hook_event_name instead */
  event?: string;
  /** @deprecated Use notification_type instead */
  matcher?: string;
  timestamp?: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Output pattern configuration
 */
export interface OutputPatternConfig {
  /** Patterns that trigger immediately (no idle wait) */
  immediate: string[];
  /** Patterns that require idle time before triggering */
  questionPatterns: string[];
  /** Patterns that indicate task completion (triggers review) */
  completionPatterns: string[];
  /** Seconds of idle required for question patterns */
  idleThresholdSeconds: number;
}

/**
 * Full waiting detector configuration
 */
export interface WaitingDetectorConfig {
  /** Enable/disable Layer 1 (hooks) */
  enableHooks: boolean;
  /** Enable/disable Layer 2 (JSONL) */
  enableJsonl: boolean;
  /** Enable/disable Layer 3 (output patterns) */
  enableOutputPatterns: boolean;
  /** Output pattern settings */
  outputPatterns: OutputPatternConfig;
  /** Debounce delay in ms for consolidated events */
  debounceMs: number;
  /** Time to wait before clearing waiting state after activity (ms) */
  clearDelayMs: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_WAITING_DETECTOR_CONFIG: WaitingDetectorConfig = {
  enableHooks: true,
  enableJsonl: true,
  enableOutputPatterns: true,
  outputPatterns: {
    immediate: [
      'Do you want to proceed?',
      '\u256D\u2500', // "╭─" - Permission prompt box character
      'Allow this action?',
      'Approve tool use?',
    ],
    questionPatterns: [
      '\\?$', // Line ending with question mark
      'What would you like',
      'Should I',
      'Does this look',
      'Would you prefer',
      'Can you clarify',
      'Which option',
    ],
    completionPatterns: [
      '---TASK_COMPLETE---',
    ],
    idleThresholdSeconds: 5,
  },
  debounceMs: 500,
  clearDelayMs: 2000,
};

// ============================================================================
// Monitored Session State
// ============================================================================

/**
 * Per-session state tracked by WaitingDetector
 */
export interface WaitingSessionState {
  /** Session ID */
  sessionId: string;
  /** Whether currently waiting for input */
  isWaiting: boolean;
  /** Last detected waiting reason */
  lastWaitingReason?: WaitingReason;
  /** Last signal timestamp */
  lastSignalTime: Date;
  /** Last output activity timestamp for idle detection */
  lastOutputTime: Date;
  /** Whether threshold notification has been sent */
  thresholdNotified: boolean;
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base error class for waiting detector errors
 */
export class WaitingDetectorError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'WaitingDetectorError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when session is not being watched
 */
export class SessionNotWatchedError extends WaitingDetectorError {
  constructor(public readonly sessionId: string) {
    super(`Session is not being watched: ${sessionId}`, 'SESSION_NOT_WATCHED');
    this.name = 'SessionNotWatchedError';
  }
}

/**
 * Error thrown when session is already being watched
 */
export class SessionAlreadyWatchedError extends WaitingDetectorError {
  constructor(public readonly sessionId: string) {
    super(`Session is already being watched: ${sessionId}`, 'SESSION_ALREADY_WATCHED');
    this.name = 'SessionAlreadyWatchedError';
  }
}

/**
 * Error thrown when hook payload is invalid
 */
export class InvalidHookPayloadError extends WaitingDetectorError {
  constructor(
    public readonly reason: string,
    public readonly payload?: unknown
  ) {
    super(`Invalid hook payload: ${reason}`, 'INVALID_HOOK_PAYLOAD');
    this.name = 'InvalidHookPayloadError';
  }
}

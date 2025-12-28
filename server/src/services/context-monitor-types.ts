/**
 * Context Monitor Types
 * Type definitions and error classes for the JSONL transcript context monitor
 */

/* global AbortController */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * JSONL usage data extracted from Claude Code transcripts
 */
export interface UsageData {
  /** Input tokens used */
  input_tokens: number;
  /** Tokens used for cache creation */
  cache_creation_input_tokens?: number;
  /** Tokens read from cache */
  cache_read_input_tokens?: number;
  /** Output tokens generated */
  output_tokens?: number;
}

/**
 * Parsed JSONL entry from transcript
 */
export interface TranscriptEntry {
  /** Unique message identifier */
  uuid?: string;
  /** Message type */
  type?: string;
  /** Stop reason for the response */
  stop_reason?: string | null;
  /** Content blocks (may contain tool_use) */
  content?: TranscriptContentBlock[];
  /** Usage statistics */
  usage?: UsageData;
  /** Timestamp of the entry */
  timestamp?: string;
}

/**
 * Content block within a transcript entry
 */
export interface TranscriptContentBlock {
  /** Type of content block */
  type: string;
  /** Tool name if type is 'tool_use' */
  name?: string;
  /** Tool input if type is 'tool_use' */
  input?: Record<string, unknown>;
  /** Text content if type is 'text' */
  text?: string;
}

/**
 * Claude session state detected from JSONL entries
 */
export type ClaudeSessionState =
  | 'active' // Claude is processing
  | 'waiting_approval' // Waiting for tool use approval
  | 'completed' // Response completed (end_turn)
  | 'context_exhausted' // Context limit reached (max_tokens)
  | 'unknown'; // State could not be determined

/**
 * Context update event data
 */
export interface ContextUpdateEvent {
  /** Session ID */
  sessionId: string;
  /** Current context usage percentage (0-100) */
  contextPercent: number;
  /** Total tokens used */
  totalTokens: number;
  /** Timestamp of update */
  timestamp: Date;
}

/**
 * Context threshold event data (emitted when remaining context is low)
 */
export interface ContextThresholdEvent {
  /** Session ID */
  sessionId: string;
  /** Current context usage percentage (0-100) */
  contextPercent: number;
  /** Threshold that was crossed (remaining percentage) */
  threshold: number;
  /** Timestamp of event */
  timestamp: Date;
}

/**
 * Claude state change event data
 */
export interface ClaudeStateChangeEvent {
  /** Session ID */
  sessionId: string;
  /** Previous state */
  previousState: ClaudeSessionState;
  /** New state */
  newState: ClaudeSessionState;
  /** Timestamp of change */
  timestamp: Date;
}

/**
 * Monitored session tracking information
 */
export interface MonitoredSession {
  /** Session ID */
  sessionId: string;
  /** Path to the transcript file being monitored */
  transcriptPath: string;
  /** Current file position (bytes read) */
  filePosition: number;
  /** Current context percentage */
  contextPercent: number;
  /** Total tokens used */
  totalTokens: number;
  /** Current Claude session state */
  claudeState: ClaudeSessionState;
  /** File watcher abort controller */
  abortController: AbortController;
  /** Last known usage data */
  lastUsage: UsageData | null;
  /** Whether threshold notification has been sent */
  thresholdNotified: boolean;
}

/**
 * Options for starting context monitoring
 */
export interface StartMonitoringOptions {
  /** Session ID to monitor */
  sessionId: string;
  /** Optional explicit path to transcript file */
  transcriptPath?: string;
  /** Project ID (used to discover transcript path) */
  projectId?: string;
}

// ============================================================================
// Configuration Constants
// ============================================================================

/** Claude's maximum context window size in tokens */
export const MAX_CONTEXT_TOKENS = 200_000;

/** Default threshold for remaining context (percentage) */
export const DEFAULT_THRESHOLD_PERCENT = 20;

/** Polling interval for file changes in milliseconds */
export const FILE_POLL_INTERVAL = 1_000;

/** Debounce delay for context updates in milliseconds */
export const UPDATE_DEBOUNCE_MS = 500;

/** Claude projects directory base path */
export const CLAUDE_PROJECTS_BASE = '~/.claude/projects';

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base error class for context monitor errors
 */
export class ContextMonitorError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'ContextMonitorError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when transcript file is not found
 */
export class TranscriptNotFoundError extends ContextMonitorError {
  constructor(public readonly path: string) {
    super(`Transcript file not found: ${path}`, 'TRANSCRIPT_NOT_FOUND');
    this.name = 'TranscriptNotFoundError';
  }
}

/**
 * Error thrown when session is not being monitored
 */
export class SessionNotMonitoredError extends ContextMonitorError {
  constructor(public readonly sessionId: string) {
    super(`Session is not being monitored: ${sessionId}`, 'SESSION_NOT_MONITORED');
    this.name = 'SessionNotMonitoredError';
  }
}

/**
 * Error thrown when session is already being monitored
 */
export class SessionAlreadyMonitoredError extends ContextMonitorError {
  constructor(public readonly sessionId: string) {
    super(`Session is already being monitored: ${sessionId}`, 'SESSION_ALREADY_MONITORED');
    this.name = 'SessionAlreadyMonitoredError';
  }
}

/**
 * Error thrown when transcript path cannot be discovered
 */
export class TranscriptDiscoveryError extends ContextMonitorError {
  constructor(
    public readonly sessionId: string,
    reason: string
  ) {
    super(`Failed to discover transcript for session ${sessionId}: ${reason}`, 'TRANSCRIPT_DISCOVERY_FAILED');
    this.name = 'TranscriptDiscoveryError';
  }
}

/**
 * Error thrown when JSONL parsing fails
 */
export class JSONLParseError extends ContextMonitorError {
  constructor(
    public readonly line: number,
    public readonly content: string,
    public readonly parseError: string
  ) {
    super(`Failed to parse JSONL at line ${line}: ${parseError}`, 'JSONL_PARSE_ERROR');
    this.name = 'JSONLParseError';
  }
}

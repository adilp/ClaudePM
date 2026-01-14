/**
 * Session Analyzer Types
 * Type definitions for Claude Agent SDK-powered session analysis
 */

// ============================================================================
// Analysis Result Types
// ============================================================================

/**
 * Structured review report for UI
 */
export interface ReviewReport {
  /** Session ID */
  sessionId: string;
  /** Ticket ID */
  ticketId: string;
  /** Ticket title */
  ticketTitle: string;
  /** Overall completion assessment */
  completionStatus: 'complete' | 'partial' | 'blocked' | 'unclear';
  /** Confidence level (0-100) */
  confidence: number;
  /** What was accomplished */
  accomplished: string[];
  /** What remains to be done (if any) */
  remaining: string[];
  /** Potential issues or concerns */
  concerns: string[];
  /** Suggested next steps */
  nextSteps: string[];
  /** Generated commit message */
  suggestedCommitMessage: string | undefined;
  /** Generated PR description */
  suggestedPrDescription: string | undefined;
  /** Timestamp */
  generatedAt: Date;
}

/**
 * Real-time activity event for streaming to UI
 */
export interface ActivityEvent {
  /** Session ID */
  sessionId: string;
  /** Event type */
  type: 'tool_use' | 'thinking' | 'text' | 'error' | 'milestone';
  /** Tool name (for tool_use) */
  tool: string | undefined;
  /** Brief description */
  description: string;
  /** Additional details */
  details?: Record<string, unknown>;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Commit message generation result
 */
export interface CommitMessageResult {
  /** The commit message */
  message: string;
  /** Commit type (conventional commits) */
  type: 'feat' | 'fix' | 'refactor' | 'docs' | 'test' | 'chore';
  /** Scope (optional) */
  scope: string | undefined;
  /** Breaking change flag */
  breaking: boolean;
}

/**
 * PR description generation result
 */
export interface PrDescriptionResult {
  /** PR title */
  title: string;
  /** PR body (markdown) */
  body: string;
  /** Suggested labels */
  labels: string[];
}

// ============================================================================
// Request Types
// ============================================================================

/**
 * Request to generate a review report
 */
export interface ReviewReportRequest {
  /** Session ID */
  sessionId: string;
  /** Ticket ID */
  ticketId: string;
  /** Ticket title */
  ticketTitle: string;
  /** Ticket content */
  ticketContent: string;
  /** Session output */
  sessionOutput: string;
  /** Git diff */
  gitDiff: string;
  /** Test output (optional) */
  testOutput?: string;
}

/**
 * Request to generate commit message
 */
export interface CommitMessageRequest {
  /** Git diff */
  gitDiff: string;
  /** Ticket content (optional) */
  ticketContent?: string;
  /** Session summary (optional) */
  sessionSummary?: string;
}

/**
 * Request to generate PR description
 */
export interface PrDescriptionRequest {
  /** Ticket content */
  ticketContent: string;
  /** Git diff */
  gitDiff: string;
  /** Commit messages in this PR */
  commitMessages: string[];
  /** Session summary (optional) */
  sessionSummary?: string;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Session analyzer configuration
 */
export interface SessionAnalyzerConfig {
  /** Model to use for analysis (default: claude-sonnet-4-20250514) */
  model: string;
  /** Max tokens for responses */
  maxTokens: number;
  /** Timeout in ms */
  timeoutMs: number;
  /** Whether to enable activity streaming */
  enableActivityStreaming: boolean;
  /** Number of output lines to include in analysis */
  outputLinesToAnalyze: number;
}

/**
 * Available models (cheapest to most capable):
 * - claude-3-5-haiku-20241022 (fastest, cheapest - good for summaries)
 * - claude-sonnet-4-20250514 (balanced)
 * - claude-opus-4-20250514 (most capable)
 */
export const DEFAULT_ANALYZER_CONFIG: SessionAnalyzerConfig = {
  model: process.env.ANALYZER_MODEL || 'claude-3-5-haiku-20241022',
  maxTokens: 2048,
  timeoutMs: 60_000,
  enableActivityStreaming: true,
  outputLinesToAnalyze: 200,
};

// ============================================================================
// Events
// ============================================================================

/**
 * Events emitted by SessionAnalyzer
 */
export interface SessionAnalyzerEvents {
  'analysis:review': (report: ReviewReport) => void;
  'analysis:activity': (event: ActivityEvent) => void;
  'analysis:error': (error: Error, sessionId: string) => void;
}

// ============================================================================
// Error Classes
// ============================================================================

export class SessionAnalyzerError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'SessionAnalyzerError';
  }
}

export class AnalysisTimeoutError extends SessionAnalyzerError {
  constructor(timeoutMs: number) {
    super(`Analysis timed out after ${timeoutMs}ms`, 'ANALYSIS_TIMEOUT');
    this.name = 'AnalysisTimeoutError';
  }
}

export class AnalysisParseError extends SessionAnalyzerError {
  constructor(
    message: string,
    public readonly rawOutput: string
  ) {
    super(message, 'ANALYSIS_PARSE_ERROR');
    this.name = 'AnalysisParseError';
  }
}

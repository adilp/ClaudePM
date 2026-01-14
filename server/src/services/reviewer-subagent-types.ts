/**
 * Reviewer Subagent Types
 * Type definitions for the completion detection reviewer
 */

// ============================================================================
// Review Decision Types
// ============================================================================

/**
 * Possible decisions from the reviewer
 */
export type ReviewDecision = 'complete' | 'not_complete' | 'needs_clarification';

/**
 * Result of a review
 */
export interface ReviewResult {
  decision: ReviewDecision;
  reasoning: string;
  rawOutput: string;
  timestamp: Date;
}

/**
 * Input assembled for review
 */
export interface ReviewInput {
  ticketId: string;
  ticketContent: string;
  gitDiff: string;
  testOutput: string;
  sessionOutput: string;
}

/**
 * Review request
 */
export interface ReviewRequest {
  sessionId: string;
  ticketId: string;
  trigger: ReviewTrigger;
}

/**
 * What triggered the review
 */
export type ReviewTrigger = 'stop_hook' | 'idle_timeout' | 'completion_signal' | 'manual';

// ============================================================================
// Events
// ============================================================================

/**
 * Event emitted when a review starts
 */
export interface ReviewStartedEvent {
  sessionId: string;
  ticketId: string;
  trigger: ReviewTrigger;
  timestamp: Date;
}

/**
 * Event emitted when a review completes
 */
export interface ReviewCompletedEvent {
  sessionId: string;
  ticketId: string;
  result: ReviewResult;
  timestamp: Date;
}

/**
 * Event emitted when a review fails
 */
export interface ReviewFailedEvent {
  sessionId: string;
  ticketId: string;
  error: string;
  timestamp: Date;
}

/**
 * Events emitted by the reviewer subagent service
 */
export interface ReviewerSubagentEvents {
  'review:started': (event: ReviewStartedEvent) => void;
  'review:completed': (event: ReviewCompletedEvent) => void;
  'review:failed': (event: ReviewFailedEvent) => void;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Reviewer subagent configuration
 */
export interface ReviewerSubagentConfig {
  /** Timeout for the review process in milliseconds (default: 30000) */
  timeoutMs: number;
  /** Number of session output lines to include (default: 100) */
  sessionOutputLines: number;
  /** Whether to enable automatic reviews on stop hook (default: false) */
  enableStopHookReview: boolean;
  /** Idle time in ms before triggering review (default: 60000) */
  idleTimeoutMs: number;
  /** Whether to enable idle timeout reviews (default: true) */
  enableIdleReview: boolean;
  /** Path to claude CLI (default: 'claude') */
  claudeCliPath: string;
  /** Model to use for review (default: uses CLI default) */
  model?: string;
}

export const DEFAULT_REVIEWER_CONFIG: ReviewerSubagentConfig = {
  timeoutMs: 30_000,
  sessionOutputLines: 100,
  enableStopHookReview: false, // Disabled to reduce API costs - only review on idle
  idleTimeoutMs: 60_000,
  enableIdleReview: true,
  claudeCliPath: 'claude',
  model: 'claude-3-5-haiku-20241022', // Use Haiku for cost efficiency
};

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base error for reviewer operations
 */
export class ReviewerError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'ReviewerError';
  }
}

/**
 * Error when Claude CLI is not available
 */
export class ClaudeCliNotFoundError extends ReviewerError {
  constructor() {
    super('Claude CLI not found. Ensure "claude" is installed and in PATH.', 'CLAUDE_CLI_NOT_FOUND');
    this.name = 'ClaudeCliNotFoundError';
  }
}

/**
 * Error when review times out
 */
export class ReviewTimeoutError extends ReviewerError {
  constructor(timeoutMs: number) {
    super(`Review timed out after ${timeoutMs}ms`, 'REVIEW_TIMEOUT');
    this.name = 'ReviewTimeoutError';
  }
}

/**
 * Error when parsing review output fails
 */
export class ReviewParseError extends ReviewerError {
  constructor(
    message: string,
    public rawOutput: string
  ) {
    super(message, 'REVIEW_PARSE_ERROR');
    this.name = 'ReviewParseError';
  }
}

/**
 * Error when ticket is not found
 */
export class ReviewTicketNotFoundError extends ReviewerError {
  constructor(ticketId: string) {
    super(`Ticket not found: ${ticketId}`, 'TICKET_NOT_FOUND');
    this.name = 'ReviewTicketNotFoundError';
  }
}

/**
 * Error when session is not found
 */
export class ReviewSessionNotFoundError extends ReviewerError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`, 'SESSION_NOT_FOUND');
    this.name = 'ReviewSessionNotFoundError';
  }
}

/**
 * Error when git operations fail
 */
export class GitOperationError extends ReviewerError {
  constructor(
    operation: string,
    public stderr: string
  ) {
    super(`Git ${operation} failed: ${stderr}`, 'GIT_OPERATION_ERROR');
    this.name = 'GitOperationError';
  }
}

// ============================================================================
// Prompt Template
// ============================================================================

/**
 * Generate the review prompt
 */
export function generateReviewPrompt(input: ReviewInput): string {
  return `You are reviewing whether a ticket has been completed.

## Ticket Requirements
${input.ticketContent}

## Changes Made (git diff)
${input.gitDiff || 'No changes detected or git not available'}

## Test Results
${input.testOutput || 'No test output available'}

## Recent Session Output
${input.sessionOutput || 'No session output available'}

Based on the above, is this ticket complete?

IMPORTANT: You must respond with EXACTLY one of these words on the first line:
- COMPLETE (if all requirements are met)
- NOT_COMPLETE (if work is still needed)
- NEEDS_CLARIFICATION (if requirements are unclear or you need more information)

Then provide a brief explanation (1-3 sentences) on the following lines.

Example response:
COMPLETE
All acceptance criteria have been met. Tests are passing and the implementation matches the requirements.`;
}

// ============================================================================
// Output Parser
// ============================================================================

/**
 * Parse the reviewer output to extract decision and reasoning
 */
export function parseReviewOutput(output: string): ReviewResult {
  const trimmed = output.trim();
  const lines = trimmed.split('\n');

  if (lines.length === 0 || !lines[0]) {
    throw new ReviewParseError('Empty response from reviewer', output);
  }

  const firstLine = lines[0].trim().toUpperCase();

  let decision: ReviewDecision;

  if (firstLine === 'COMPLETE' || firstLine.startsWith('COMPLETE')) {
    decision = 'complete';
  } else if (firstLine === 'NOT_COMPLETE' || firstLine.startsWith('NOT_COMPLETE')) {
    decision = 'not_complete';
  } else if (firstLine === 'NEEDS_CLARIFICATION' || firstLine.startsWith('NEEDS_CLARIFICATION')) {
    decision = 'needs_clarification';
  } else {
    // Try to find the decision anywhere in the first few lines
    const searchText = lines.slice(0, 3).join(' ').toUpperCase();

    if (searchText.includes('COMPLETE') && !searchText.includes('NOT_COMPLETE') && !searchText.includes('NOT COMPLETE')) {
      decision = 'complete';
    } else if (searchText.includes('NOT_COMPLETE') || searchText.includes('NOT COMPLETE')) {
      decision = 'not_complete';
    } else if (searchText.includes('NEEDS_CLARIFICATION') || searchText.includes('NEEDS CLARIFICATION')) {
      decision = 'needs_clarification';
    } else {
      throw new ReviewParseError(
        `Could not parse decision from output. Expected COMPLETE, NOT_COMPLETE, or NEEDS_CLARIFICATION. Got: "${firstLine}"`,
        output
      );
    }
  }

  // Extract reasoning (everything after the first line)
  const reasoning = lines.slice(1).join('\n').trim() || 'No reasoning provided';

  return {
    decision,
    reasoning,
    rawOutput: output,
    timestamp: new Date(),
  };
}

/**
 * Reviewer Subagent Service
 * Short-lived Claude process for ticket completion detection
 */

/* global AbortController, AbortSignal */

import { EventEmitter } from 'events';
import { exec, spawn, type ExecException } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { prisma } from '../config/db.js';
import { sessionSupervisor } from './session-supervisor.js';
import { ticketStateMachine } from './ticket-state-machine.js';
import { waitingDetector } from './waiting-detector.js';
import {
  type ReviewResult,
  type ReviewInput,
  type ReviewRequest,
  type ReviewTrigger,
  type ReviewerSubagentConfig,
  type ReviewerSubagentEvents,
  type ReviewStartedEvent,
  type ReviewCompletedEvent,
  type ReviewFailedEvent,
  DEFAULT_REVIEWER_CONFIG,
  generateReviewPrompt,
  parseReviewOutput,
  ReviewerError,
  ClaudeCliNotFoundError,
  ReviewTimeoutError,
  ReviewTicketNotFoundError,
} from './reviewer-subagent-types.js';

const execAsync = promisify(exec);

// ============================================================================
// Typed EventEmitter
// ============================================================================

class TypedEventEmitter extends EventEmitter {
  on<K extends keyof ReviewerSubagentEvents>(
    event: K,
    listener: ReviewerSubagentEvents[K]
  ): this {
    return super.on(event, listener);
  }

  off<K extends keyof ReviewerSubagentEvents>(
    event: K,
    listener: ReviewerSubagentEvents[K]
  ): this {
    return super.off(event, listener);
  }

  emit<K extends keyof ReviewerSubagentEvents>(
    event: K,
    ...args: Parameters<ReviewerSubagentEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}

// ============================================================================
// Reviewer Subagent Service
// ============================================================================

export class ReviewerSubagent extends TypedEventEmitter {
  private config: ReviewerSubagentConfig;
  private started = false;

  /** Active reviews in progress (sessionId -> AbortController) */
  private activeReviews: Map<string, AbortController> = new Map();

  /** Sessions with pending idle review timers */
  private idleTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /** Bound event handlers */
  private handleStopHook: ((event: { sessionId: string; waiting: boolean; reason?: string }) => void) | null = null;
  private handleSessionOutput: ((event: { sessionId: string }) => void) | null = null;

  constructor(config: Partial<ReviewerSubagentConfig> = {}) {
    super();
    this.config = { ...DEFAULT_REVIEWER_CONFIG, ...config };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start the reviewer service
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    // Subscribe to waiting detector for stop events
    if (this.config.enableStopHookReview) {
      this.handleStopHook = this.onStopHook.bind(this);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      waitingDetector.on('waiting:stateChange', this.handleStopHook as any);
    }

    // Subscribe to session output for idle detection
    if (this.config.enableIdleReview) {
      this.handleSessionOutput = this.onSessionOutput.bind(this);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      sessionSupervisor.on('session:output', this.handleSessionOutput as any);
    }
  }

  /**
   * Stop the reviewer service
   */
  stop(): void {
    if (!this.started) return;
    this.started = false;

    // Remove event listeners
    if (this.handleStopHook) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      waitingDetector.removeListener('waiting:stateChange', this.handleStopHook as any);
      this.handleStopHook = null;
    }

    if (this.handleSessionOutput) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      sessionSupervisor.removeListener('session:output', this.handleSessionOutput as any);
      this.handleSessionOutput = null;
    }

    // Cancel all active reviews
    for (const controller of this.activeReviews.values()) {
      controller.abort();
    }
    this.activeReviews.clear();

    // Clear all idle timers
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();

    this.removeAllListeners();
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  /**
   * Handle stop hook from waiting detector
   */
  private onStopHook(event: { sessionId: string; waiting: boolean; reason?: string }): void {
    // Only trigger on 'stopped' reason
    if (!event.waiting || event.reason !== 'stopped') return;

    this.triggerReviewForSession(event.sessionId, 'stop_hook').catch((err) => {
      console.error(`Failed to trigger stop hook review for session ${event.sessionId}:`, err);
    });
  }

  /**
   * Handle session output for idle detection
   */
  private onSessionOutput(event: { sessionId: string }): void {
    // Reset idle timer on any output
    this.resetIdleTimer(event.sessionId);
  }

  /**
   * Reset the idle timer for a session
   */
  private resetIdleTimer(sessionId: string): void {
    // Clear existing timer
    const existing = this.idleTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.idleTimers.delete(sessionId);
      this.triggerReviewForSession(sessionId, 'idle_timeout').catch((err) => {
        console.error(`Failed to trigger idle review for session ${sessionId}:`, err);
      });
    }, this.config.idleTimeoutMs);

    this.idleTimers.set(sessionId, timer);
  }

  // ==========================================================================
  // Review Trigger
  // ==========================================================================

  /**
   * Trigger a review for a session
   */
  async triggerReviewForSession(sessionId: string, trigger: ReviewTrigger): Promise<ReviewResult | null> {
    // Get session info to find associated ticket
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { ticket: true },
    });

    if (!session) {
      console.warn(`Cannot trigger review: session ${sessionId} not found`);
      return null;
    }

    if (!session.ticketId || !session.ticket) {
      // Session is not associated with a ticket, skip review
      return null;
    }

    // Only review tickets that are in_progress
    if (session.ticket.state !== 'in_progress') {
      return null;
    }

    return this.review({
      sessionId,
      ticketId: session.ticketId,
      trigger,
    });
  }

  /**
   * Manually trigger a review
   */
  async review(request: ReviewRequest): Promise<ReviewResult> {
    const { sessionId, ticketId, trigger } = request;

    // Check if review is already in progress for this session
    if (this.activeReviews.has(sessionId)) {
      throw new ReviewerError('Review already in progress for this session', 'REVIEW_IN_PROGRESS');
    }

    // Create abort controller for cancellation
    const abortController = new AbortController();
    this.activeReviews.set(sessionId, abortController);

    // Emit started event
    const startedEvent: ReviewStartedEvent = {
      sessionId,
      ticketId,
      trigger,
      timestamp: new Date(),
    };
    this.emit('review:started', startedEvent);

    try {
      // Assemble input
      const input = await this.assembleInput(sessionId, ticketId);

      // Execute review
      const result = await this.executeReview(input, abortController.signal);

      // Emit completed event
      const completedEvent: ReviewCompletedEvent = {
        sessionId,
        ticketId,
        result,
        timestamp: new Date(),
      };
      this.emit('review:completed', completedEvent);

      // Handle state transition based on decision
      await this.handleReviewResult(sessionId, ticketId, result);

      return result;
    } catch (error) {
      // Emit failed event
      const failedEvent: ReviewFailedEvent = {
        sessionId,
        ticketId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      };
      this.emit('review:failed', failedEvent);

      throw error;
    } finally {
      this.activeReviews.delete(sessionId);
    }
  }

  // ==========================================================================
  // Input Assembly
  // ==========================================================================

  /**
   * Assemble all input for the review
   */
  private async assembleInput(sessionId: string, ticketId: string): Promise<ReviewInput> {
    // Get ticket with project
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { project: true },
    });

    if (!ticket) {
      throw new ReviewTicketNotFoundError(ticketId);
    }

    // Get ticket content
    const ticketContent = await this.getTicketContent(ticket.project.repoPath, ticket.filePath);

    // Get git diff
    const gitDiff = await this.getGitDiff(ticket.project.repoPath);

    // Get test output (if available)
    const testOutput = await this.getTestOutput(ticket.project.repoPath);

    // Get session output
    const sessionOutput = this.getSessionOutput(sessionId);

    return {
      ticketId,
      ticketContent,
      gitDiff,
      testOutput,
      sessionOutput,
    };
  }

  /**
   * Get ticket content from file
   */
  private async getTicketContent(repoPath: string, filePath: string): Promise<string> {
    const absolutePath = join(repoPath, filePath);

    if (!existsSync(absolutePath)) {
      return '[Ticket file not found]';
    }

    try {
      return await readFile(absolutePath, 'utf-8');
    } catch (error) {
      return `[Error reading ticket file: ${error instanceof Error ? error.message : String(error)}]`;
    }
  }

  /**
   * Get git diff for the repository
   */
  private async getGitDiff(repoPath: string): Promise<string> {
    try {
      // Get staged and unstaged changes, excluding markdown files
      const { stdout } = await execAsync(
        'git diff HEAD -- . ":(exclude)*.md" ":(exclude)docs/*" 2>/dev/null || git diff -- . ":(exclude)*.md" ":(exclude)docs/*" 2>/dev/null || echo ""',
        {
          cwd: repoPath,
          timeout: 10000,
          maxBuffer: 1024 * 1024, // 1MB
        }
      );

      const diff = stdout.trim();

      if (!diff) {
        // Try to get recent commits if no staged changes
        try {
          const { stdout: logDiff } = await execAsync(
            'git diff HEAD~5..HEAD -- . ":(exclude)*.md" ":(exclude)docs/*" 2>/dev/null || echo ""',
            {
              cwd: repoPath,
              timeout: 10000,
              maxBuffer: 1024 * 1024,
            }
          );
          return logDiff.trim() || 'No changes detected';
        } catch {
          return 'No changes detected';
        }
      }

      // Truncate if too long
      if (diff.length > 50000) {
        return diff.substring(0, 50000) + '\n... [diff truncated]';
      }

      return diff;
    } catch (error) {
      const execError = error as ExecException;
      if (execError.code === 127) {
        return '[Git not available]';
      }
      return `[Git error: ${execError.message}]`;
    }
  }

  /**
   * Get test output (looks for common test result files)
   */
  private async getTestOutput(repoPath: string): Promise<string> {
    // Common test output locations
    const testOutputPaths = [
      'test-results.txt',
      'test-output.txt',
      '.test-results',
      'coverage/lcov-report/index.html',
    ];

    for (const testPath of testOutputPaths) {
      const fullPath = join(repoPath, testPath);
      if (existsSync(fullPath)) {
        try {
          const content = await readFile(fullPath, 'utf-8');
          if (content.length > 10000) {
            return content.substring(0, 10000) + '\n... [truncated]';
          }
          return content;
        } catch {
          continue;
        }
      }
    }

    // Try to run tests and capture output (npm test with timeout)
    // This is risky, so we'll skip for now and just report no output
    return 'No test output available. Consider running tests manually.';
  }

  /**
   * Get recent session output
   */
  private getSessionOutput(sessionId: string): string {
    try {
      const lines = sessionSupervisor.getSessionOutput(sessionId, this.config.sessionOutputLines);
      return lines.join('\n');
    } catch {
      return '[Session output not available]';
    }
  }

  // ==========================================================================
  // Review Execution
  // ==========================================================================

  /**
   * Execute the review using Claude CLI
   */
  private async executeReview(input: ReviewInput, signal: AbortSignal): Promise<ReviewResult> {
    const prompt = generateReviewPrompt(input);

    // Build command
    const args = [
      this.config.claudeCliPath,
      '--print',
      '--dangerously-skip-permissions',
    ];

    if (this.config.model) {
      args.push('--model', this.config.model);
    }

    // Execute with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new ReviewTimeoutError(this.config.timeoutMs));
      }, this.config.timeoutMs);

      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new ReviewerError('Review cancelled', 'REVIEW_CANCELLED'));
      });
    });

    const execPromise = this.executeClaudeCli(args, prompt);

    try {
      const output = await Promise.race([execPromise, timeoutPromise]);
      return parseReviewOutput(output);
    } catch (error) {
      if (error instanceof ReviewTimeoutError || error instanceof ReviewerError) {
        throw error;
      }
      throw new ReviewerError(
        `Review execution failed: ${error instanceof Error ? error.message : String(error)}`,
        'REVIEW_EXECUTION_ERROR'
      );
    }
  }

  /**
   * Execute Claude CLI with prompt using spawn for stdin support
   */
  private executeClaudeCli(args: string[], prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (args.length === 0) {
        reject(new ReviewerError('No command specified', 'CLAUDE_CLI_ERROR'));
        return;
      }

      const [cmd, ...cmdArgs] = args as [string, ...string[]];

      const child = spawn(cmd, cmdArgs, {
        env: {
          ...process.env,
          // Disable interactive features
          CI: 'true',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('error', (error: Error) => {
        if (error.message.includes('ENOENT')) {
          reject(new ClaudeCliNotFoundError());
        } else {
          reject(new ReviewerError(`Claude CLI error: ${error.message}`, 'CLAUDE_CLI_ERROR'));
        }
      });

      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new ReviewerError(
            `Claude CLI exited with code ${code}: ${stderr}`,
            'CLAUDE_CLI_ERROR'
          ));
        }
      });

      // Write prompt to stdin and close it
      child.stdin.write(prompt);
      child.stdin.end();
    });
  }

  // ==========================================================================
  // Result Handling
  // ==========================================================================

  /**
   * Handle the review result - trigger state transition if needed
   */
  private async handleReviewResult(
    sessionId: string,
    ticketId: string,
    result: ReviewResult
  ): Promise<void> {
    switch (result.decision) {
      case 'complete':
        // Move ticket to review state
        try {
          await ticketStateMachine.moveToReview(ticketId, sessionId);

          // Create notification
          await this.createNotification(ticketId, result);
        } catch (error) {
          console.error(`Failed to transition ticket ${ticketId} to review:`, error);
        }
        break;

      case 'not_complete':
        // No state change needed
        break;

      case 'needs_clarification':
        // Create notification for user attention
        await this.createClarificationNotification(ticketId, result);
        break;
    }
  }

  /**
   * Create a notification for completed ticket
   */
  private async createNotification(ticketId: string, result: ReviewResult): Promise<void> {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) return;

    await prisma.notification.create({
      data: {
        type: 'review_ready',
        ticketId,
        message: `Ticket ${ticket.externalId} is ready for review. ${result.reasoning}`,
      },
    });
  }

  /**
   * Create a notification when clarification is needed
   */
  private async createClarificationNotification(ticketId: string, result: ReviewResult): Promise<void> {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) return;

    await prisma.notification.create({
      data: {
        type: 'waiting_input',
        ticketId,
        message: `Ticket ${ticket.externalId} needs clarification: ${result.reasoning}`,
      },
    });
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Check if a review is in progress for a session
   */
  isReviewInProgress(sessionId: string): boolean {
    return this.activeReviews.has(sessionId);
  }

  /**
   * Cancel an active review
   */
  cancelReview(sessionId: string): boolean {
    const controller = this.activeReviews.get(sessionId);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const reviewerSubagent = new ReviewerSubagent();

// Re-export types
export * from './reviewer-subagent-types.js';

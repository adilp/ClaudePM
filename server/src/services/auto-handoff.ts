/**
 * Auto-Handoff Service
 * Automatically handles context handoff when sessions are running low on context
 */

/* global AbortController, AbortSignal */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join } from 'path';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { contextMonitor, type ContextThresholdEvent } from './context-monitor.js';
import { sessionSupervisor } from './session-supervisor.js';
import * as tmux from './tmux.js';
import {
  type AutoHandoffConfig,
  type ActiveHandoff,
  type HandoffState,
  type HandoffReason,
  type HandoffStartedEvent,
  type HandoffCompletedEvent,
  type HandoffFailedEvent,
  type HandoffProgressEvent,
  DEFAULT_AUTO_HANDOFF_CONFIG,
  HandoffInProgressError,
  SessionNotEligibleError,
  HandoffTimeoutError,
  HandoffCancelledError,
  HandoffProjectNotFoundError,
  buildContinuationPrompt,
} from './auto-handoff-types.js';

// ============================================================================
// Auto-Handoff Events Interface
// ============================================================================

/**
 * Event emitter interface for type-safe event handling
 */
export interface AutoHandoffEvents {
  'handoff:started': (event: HandoffStartedEvent) => void;
  'handoff:progress': (event: HandoffProgressEvent) => void;
  'handoff:completed': (event: HandoffCompletedEvent) => void;
  'handoff:failed': (event: HandoffFailedEvent) => void;
  'error': (error: Error, sessionId?: string) => void;
}

// ============================================================================
// Auto-Handoff Service Class
// ============================================================================

/**
 * Auto-Handoff Service manages automatic context handoff between sessions
 *
 * Emits events:
 * - 'handoff:started' - When handoff process begins
 * - 'handoff:progress' - Progress updates during handoff
 * - 'handoff:completed' - When handoff completes successfully
 * - 'handoff:failed' - When handoff fails (session preserved as fallback)
 * - 'error' - General errors
 */
export class AutoHandoff extends EventEmitter {
  /** Configuration */
  private config: AutoHandoffConfig;

  /** Active handoffs by session ID */
  private activeHandoffs: Map<string, ActiveHandoff> = new Map();

  /** Whether the service is running */
  private running: boolean = false;

  /** Bound event handlers for cleanup */
  private handleThreshold: ((event: ContextThresholdEvent) => void) | null = null;

  constructor(config: Partial<AutoHandoffConfig> = {}) {
    super();
    this.config = {
      ...DEFAULT_AUTO_HANDOFF_CONFIG,
      ...config,
      thresholdPercent: env.HANDOFF_THRESHOLD_PERCENT ?? DEFAULT_AUTO_HANDOFF_CONFIG.thresholdPercent,
    };
  }

  // ==========================================================================
  // Lifecycle Management
  // ==========================================================================

  /**
   * Start the auto-handoff service
   */
  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;

    // Subscribe to context threshold events
    this.handleThreshold = (event: ContextThresholdEvent) => {
      void this.onContextThreshold(event);
    };
    contextMonitor.on('context:threshold', this.handleThreshold);
  }

  /**
   * Stop the auto-handoff service
   */
  stop(): void {
    this.running = false;

    // Unsubscribe from context monitor
    if (this.handleThreshold) {
      contextMonitor.off('context:threshold', this.handleThreshold);
      this.handleThreshold = null;
    }

    // Cancel any active handoffs
    for (const [sessionId, handoff] of this.activeHandoffs) {
      handoff.abortController.abort();
      this.activeHandoffs.delete(sessionId);
    }
  }

  /**
   * Check if the service is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Check if a handoff is in progress for a session
   */
  isHandoffInProgress(sessionId: string): boolean {
    return this.activeHandoffs.has(sessionId);
  }

  /**
   * Get active handoff for a session
   */
  getActiveHandoff(sessionId: string): ActiveHandoff | undefined {
    return this.activeHandoffs.get(sessionId);
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Manually trigger a handoff for a session
   */
  async triggerHandoff(sessionId: string): Promise<void> {
    await this.initiateHandoff(sessionId, 'manual');
  }

  /**
   * Cancel an in-progress handoff
   */
  cancelHandoff(sessionId: string): boolean {
    const handoff = this.activeHandoffs.get(sessionId);
    if (!handoff) {
      return false;
    }

    handoff.abortController.abort();
    this.activeHandoffs.delete(sessionId);
    return true;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AutoHandoffConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): AutoHandoffConfig {
    return { ...this.config };
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  /**
   * Handle context threshold event from context monitor
   */
  private async onContextThreshold(event: ContextThresholdEvent): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      await this.initiateHandoff(event.sessionId, 'context_low', event.contextPercent);
    } catch (error) {
      // Log but don't throw - this is an event handler
      this.emit('error', error instanceof Error ? error : new Error(String(error)), event.sessionId);
    }
  }

  // ==========================================================================
  // Handoff Execution
  // ==========================================================================

  /**
   * Initiate a handoff for a session
   */
  private async initiateHandoff(
    sessionId: string,
    reason: HandoffReason,
    contextPercent?: number
  ): Promise<void> {
    // Check if handoff already in progress
    if (this.activeHandoffs.has(sessionId)) {
      throw new HandoffInProgressError(sessionId);
    }

    // Get active session from supervisor
    const activeSession = sessionSupervisor.getActiveSession(sessionId);
    if (!activeSession) {
      throw new SessionNotEligibleError(sessionId, 'Session not found or not running');
    }

    // Only handoff ticket sessions (not ad-hoc)
    if (activeSession.type !== 'ticket') {
      throw new SessionNotEligibleError(sessionId, 'Only ticket sessions are eligible for handoff');
    }

    // Get project to find handoff path
    const project = await prisma.project.findUnique({
      where: { id: activeSession.projectId },
    });

    if (!project) {
      throw new HandoffProjectNotFoundError(activeSession.projectId);
    }

    // Get current context percent if not provided
    const currentContext = contextPercent ?? (
      contextMonitor.isMonitoring(sessionId)
        ? contextMonitor.getSessionContext(sessionId).contextPercent
        : 0
    );

    // Build handoff file path
    const handoffPath = join(project.repoPath, project.handoffPath);

    // Get initial file mtime (for detecting write)
    let initialFileMtime: number | null = null;
    try {
      const stats = await fs.stat(handoffPath);
      initialFileMtime = stats.mtimeMs;
    } catch {
      // File might not exist yet - that's OK
    }

    // Create active handoff record
    const handoff: ActiveHandoff = {
      fromSessionId: sessionId,
      projectId: activeSession.projectId,
      ticketId: activeSession.ticketId,
      handoffPath,
      state: 'idle',
      reason,
      contextAtHandoff: currentContext,
      startedAt: new Date(),
      initialFileMtime,
      abortController: new AbortController(),
    };

    this.activeHandoffs.set(sessionId, handoff);

    // Emit started event
    const startedEvent: HandoffStartedEvent = {
      sessionId,
      projectId: activeSession.projectId,
      ticketId: activeSession.ticketId,
      reason,
      contextPercent: currentContext,
      timestamp: new Date(),
    };
    this.emit('handoff:started', startedEvent);

    // Execute handoff flow
    try {
      await this.executeHandoff(handoff, activeSession.paneId, project);
    } catch (error) {
      await this.handleHandoffFailure(handoff, error);
    }
  }

  /**
   * Execute the handoff flow
   */
  private async executeHandoff(
    handoff: ActiveHandoff,
    paneId: string,
    project: { id: string; repoPath: string; tmuxSession: string; tmuxWindow: string | null }
  ): Promise<void> {
    const { abortController } = handoff;

    // Step 1: Send export command
    this.updateState(handoff, 'exporting', 'Sending export command...');
    this.checkAborted(abortController, handoff.fromSessionId);

    await tmux.sendText(paneId, this.config.exportCommand);

    // Wait for export to be processed
    await this.delay(this.config.exportDelayMs, abortController.signal);

    // Step 2: Wait for handoff file to be written
    this.updateState(handoff, 'waiting_file', 'Waiting for handoff file...');
    await this.waitForHandoffFile(handoff);

    // Step 3: Terminate current session
    this.updateState(handoff, 'terminating', 'Terminating current session...');
    this.checkAborted(abortController, handoff.fromSessionId);

    // Stop the session gracefully
    await sessionSupervisor.stopSession(handoff.fromSessionId, false);

    // Step 4: Create new session
    this.updateState(handoff, 'creating_session', 'Creating new session...');
    this.checkAborted(abortController, handoff.fromSessionId);

    // Get ticket info for continuation prompt
    let ticketExternalId: string | undefined;
    if (handoff.ticketId) {
      const ticket = await prisma.ticket.findUnique({
        where: { id: handoff.ticketId },
        select: { externalId: true },
      });
      ticketExternalId = ticket?.externalId ?? undefined;
    }

    // Create new session with parent ID linking
    const newSession = await prisma.session.create({
      data: {
        projectId: handoff.projectId,
        ticketId: handoff.ticketId,
        parentId: handoff.fromSessionId,
        type: 'ticket',
        status: 'running',
        tmuxPaneId: '', // Will be updated after pane creation
        startedAt: new Date(),
      },
    });

    // Create tmux pane
    const paneOptions: tmux.CreatePaneOptions = {
      cwd: project.repoPath,
      command: 'claude',
    };
    if (project.tmuxWindow !== null) {
      paneOptions.window = project.tmuxWindow;
    }

    const newPaneId = await tmux.createPane(project.tmuxSession, paneOptions);

    // Update session with pane ID
    await prisma.session.update({
      where: { id: newSession.id },
      data: { tmuxPaneId: newPaneId },
    });

    // Step 5: Wait for Claude to start, then send import command
    this.updateState(handoff, 'importing', 'Importing handoff context...');
    this.checkAborted(abortController, handoff.fromSessionId);

    await this.delay(this.config.importDelayMs, abortController.signal);

    // Send import command
    await tmux.sendText(newPaneId, this.config.importCommand);

    // Wait a bit more, then send continuation prompt
    await this.delay(2000, abortController.signal);
    const continuationPrompt = buildContinuationPrompt(handoff.ticketId, ticketExternalId);
    await tmux.sendText(newPaneId, continuationPrompt);

    // Step 6: Record HandoffEvent
    await prisma.handoffEvent.create({
      data: {
        fromSessionId: handoff.fromSessionId,
        toSessionId: newSession.id,
        contextAtHandoff: handoff.contextAtHandoff,
      },
    });

    // Step 7: Complete
    this.updateState(handoff, 'complete', 'Handoff complete');

    const durationMs = Date.now() - handoff.startedAt.getTime();

    // Emit completed event
    const completedEvent: HandoffCompletedEvent = {
      fromSessionId: handoff.fromSessionId,
      toSessionId: newSession.id,
      projectId: handoff.projectId,
      ticketId: handoff.ticketId,
      contextAtHandoff: handoff.contextAtHandoff,
      durationMs,
      timestamp: new Date(),
    };
    this.emit('handoff:completed', completedEvent);

    // Create notification
    await prisma.notification.create({
      data: {
        type: 'handoff_complete',
        sessionId: newSession.id,
        ticketId: handoff.ticketId,
        message: `Handoff complete. New session created with fresh context.`,
      },
    });

    // Cleanup
    this.activeHandoffs.delete(handoff.fromSessionId);
  }

  /**
   * Wait for handoff file to be written (detect modification)
   */
  private async waitForHandoffFile(handoff: ActiveHandoff): Promise<void> {
    const { handoffPath, initialFileMtime, abortController } = handoff;
    const startTime = Date.now();

    while (Date.now() - startTime < this.config.timeoutMs) {
      this.checkAborted(abortController, handoff.fromSessionId);

      try {
        const stats = await fs.stat(handoffPath);

        // Check if file was modified after we started
        if (initialFileMtime === null || stats.mtimeMs > initialFileMtime) {
          // File was created or modified - handoff file is ready
          return;
        }
      } catch {
        // File doesn't exist yet - keep waiting
      }

      // Wait before next poll
      await this.delay(this.config.pollIntervalMs, abortController.signal);
    }

    // Timeout
    throw new HandoffTimeoutError(handoff.fromSessionId, this.config.timeoutMs);
  }

  /**
   * Handle handoff failure - preserve session and notify
   */
  private async handleHandoffFailure(handoff: ActiveHandoff, error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const failedAtState = handoff.state;

    // Determine if session was preserved (only if we didn't terminate it yet)
    const sessionPreserved = handoff.state !== 'terminating' &&
                            handoff.state !== 'creating_session' &&
                            handoff.state !== 'importing';

    // Emit failed event
    const failedEvent: HandoffFailedEvent = {
      sessionId: handoff.fromSessionId,
      projectId: handoff.projectId,
      error: errorMessage,
      failedAtState,
      sessionPreserved,
      timestamp: new Date(),
    };
    this.emit('handoff:failed', failedEvent);

    // Create notification
    await prisma.notification.create({
      data: {
        type: 'error',
        sessionId: handoff.fromSessionId,
        ticketId: handoff.ticketId,
        message: `Handoff failed: ${errorMessage}. ${sessionPreserved ? 'Session preserved.' : 'Session may be in inconsistent state.'}`,
      },
    });

    // Cleanup
    this.activeHandoffs.delete(handoff.fromSessionId);
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Update handoff state and emit progress event
   */
  private updateState(handoff: ActiveHandoff, state: HandoffState, message: string): void {
    handoff.state = state;

    const progressEvent: HandoffProgressEvent = {
      sessionId: handoff.fromSessionId,
      state,
      message,
      timestamp: new Date(),
    };
    this.emit('handoff:progress', progressEvent);
  }

  /**
   * Check if handoff was aborted
   */
  private checkAborted(abortController: AbortController, sessionId: string): void {
    if (abortController.signal.aborted) {
      throw new HandoffCancelledError(sessionId);
    }
  }

  /**
   * Delay with abort signal support
   */
  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);

      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        reject(new HandoffCancelledError('Handoff cancelled'));
      }, { once: true });
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/** Default auto-handoff instance */
export const autoHandoff = new AutoHandoff();

// ============================================================================
// Re-exports
// ============================================================================

export {
  DEFAULT_AUTO_HANDOFF_CONFIG,
  HandoffInProgressError,
  SessionNotEligibleError,
  HandoffTimeoutError,
  HandoffCancelledError,
  HandoffProjectNotFoundError,
  AutoHandoffError,
  buildContinuationPrompt,
} from './auto-handoff-types.js';

export type {
  AutoHandoffConfig,
  ActiveHandoff,
  HandoffState,
  HandoffReason,
  HandoffStartedEvent,
  HandoffCompletedEvent,
  HandoffFailedEvent,
  HandoffProgressEvent,
} from './auto-handoff-types.js';

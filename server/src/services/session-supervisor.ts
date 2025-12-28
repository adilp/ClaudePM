/**
 * Session Supervisor Service
 * Manages Claude Code session lifecycle, monitoring, and output capture
 */

import { EventEmitter } from 'events';
import * as path from 'path';
import { prisma } from '../config/db.js';
import type { Session, SessionStatus, SessionType } from '../generated/prisma/index.js';
import * as tmux from './tmux.js';
import {
  RingBuffer,
  type ActiveSession,
  type StartSessionOptions,
  type StartTicketSessionOptions,
  type SessionStateChangeEvent,
  type SessionOutputEvent,
  type SessionExitEvent,
  type SessionInfo,
  type RecoveredSession,
  type SyncSessionsResult,
  SessionNotFoundError,
  SessionProjectNotFoundError,
  SessionTicketNotFoundError,
  SessionAlreadyRunningError,
  SessionNotRunningError,
  SessionCreationError,
  SessionInputError,
} from './session-supervisor-types.js';
import { waitingDetector } from './waiting-detector.js';

// ============================================================================
// Configuration
// ============================================================================

/** Default output buffer capacity (lines) */
const DEFAULT_OUTPUT_BUFFER_SIZE = 10_000;

/** Polling interval for process monitoring (ms) */
const PROCESS_POLL_INTERVAL = 2_000;

/** Output capture interval (ms) */
const OUTPUT_CAPTURE_INTERVAL = 1_000;

/** Grace period before force killing a session (ms) */
const STOP_GRACE_PERIOD = 5_000;

// ============================================================================
// Session Supervisor Class
// ============================================================================

/**
 * Event emitter interface for type-safe event handling
 */
export interface SessionSupervisorEvents {
  'session:stateChange': (event: SessionStateChangeEvent) => void;
  'session:output': (event: SessionOutputEvent) => void;
  'session:exit': (event: SessionExitEvent) => void;
}

/**
 * Session Supervisor manages Claude Code sessions
 *
 * Emits events:
 * - 'session:stateChange' - When session status changes
 * - 'session:output' - When new output is captured
 * - 'session:exit' - When a session process exits
 */
export class SessionSupervisor extends EventEmitter {
  /** In-memory registry of active sessions */
  private sessions: Map<string, ActiveSession> = new Map();

  /** Process monitoring interval handle */
  private monitoringInterval: ReturnType<typeof setInterval> | null = null;

  /** Output capture interval handle */
  private outputInterval: ReturnType<typeof setInterval> | null = null;

  /** Whether the supervisor is running */
  private running: boolean = false;

  constructor(
    private readonly outputBufferSize: number = DEFAULT_OUTPUT_BUFFER_SIZE
  ) {
    super();
  }

  // ==========================================================================
  // Lifecycle Management
  // ==========================================================================

  /**
   * Start the session supervisor
   * Begins monitoring active sessions and capturing output
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    // Recover existing sessions from database/tmux
    await this.recoverSessions();

    // Start monitoring intervals
    this.startMonitoring();
  }

  /**
   * Stop the session supervisor
   * Stops all monitoring but does not kill sessions
   */
  stop(): void {
    this.running = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.outputInterval) {
      clearInterval(this.outputInterval);
      this.outputInterval = null;
    }
  }

  /**
   * Check if the supervisor is running
   */
  isRunning(): boolean {
    return this.running;
  }

  // ==========================================================================
  // Session Operations
  // ==========================================================================

  /**
   * Start a new ad-hoc session (not associated with a ticket)
   */
  async startSession(options: StartSessionOptions): Promise<Session> {
    return this.startSessionInternal({
      ...options,
      type: 'adhoc',
      ticketId: null,
    });
  }

  /**
   * Start a new session for a specific ticket
   */
  async startTicketSession(options: StartTicketSessionOptions): Promise<Session> {
    // Verify ticket exists
    const ticket = await prisma.ticket.findUnique({
      where: { id: options.ticketId },
    });

    if (!ticket) {
      throw new SessionTicketNotFoundError(options.ticketId);
    }

    // Build initial prompt with ticket context
    const initialPrompt = options.initialPrompt ?? this.buildTicketPrompt(
      ticket.externalId,
      ticket.title,
      ticket.filePath
    );

    return this.startSessionInternal({
      ...options,
      type: 'ticket',
      ticketId: options.ticketId,
      externalTicketId: ticket.externalId,
      initialPrompt,
    });
  }

  /**
   * Stop a running session
   * @param sessionId - Session to stop
   * @param force - If true, force kill immediately without grace period
   */
  async stopSession(sessionId: string, force: boolean = false): Promise<void> {
    const active = this.sessions.get(sessionId);

    // Check in-memory registry first
    if (!active) {
      // Fallback to database check
      const dbSession = await prisma.session.findUnique({
        where: { id: sessionId },
      });

      if (!dbSession) {
        throw new SessionNotFoundError(sessionId);
      }

      if (dbSession.status !== 'running' && dbSession.status !== 'paused') {
        throw new SessionNotRunningError(sessionId, dbSession.status);
      }

      // Session exists in DB but not in memory - try to kill by pane ID
      await this.killPaneGracefully(dbSession.tmuxPaneId, force);

      // Update database
      await this.updateSessionStatus(sessionId, 'completed');
      return;
    }

    if (active.status !== 'running' && active.status !== 'paused') {
      throw new SessionNotRunningError(sessionId, active.status);
    }

    // Kill the pane
    await this.killPaneGracefully(active.paneId, force);

    // Update status
    const previousStatus = active.status;
    active.status = 'completed';

    // Update database
    await this.updateSessionStatus(sessionId, 'completed');

    // Emit state change event
    this.emitStateChange(sessionId, previousStatus, 'completed');

    // Unregister from waiting detector
    waitingDetector.unwatchSession(sessionId);

    // Remove from registry
    this.sessions.delete(sessionId);
  }

  /**
   * Send input to a running session (with Enter key appended)
   */
  async sendInput(sessionId: string, input: string): Promise<void> {
    const paneId = await this.getValidPaneId(sessionId);
    try {
      await tmux.sendText(paneId, input);
    } catch (error) {
      throw new SessionInputError(
        sessionId,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Send raw keys to a running session (no Enter appended)
   * Used for real-time terminal input from web terminal
   * Uses hex encoding to reliably pass escape sequences
   */
  async sendKeys(sessionId: string, keys: string): Promise<void> {
    const paneId = await this.getValidPaneId(sessionId);
    try {
      // Use sendRawKeys which uses hex encoding for reliable escape sequence handling
      await tmux.sendRawKeys(paneId, keys);
    } catch (error) {
      throw new SessionInputError(
        sessionId,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Get valid pane ID for a session, checking both memory and DB
   */
  private async getValidPaneId(sessionId: string): Promise<string> {
    let paneId: string;
    let status: SessionStatus;

    // Check in-memory registry first
    const active = this.sessions.get(sessionId);

    if (active) {
      paneId = active.paneId;
      status = active.status;
    } else {
      // Fall back to database lookup (for sessions created via hooks)
      const dbSession = await prisma.session.findUnique({
        where: { id: sessionId },
      });

      if (!dbSession) {
        throw new SessionNotFoundError(sessionId);
      }

      paneId = dbSession.tmuxPaneId;
      status = dbSession.status;
    }

    if (status !== 'running') {
      throw new SessionInputError(sessionId, `Session is not running (status: ${status})`);
    }

    // Check if it's a placeholder pane ID (from hooks)
    if (paneId === 'claude-code' || !paneId.startsWith('%')) {
      throw new SessionInputError(
        sessionId,
        'Session does not have a valid tmux pane. It may have been created externally.'
      );
    }

    return paneId;
  }

  /**
   * Get session information
   */
  async getSession(sessionId: string): Promise<SessionInfo> {
    // Check in-memory first for status
    const active = this.sessions.get(sessionId);

    // Get from database
    const dbSession = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!dbSession) {
      throw new SessionNotFoundError(sessionId);
    }

    return {
      id: dbSession.id,
      projectId: dbSession.projectId,
      ticketId: dbSession.ticketId,
      type: dbSession.type,
      status: active?.status ?? dbSession.status,
      contextPercent: dbSession.contextPercent,
      paneId: dbSession.tmuxPaneId,
      startedAt: dbSession.startedAt,
      endedAt: dbSession.endedAt,
      createdAt: dbSession.createdAt,
      updatedAt: dbSession.updatedAt,
    };
  }

  /**
   * Get recent output from a session
   */
  getSessionOutput(sessionId: string, lines: number = 100): string[] {
    const active = this.sessions.get(sessionId);

    if (!active) {
      throw new SessionNotFoundError(sessionId);
    }

    return active.outputBuffer.last(lines);
  }

  /**
   * List all active sessions
   */
  listActiveSessions(): ActiveSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * List all sessions from database, optionally filtered by project
   */
  async listSessions(projectId?: string): Promise<SessionInfo[]> {
    const where = projectId ? { projectId } : {};

    const dbSessions = await prisma.session.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100, // Limit to last 100 sessions
    });

    return dbSessions.map((dbSession) => {
      const active = this.sessions.get(dbSession.id);
      return {
        id: dbSession.id,
        projectId: dbSession.projectId,
        ticketId: dbSession.ticketId,
        type: dbSession.type,
        status: active?.status ?? dbSession.status,
        contextPercent: dbSession.contextPercent,
        paneId: dbSession.tmuxPaneId,
        startedAt: dbSession.startedAt,
        endedAt: dbSession.endedAt,
        createdAt: dbSession.createdAt,
        updatedAt: dbSession.updatedAt,
      };
    });
  }

  /**
   * Get active session by ID
   */
  getActiveSession(sessionId: string): ActiveSession | undefined {
    return this.sessions.get(sessionId);
  }

  // ==========================================================================
  // Internal Methods
  // ==========================================================================

  /**
   * Internal session start implementation
   */
  private async startSessionInternal(options: {
    projectId: string;
    type: SessionType;
    ticketId: string | null;
    externalTicketId?: string | null;
    initialPrompt?: string;
    cwd?: string;
  }): Promise<Session> {
    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: options.projectId },
    });

    if (!project) {
      throw new SessionProjectNotFoundError(options.projectId);
    }

    // Verify tmux session exists
    const tmuxSessionExists = await tmux.sessionExists(project.tmuxSession);
    if (!tmuxSessionExists) {
      throw new SessionCreationError(
        `tmux session '${project.tmuxSession}' does not exist`
      );
    }

    // Create pane in the project's tmux session
    let paneId: string;

    // Query ticket if this is a ticket session to determine command
    let ticket: { isAdhoc: boolean; filePath: string; title: string; externalId: string | null } | null = null;
    if (options.ticketId) {
      ticket = await prisma.ticket.findUnique({
        where: { id: options.ticketId },
        select: { isAdhoc: true, filePath: true, title: true, externalId: true },
      });
    }

    // Build the command to start Claude
    // Note: We pass file path in prompt instead of piping, as piping breaks interactive mode
    let claudeCommand: string;
    if (ticket) {
      // Use relative path since cwd is set to project.repoPath
      const ticketPath = ticket.filePath;

      if (ticket.isAdhoc) {
        // Adhoc tickets: summarize and wait for confirmation
        // Note: prompt must come BEFORE --allowedTools, otherwise it's interpreted as a tool name
        claudeCommand = `claude "Read the ticket at ${ticketPath} Explore the the codebase, come up with a solution, and summarize what's being requested. Ask any clarifying questions. Then propose next steps and wait for my confirmation before implementing.

IMPORTANT: When you have completed ALL requirements in the ticket, output exactly on its own line:
---TASK_COMPLETE---
Followed by a brief summary of what was done." --allowedTools Edit Read Write Bash Grep Glob`;
      } else {
        // Regular tickets: implement directly
        // Include completion marker instruction for auto-progression
        // Note: prompt must come BEFORE --allowedTools, otherwise it's interpreted as a tool name
        claudeCommand = `claude "Read the ticket at ${ticketPath} and implement it. The ticket is: ${ticket.title}

IMPORTANT: When you have completed ALL requirements in the ticket, output exactly on its own line:
---TASK_COMPLETE---
Followed by a brief summary of what was done." --allowedTools Edit Read Write Bash Grep Glob`;
      }
    } else {
      // Adhoc sessions without ticket: start claude with optional initial prompt
      // Note: prompt must come BEFORE --allowedTools, otherwise it's interpreted as a tool name
      if (options.initialPrompt) {
        // Escape the prompt for shell usage - replace backslashes and double quotes
        const escapedPrompt = options.initialPrompt
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"');
        claudeCommand = `claude "${escapedPrompt}" --allowedTools Edit Read Write Bash Grep Glob`;
      } else {
        claudeCommand = 'claude --allowedTools Edit Read Write Bash Grep Glob';
      }
    }

    try {
      // Build pane options conditionally for exactOptionalPropertyTypes
      const paneOptions: tmux.CreatePaneOptions = {
        cwd: options.cwd ?? project.repoPath,
        command: claudeCommand,
      };
      if (project.tmuxWindow !== null) {
        paneOptions.window = project.tmuxWindow;
      }

      paneId = await tmux.createPane(project.tmuxSession, paneOptions);
    } catch (error) {
      throw new SessionCreationError(
        `Failed to create tmux pane: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }

    // Get pane info for PID
    const paneInfo = await tmux.getPane(paneId);
    const pid = paneInfo?.pid ?? 0;

    // Create database record
    const session = await prisma.session.create({
      data: {
        projectId: options.projectId,
        ticketId: options.ticketId,
        type: options.type,
        status: 'running',
        tmuxPaneId: paneId,
        startedAt: new Date(),
      },
    });

    // Set pane title for identification
    let paneTitle: string;
    if (ticket?.isAdhoc) {
      // For adhoc tickets: extract slug from filePath (e.g., "docs/adhoc/my-feature.md" -> "my-feature")
      const fileName = path.basename(ticket.filePath, path.extname(ticket.filePath));
      paneTitle = fileName;
    } else if (ticket?.externalId) {
      // Regular ticket: use externalId
      paneTitle = ticket.externalId;
    } else {
      // Adhoc session without ticket
      paneTitle = `adhoc:${session.id.slice(0, 8)}`;
    }

    try {
      await tmux.setPaneTitle(paneId, paneTitle);
    } catch (error) {
      // Non-fatal: log but don't fail session creation
      console.warn(`Failed to set pane title for session ${session.id}:`, error);
    }

    // Add to in-memory registry
    const activeSession: ActiveSession = {
      id: session.id,
      projectId: session.projectId,
      ticketId: session.ticketId,
      type: session.type,
      status: 'running',
      paneId,
      pid,
      startedAt: session.startedAt ?? new Date(),
      outputBuffer: new RingBuffer<string>(this.outputBufferSize),
    };

    this.sessions.set(session.id, activeSession);

    // Register with waiting detector for input detection
    waitingDetector.watchSession(session.id);

    // Note: initialPrompt is no longer used here since we pipe ticket content
    // directly to Claude via the command. The piping approach is more reliable
    // than sending text after a delay.

    // Emit state change
    this.emitStateChange(session.id, 'running', 'running');

    return session;
  }

  /**
   * Build the initial prompt for a ticket session
   */
  private buildTicketPrompt(
    externalId: string | null,
    title: string,
    filePath: string
  ): string {
    const ticketRef = externalId ? `${externalId}: ${title}` : title;
    return `I'm working on ticket ${ticketRef}

Please read the ticket at ${filePath} and begin implementation.`;
  }

  /**
   * Kill a pane gracefully (Ctrl+C first, then force if needed)
   */
  private async killPaneGracefully(paneId: string, force: boolean): Promise<void> {
    const paneAlive = await tmux.isPaneAlive(paneId);
    if (!paneAlive) {
      return;
    }

    if (force) {
      await tmux.killPane(paneId);
      return;
    }

    // Send Ctrl+C first
    try {
      await tmux.sendInterrupt(paneId);
    } catch {
      // Pane might already be dead
    }

    // Wait for grace period
    await new Promise((resolve) => setTimeout(resolve, STOP_GRACE_PERIOD));

    // Check if still alive and force kill
    const stillAlive = await tmux.isPaneAlive(paneId);
    if (stillAlive) {
      await tmux.killPane(paneId);
    }
  }

  /**
   * Update session status in database
   */
  private async updateSessionStatus(
    sessionId: string,
    status: SessionStatus,
    _error?: string
  ): Promise<void> {
    const updateData: {
      status: SessionStatus;
      endedAt?: Date;
    } = { status };

    if (status === 'completed' || status === 'error') {
      updateData.endedAt = new Date();
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: updateData,
    });
  }

  /**
   * Emit a state change event
   */
  private emitStateChange(
    sessionId: string,
    previousStatus: SessionStatus,
    newStatus: SessionStatus,
    error?: string
  ): void {
    const event: SessionStateChangeEvent = {
      sessionId,
      previousStatus,
      newStatus,
      timestamp: new Date(),
    };

    if (error !== undefined) {
      event.error = error;
    }

    this.emit('session:stateChange', event);
  }

  // ==========================================================================
  // Monitoring
  // ==========================================================================

  /**
   * Start monitoring intervals
   */
  private startMonitoring(): void {
    // Process monitoring
    this.monitoringInterval = setInterval(() => {
      this.checkProcesses().catch((error) => {
        console.error('Error checking processes:', error);
      });
    }, PROCESS_POLL_INTERVAL);

    // Output capture
    this.outputInterval = setInterval(() => {
      this.captureOutput().catch((error) => {
        console.error('Error capturing output:', error);
      });
    }, OUTPUT_CAPTURE_INTERVAL);
  }

  /**
   * Check if session processes are still alive
   */
  private async checkProcesses(): Promise<void> {
    for (const [sessionId, session] of this.sessions) {
      if (session.status !== 'running') {
        continue;
      }

      const isAlive = await tmux.isPaneAlive(session.paneId);

      if (!isAlive) {
        // Process has exited
        const previousStatus = session.status;
        session.status = 'completed';

        // Update database
        await this.updateSessionStatus(sessionId, 'completed');

        // Emit events
        this.emitStateChange(sessionId, previousStatus, 'completed');

        const exitEvent: SessionExitEvent = {
          sessionId,
          exitCode: null, // We don't have access to exit code from tmux
          normal: true,
          timestamp: new Date(),
        };
        this.emit('session:exit', exitEvent);

        // Unregister from waiting detector
        waitingDetector.unwatchSession(sessionId);

        // Remove from registry
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Simple hash function for output deduplication
   */
  private hashOutput(output: string): string {
    let hash = 0;
    for (let i = 0; i < output.length; i++) {
      const char = output.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * Capture output from all active sessions
   */
  private async captureOutput(): Promise<void> {
    // Also check DB for running sessions not in memory
    const dbSessions = await prisma.session.findMany({
      where: { status: 'running' },
      select: { id: true, tmuxPaneId: true },
    });

    for (const dbSession of dbSessions) {
      // Skip if already in memory or has placeholder pane ID
      if (this.sessions.has(dbSession.id)) continue;
      if (dbSession.tmuxPaneId === 'claude-code' || !dbSession.tmuxPaneId.startsWith('%')) continue;

      // Check if pane is alive and add to tracking
      const isAlive = await tmux.isPaneAlive(dbSession.tmuxPaneId);
      if (isAlive) {
        console.log(`[SessionSupervisor] Adding DB session to memory tracking: ${dbSession.id}`);
        const activeSession: ActiveSession = {
          id: dbSession.id,
          projectId: '',
          ticketId: null,
          type: 'adhoc',
          status: 'running',
          paneId: dbSession.tmuxPaneId,
          pid: 0,
          startedAt: new Date(),
          outputBuffer: new RingBuffer<string>(this.outputBufferSize),
        };
        this.sessions.set(dbSession.id, activeSession);
      }
    }

    for (const [sessionId, session] of this.sessions) {
      if (session.status !== 'running') {
        continue;
      }

      try {
        // Capture last 100 lines
        const output = await tmux.capturePane(session.paneId, {
          lines: 100,
          stripAnsi: false, // Keep ANSI codes for raw output
        });

        // Check if output has changed
        const outputHash = this.hashOutput(output);
        if (outputHash === session.lastOutputHash) {
          // No change, skip
          continue;
        }
        session.lastOutputHash = outputHash;

        const lines = output.split('\n');
        session.outputBuffer.pushMany(lines);

        // Emit output event if we have content
        if (lines.length > 0) {
          console.log(`[SessionSupervisor] Emitting output for session ${sessionId}, ${lines.length} lines`);
          const event: SessionOutputEvent = {
            sessionId,
            lines,
            raw: true,
          };
          this.emit('session:output', event);
        }
      } catch (error) {
        // Pane might have died between check and capture
        console.error(`Failed to capture output for session ${sessionId}:`, error);
      }
    }
  }

  // ==========================================================================
  // Recovery
  // ==========================================================================

  /**
   * Recover session state from database and tmux on startup
   */
  async recoverSessions(): Promise<RecoveredSession[]> {
    const recovered: RecoveredSession[] = [];

    // Find all sessions marked as running/paused in database
    const dbSessions = await prisma.session.findMany({
      where: {
        status: { in: ['running', 'paused'] },
      },
    });

    for (const dbSession of dbSessions) {
      const paneAlive = await tmux.isPaneAlive(dbSession.tmuxPaneId);
      const paneInfo = paneAlive ? await tmux.getPane(dbSession.tmuxPaneId) : null;

      const recoveryInfo: RecoveredSession = {
        sessionId: dbSession.id,
        paneId: dbSession.tmuxPaneId,
        isAlive: paneAlive,
        pid: paneInfo?.pid ?? null,
      };

      recovered.push(recoveryInfo);

      if (paneAlive && paneInfo) {
        // Restore to in-memory registry
        const activeSession: ActiveSession = {
          id: dbSession.id,
          projectId: dbSession.projectId,
          ticketId: dbSession.ticketId,
          type: dbSession.type,
          status: dbSession.status,
          paneId: dbSession.tmuxPaneId,
          pid: paneInfo.pid,
          startedAt: dbSession.startedAt ?? new Date(),
          outputBuffer: new RingBuffer<string>(this.outputBufferSize),
        };

        this.sessions.set(dbSession.id, activeSession);

        // Register with waiting detector for input detection
        waitingDetector.watchSession(dbSession.id);
      } else {
        // Pane is dead but session was marked running - update to completed
        await this.updateSessionStatus(dbSession.id, 'completed');
      }
    }

    return recovered;
  }

  /**
   * Sync session state with tmux - find and clean up orphaned sessions
   * This can be called at any time to ensure database state matches tmux reality
   */
  async syncSessions(projectId?: string): Promise<SyncSessionsResult> {
    const result: SyncSessionsResult = {
      orphanedSessions: [],
      aliveSessions: [],
      totalChecked: 0,
    };

    // Find all sessions marked as running/paused
    const statusFilter: SessionStatus[] = ['running', 'paused'];
    const dbSessions = await prisma.session.findMany({
      where: {
        status: { in: statusFilter },
        ...(projectId && { projectId }),
      },
    });

    result.totalChecked = dbSessions.length;

    for (const dbSession of dbSessions) {
      const isAlive = await tmux.isPaneAlive(dbSession.tmuxPaneId);
      const paneTitle = isAlive ? await tmux.getPaneTitle(dbSession.tmuxPaneId) : null;

      if (isAlive) {
        result.aliveSessions.push({
          sessionId: dbSession.id,
          paneId: dbSession.tmuxPaneId,
          paneTitle,
        });
      } else {
        // Pane is dead - mark session as completed
        await this.updateSessionStatus(dbSession.id, 'completed');

        // Remove from in-memory registry if present
        const active = this.sessions.get(dbSession.id);
        if (active) {
          waitingDetector.unwatchSession(dbSession.id);
          this.sessions.delete(dbSession.id);

          // Emit state change
          this.emitStateChange(dbSession.id, active.status, 'completed');
        }

        result.orphanedSessions.push({
          sessionId: dbSession.id,
          paneId: dbSession.tmuxPaneId,
          paneTitle: null, // Pane is gone, no title available
        });
      }
    }

    return result;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/** Default session supervisor instance */
export const sessionSupervisor = new SessionSupervisor();

// ============================================================================
// Re-exports
// ============================================================================

export {
  RingBuffer,
  SessionNotFoundError,
  SessionProjectNotFoundError,
  SessionTicketNotFoundError,
  SessionAlreadyRunningError,
  SessionNotRunningError,
  SessionCreationError,
  SessionInputError,
} from './session-supervisor-types.js';

export type {
  ActiveSession,
  StartSessionOptions,
  StartTicketSessionOptions,
  SessionStateChangeEvent,
  SessionOutputEvent,
  SessionExitEvent,
  SessionInfo,
  RecoveredSession,
} from './session-supervisor-types.js';

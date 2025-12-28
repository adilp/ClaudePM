/**
 * PTY Manager Service
 * Manages pseudo-terminal connections for web-based terminal emulation
 * Uses node-pty for true PTY support with tmux sessions
 *
 * Note: node-pty may not work correctly when Node.js runs under Rosetta
 * on Apple Silicon. In that case, check ptyManager.isAvailable().
 */

import * as pty from 'node-pty';
import { EventEmitter } from 'events';
import { prisma } from '../config/db.js';
import * as tmux from './tmux.js';

// ============================================================================
// Availability Check
// ============================================================================

let ptyAvailable: boolean | null = null;
let ptyUnavailableReason: string | null = null;

/**
 * Check if node-pty is available and working on this system
 */
function checkPtyAvailability(): boolean {
  if (ptyAvailable !== null) {
    return ptyAvailable;
  }

  try {
    // Try to spawn a simple process to test node-pty
    const testProcess = pty.spawn('/bin/echo', ['test'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
    });
    testProcess.kill();
    ptyAvailable = true;
    console.log('[PtyManager] node-pty is available');
    return true;
  } catch (error) {
    ptyAvailable = false;
    ptyUnavailableReason = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`[PtyManager] node-pty is NOT available: ${ptyUnavailableReason}`);
    console.warn('[PtyManager] This often happens when Node.js runs under Rosetta on Apple Silicon.');
    console.warn('[PtyManager] Falling back to hex-encoding method for terminal input.');
    return false;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface PtyConnection {
  /** Unique connection ID (usually WebSocket connection ID) */
  connectionId: string;
  /** Session ID this PTY is attached to */
  sessionId: string;
  /** The tmux pane ID */
  paneId: string;
  /** The node-pty process */
  ptyProcess: pty.IPty;
  /** Terminal dimensions */
  cols: number;
  rows: number;
  /** Creation timestamp */
  createdAt: Date;
}

export interface PtyDataEvent {
  connectionId: string;
  sessionId: string;
  data: string;
}

export interface PtyExitEvent {
  connectionId: string;
  sessionId: string;
  exitCode: number;
  signal?: number;
}

export interface AttachOptions {
  /** Number of columns (default: 80) */
  cols?: number;
  /** Number of rows (default: 24) */
  rows?: number;
}

// ============================================================================
// Errors
// ============================================================================

export class PtyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PtyError';
  }
}

export class PtySessionNotFoundError extends PtyError {
  constructor(public readonly sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = 'PtySessionNotFoundError';
  }
}

export class PtyInvalidPaneError extends PtyError {
  constructor(public readonly sessionId: string, public readonly paneId: string) {
    super(`Session ${sessionId} has invalid pane ID: ${paneId}`);
    this.name = 'PtyInvalidPaneError';
  }
}

export class PtyAlreadyAttachedError extends PtyError {
  constructor(public readonly connectionId: string, public readonly sessionId: string) {
    super(`Connection ${connectionId} is already attached to session ${sessionId}`);
    this.name = 'PtyAlreadyAttachedError';
  }
}

export class PtyNotAttachedError extends PtyError {
  constructor(public readonly connectionId: string) {
    super(`Connection ${connectionId} is not attached to any session`);
    this.name = 'PtyNotAttachedError';
  }
}

// ============================================================================
// PTY Manager Class
// ============================================================================

/**
 * PTY Manager handles pseudo-terminal connections for web terminals
 *
 * Emits events:
 * - 'pty:data' - When data is received from PTY (terminal output)
 * - 'pty:exit' - When PTY process exits
 */
export class PtyManager extends EventEmitter {
  /** Map of connection ID to PTY connection */
  private connections: Map<string, PtyConnection> = new Map();

  /** Default terminal dimensions */
  private defaultCols = 80;
  private defaultRows = 24;

  constructor() {
    super();
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Check if PTY functionality is available on this system
   * Returns false on Rosetta/x86_64 Node on Apple Silicon
   */
  isAvailable(): boolean {
    return checkPtyAvailability();
  }

  /**
   * Get the reason PTY is unavailable (if applicable)
   */
  getUnavailableReason(): string | null {
    return ptyUnavailableReason;
  }

  /**
   * Attach a connection to a session's tmux pane via PTY
   * This spawns a `tmux attach-session` process that provides true terminal emulation
   */
  async attach(
    connectionId: string,
    sessionId: string,
    options: AttachOptions = {}
  ): Promise<PtyConnection> {
    // Check if already attached
    if (this.connections.has(connectionId)) {
      const existing = this.connections.get(connectionId)!;
      throw new PtyAlreadyAttachedError(connectionId, existing.sessionId);
    }

    // Get session from database
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new PtySessionNotFoundError(sessionId);
    }

    const paneId = session.tmuxPaneId;

    // Validate pane ID (must start with % for real tmux panes)
    if (!paneId || paneId === 'claude-code' || !paneId.startsWith('%')) {
      throw new PtyInvalidPaneError(sessionId, paneId);
    }

    // Verify pane is alive
    const isAlive = await tmux.isPaneAlive(paneId);
    if (!isAlive) {
      throw new PtyError(`Pane ${paneId} is not alive`);
    }

    // Get the session name for the pane
    const paneInfo = await tmux.getPane(paneId);
    if (!paneInfo) {
      throw new PtyError(`Could not get pane info for ${paneId}`);
    }

    // Get the actual pane dimensions - use these instead of requested dimensions
    // This ensures the PTY matches what tmux is actually rendering
    const paneDims = await tmux.getPaneDimensions(paneId);
    const cols = paneDims?.cols ?? options.cols ?? this.defaultCols;
    const rows = paneDims?.rows ?? options.rows ?? this.defaultRows;

    console.log(`[PtyManager] Pane ${paneId} actual dimensions: ${cols}x${rows} (requested: ${options.cols}x${options.rows})`);

    // Attach directly to the tmux session containing this pane
    // This gives native terminal behavior - keyboard, scrolling, etc.
    // Note: This will affect the user's actual tmux view
    console.log(`[PtyManager] Attaching to tmux session for pane ${paneId}`);

    const tmuxPath = process.env.TMUX_PATH ?? '/usr/local/bin/tmux';

    // Select the pane first, then attach - ensures we're viewing the right pane
    const ptyProcess = pty.spawn('/bin/bash', ['-c', `${tmuxPath} select-pane -t ${paneId} \\; attach-session -t ${paneId}`], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.cwd(),
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        PATH: `${process.env.PATH ?? ''}:/usr/local/bin:/usr/bin:/bin`,
      },
    });

    const connection: PtyConnection = {
      connectionId,
      sessionId,
      paneId,
      ptyProcess,
      cols,
      rows,
      createdAt: new Date(),
    };

    // Set up event handlers
    ptyProcess.onData((data: string) => {
      const event: PtyDataEvent = {
        connectionId,
        sessionId,
        data,
      };
      this.emit('pty:data', event);
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      const event: PtyExitEvent = {
        connectionId,
        sessionId,
        exitCode,
      };
      if (signal !== undefined) {
        event.signal = signal;
      }
      this.emit('pty:exit', event);

      // Clean up connection
      this.connections.delete(connectionId);
      console.log(`[PtyManager] PTY exited for connection ${connectionId}, exit code: ${exitCode}`);
    });

    // Store connection
    this.connections.set(connectionId, connection);

    console.log(`[PtyManager] Attached connection ${connectionId} to session ${sessionId} (pane ${paneId}), ${cols}x${rows}`);

    return connection;
  }

  /**
   * Detach a connection from its PTY
   */
  detach(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return; // Already detached, ignore
    }

    try {
      // Kill the PTY process
      connection.ptyProcess.kill();
    } catch (error) {
      console.warn(`[PtyManager] Error killing PTY for connection ${connectionId}:`, error);
    }

    this.connections.delete(connectionId);
    console.log(`[PtyManager] Detached connection ${connectionId}`);
  }

  /**
   * Write data to a connection's PTY (send input)
   */
  write(connectionId: string, data: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new PtyNotAttachedError(connectionId);
    }

    connection.ptyProcess.write(data);
  }

  /**
   * Resize a connection's PTY
   */
  resize(connectionId: string, cols: number, rows: number): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new PtyNotAttachedError(connectionId);
    }

    connection.ptyProcess.resize(cols, rows);
    connection.cols = cols;
    connection.rows = rows;

    console.log(`[PtyManager] Resized connection ${connectionId} to ${cols}x${rows}`);
  }

  /**
   * Get a connection by ID
   */
  getConnection(connectionId: string): PtyConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Check if a connection is attached
   */
  isAttached(connectionId: string): boolean {
    return this.connections.has(connectionId);
  }

  /**
   * Get all connections for a session
   */
  getSessionConnections(sessionId: string): PtyConnection[] {
    return Array.from(this.connections.values()).filter(
      (conn) => conn.sessionId === sessionId
    );
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Detach all connections (cleanup)
   */
  detachAll(): void {
    for (const connectionId of this.connections.keys()) {
      this.detach(connectionId);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const ptyManager = new PtyManager();
